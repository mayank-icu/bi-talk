'use strict';
require('dotenv').config();

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const multer = require('multer');
const fetch = require('node-fetch');
const path = require('path');
const FormData = require('form-data');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const TURN_URL = process.env.TURN_URL;
const TURN_USERNAME = process.env.TURN_USERNAME;
const TURN_CREDENTIAL = process.env.TURN_CREDENTIAL;

const WHISPER_MODEL = process.env.WHISPER_MODEL || 'whisper-large-v3-turbo';
const LLAMA_MODEL = process.env.LLAMA_MODEL || 'llama-3.3-70b-versatile';

if (!GROQ_API_KEY) {
  console.error('❌  GROQ_API_KEY is not set. Please add it to your .env file.');
  process.exit(1);
}

// ─── Static files ────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.json());

// ─── GET /api/ice-servers ─────────────────────────────────────────────────────
// Exposes STUN/TURN server configuration read from process.env dynamically
app.get('/api/ice-servers', (req, res) => {
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
  ];

  if (TURN_URL && TURN_USERNAME && TURN_CREDENTIAL) {
    iceServers.push({
      urls: TURN_URL,
      username: TURN_USERNAME,
      credential: TURN_CREDENTIAL,
    });
    if (TURN_URL.startsWith('turn:')) {
      const turnsUrl = TURN_URL.replace(/^turn:/, 'turns:').replace(/:\d+$/, ':443?transport=tcp');
      iceServers.push({
        urls: turnsUrl,
        username: TURN_USERNAME,
        credential: TURN_CREDENTIAL,
      });
    }
  }

  res.json({ iceServers });
});

// ─── HTTP Signaling for Serverless / Netlify Fallback ─────────────────────────
const httpRooms = new Map();

app.post('/api/signal/join', (req, res) => {
  const { room } = req.body || {};
  if (!room) return res.status(400).json({ error: 'No room code provided' });

  if (!httpRooms.has(room)) {
    httpRooms.set(room, { peers: new Map() });
  }

  const roomData = httpRooms.get(room);
  if (roomData.peers.size >= 2) {
    return res.status(400).json({ error: 'Room is full (max 2 users)' });
  }

  const peerId = 'peer_' + Math.random().toString(36).substring(2, 9);
  const isOfferer = roomData.peers.size === 0;
  const role = isOfferer ? 'offerer' : 'answerer';

  roomData.peers.set(peerId, {
    role,
    lastPoll: Date.now(),
    messages: [{ type: 'role', role }],
  });

  if (roomData.peers.size === 2) {
    for (const p of roomData.peers.values()) {
      p.messages.push({ type: 'ready' });
    }
  }

  return res.json({ peerId, role, ready: roomData.peers.size === 2 });
});

app.post('/api/signal/send', (req, res) => {
  const { room, peerId, message } = req.body || {};
  if (!room || !peerId || !message) return res.status(400).json({ error: 'Missing parameters' });

  const roomData = httpRooms.get(room);
  if (!roomData) return res.status(404).json({ error: 'Room not found' });

  for (const [pId, peer] of roomData.peers.entries()) {
    if (pId !== peerId) {
      peer.messages.push(message);
    }
  }

  return res.json({ success: true });
});

app.get('/api/signal/poll', (req, res) => {
  const { room, peerId } = req.query || {};
  if (!room || !peerId) return res.status(400).json({ error: 'Missing room or peerId' });

  const roomData = httpRooms.get(room);
  if (!roomData || !roomData.peers.has(peerId)) {
    return res.json({ messages: [] });
  }

  const peer = roomData.peers.get(peerId);
  peer.lastPoll = Date.now();
  const msgs = peer.messages;
  peer.messages = [];

  return res.json({ messages: msgs });
});

app.post('/api/signal/leave', (req, res) => {
  const { room, peerId } = req.body || {};
  if (room && peerId && httpRooms.has(room)) {
    const roomData = httpRooms.get(room);
    roomData.peers.delete(peerId);
    for (const peer of roomData.peers.values()) {
      peer.messages.push({ type: 'peer-disconnected' });
    }
    if (roomData.peers.size === 0) httpRooms.delete(room);
  }
  return res.json({ success: true });
});

// ─── Multer (memory storage for audio blobs) ─────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
});

// ─── WebSocket Signaling ──────────────────────────────────────────────────────
// rooms: Map<roomCode, [ws1, ws2]>
const rooms = new Map();

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://localhost`);
  const room = url.searchParams.get('room');

  if (!room) {
    ws.close(4000, 'No room code provided');
    return;
  }

  if (!rooms.has(room)) {
    rooms.set(room, []);
  }

  const peers = rooms.get(room);

  if (peers.length >= 2) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room is full (max 2 users)' }));
    ws.close(4001, 'Room full');
    return;
  }

  peers.push(ws);
  const isOfferer = peers.length === 1;

  console.log(`[Room ${room}] Peer ${isOfferer ? '1 (offerer)' : '2 (answerer)'} connected`);

  // Tell this peer its role
  ws.send(JSON.stringify({ type: 'role', role: isOfferer ? 'offerer' : 'answerer' }));

  // If both peers are present, tell both to start
  if (peers.length === 2) {
    peers.forEach(peer => peer.send(JSON.stringify({ type: 'ready' })));
    console.log(`[Room ${room}] Both peers connected — signaling ready`);
  }

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    // Forward offer/answer/ice to the OTHER peer in the room
    const other = peers.find(p => p !== ws && p.readyState === WebSocket.OPEN);
    if (other) {
      other.send(JSON.stringify(msg));
    }
  });

  ws.on('close', () => {
    console.log(`[Room ${room}] A peer disconnected`);
    const idx = peers.indexOf(ws);
    if (idx !== -1) peers.splice(idx, 1);

    // Notify remaining peer
    const remaining = peers.find(p => p.readyState === WebSocket.OPEN);
    if (remaining) {
      remaining.send(JSON.stringify({ type: 'peer-disconnected' }));
    }

    if (peers.length === 0) {
      rooms.delete(room);
      console.log(`[Room ${room}] Room closed`);
    }
  });

  ws.on('error', (err) => {
    console.error(`[Room ${room}] WebSocket error:`, err.message);
  });
});

// ─── POST /api/transcribe ─────────────────────────────────────────────────────
// Receives: multipart/form-data with `audio` file + `language` field
// Returns: { text: string }
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const language = req.body.language || 'en'; // 'en' or 'zh'

    const form = new FormData();
    form.append('file', req.file.buffer, {
      filename: `audio.webm`,
      contentType: req.file.mimetype || 'audio/webm',
    });
    form.append('model', WHISPER_MODEL);
    form.append('language', language);
    form.append('response_format', 'json');

    const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        ...form.getHeaders(),
      },
      body: form,
    });

    if (!groqRes.ok) {
      const errBody = await groqRes.text();
      console.error('[Transcribe] Groq error:', groqRes.status, errBody);
      return res.status(groqRes.status).json({
        error: `Groq API error: ${groqRes.status}`,
        details: errBody,
      });
    }

    const data = await groqRes.json();
    return res.json({ text: data.text || '' });

  } catch (err) {
    console.error('[Transcribe] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error during transcription' });
  }
});

// ─── POST /api/translate ──────────────────────────────────────────────────────
// Receives: { text: string, from: 'en'|'zh', to: 'en'|'zh' }
// Returns: { translation: string }
app.post('/api/translate', async (req, res) => {
  try {
    const { text, from, to } = req.body;

    if (!text || !from || !to) {
      return res.status(400).json({ error: 'Missing text, from, or to fields' });
    }

    if (!text.trim()) {
      return res.json({ translation: '' });
    }

    const langNames = { en: 'English', zh: 'Chinese (Simplified Mandarin, natural conversational style)' };
    const fromName = langNames[from] || from;
    const toName = langNames[to] || to;

    const systemPrompt = `You are an expert real-time interpreter performing live spoken translation between ${fromName} and ${toName}.
Translate the input accurately, fluently, and naturally into spoken, idiomatic ${toName}.
For Chinese, use natural, authentic modern Mandarin phrasing (口语化, 地道) rather than literal, word-for-word translation.
Do NOT include any commentary, explanations, quotes, or original text. Output ONLY the final translated sentence.`;

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: LLAMA_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        temperature: 0.2,
        max_tokens: 512,
      }),
    });

    if (!groqRes.ok) {
      const errBody = await groqRes.text();
      console.error('[Translate] Groq error:', groqRes.status, errBody);
      return res.status(groqRes.status).json({
        error: `Groq API error: ${groqRes.status}`,
        details: errBody,
      });
    }

    const data = await groqRes.json();
    const translation = data.choices?.[0]?.message?.content?.trim() || '';
    return res.json({ translation });

  } catch (err) {
    console.error('[Translate] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error during translation' });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`\n🌐  Bilingual Call App running at http://localhost:${PORT}`);
    console.log(`📡  WebSocket signaling ready at ws://localhost:${PORT}/ws`);
    console.log(`\n  Share your local IP for same-network access,`);
    console.log(`  or use: npx ngrok http ${PORT}  for cross-network access.\n`);
  });
}

module.exports = { app, server };
