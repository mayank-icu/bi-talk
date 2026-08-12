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

// ─── Static files & middleware ────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.json());

// Create API Router for flexible path mounting (works on local Express & Netlify Functions)
const apiRouter = express.Router();

// ─── GET /ice-servers ─────────────────────────────────────────────────────────
apiRouter.get('/ice-servers', (req, res) => {
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
// Uses Upstash Redis (HTTP-based) for persistent shared state across serverless invocations.
// Falls back to in-memory Map for local development when UPSTASH env vars aren't set.
const { Redis } = require('@upstash/redis');

const memoryRooms = new Map();

let _redis = null;
function getRedis() {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    _redis = new Redis({ url, token });
    console.log('[RoomStore] Connected to Upstash Redis REST storage');
    return _redis;
  }
  console.log('[RoomStore] Upstash credentials not set — using in-memory Map fallback');
  return null;
}

const ROOM_TTL_SECONDS = 300; // auto-expire rooms after 5 min of inactivity

async function getRoomData(room) {
  const redis = getRedis();
  if (redis) {
    try {
      let data = await redis.get(`room:${room}`);
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch {}
      }
      return data || null;
    } catch (e) {
      console.warn('[RoomStore] Redis get error:', e.message);
    }
  }
  return memoryRooms.get(room) || null;
}

async function saveRoomData(room, data) {
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(`room:${room}`, data, { ex: ROOM_TTL_SECONDS });
      return;
    } catch (e) {
      console.warn('[RoomStore] Redis set error:', e.message);
    }
  }
  memoryRooms.set(room, data);
}

async function deleteRoomData(room) {
  const redis = getRedis();
  if (redis) {
    try {
      await redis.del(`room:${room}`);
      return;
    } catch (e) {
      console.warn('[RoomStore] Redis del error:', e.message);
    }
  }
  memoryRooms.delete(room);
}

apiRouter.post('/signal/join', async (req, res) => {
  try {
    const { room } = req.body || {};
    if (!room) return res.status(400).json({ error: 'No room code provided' });

    let roomData = await getRoomData(room);
    if (!roomData || !roomData.peers) {
      roomData = { peers: {} };
    }

    const peerKeys = Object.keys(roomData.peers);
    console.log(`[Signal Join] Room: ${room}, Current peers count: ${peerKeys.length}`);

    if (peerKeys.length >= 2) {
      console.warn(`[Signal Join] Room ${room} is full (max 2 users)`);
      return res.status(400).json({ error: 'Room is full (max 2 users)' });
    }

    const peerId = 'peer_' + Math.random().toString(36).substring(2, 9);
    const isOfferer = peerKeys.length === 0;
    const role = isOfferer ? 'offerer' : 'answerer';

    roomData.peers[peerId] = {
      role,
      lastPoll: Date.now(),
      messages: [{ type: 'role', role }],
    };

    const newPeerKeys = Object.keys(roomData.peers);
    if (newPeerKeys.length === 2) {
      console.log(`[Signal Join] Room: ${room} now has 2 peers — queuing 'ready' signal for both`);
      for (const pId of newPeerKeys) {
        roomData.peers[pId].messages.push({ type: 'ready' });
      }
    }

    await saveRoomData(room, roomData);
    console.log(`[Signal Join] Assigned peerId: ${peerId}, role: ${role}, ready: ${newPeerKeys.length === 2}`);

    return res.json({ peerId, role, ready: newPeerKeys.length === 2, storage: getRedis() ? 'redis' : 'memory' });
  } catch (err) {
    console.error('[Signal Join Error]', err);
    return res.status(500).json({ error: 'Internal error during room join' });
  }
});

apiRouter.post('/signal/send', async (req, res) => {
  try {
    const { room, peerId, message } = req.body || {};
    if (!room || !peerId || !message) return res.status(400).json({ error: 'Missing parameters' });

    const roomData = await getRoomData(room);
    if (!roomData || !roomData.peers) {
      console.warn(`[Signal Send] Room ${room} not found in store for peer ${peerId}`);
      return res.status(404).json({ error: 'Room not found' });
    }

    console.log(`[Signal Send] Room: ${room}, From: ${peerId}, Message Type: ${message.type}`);
    for (const pId in roomData.peers) {
      if (pId !== peerId) {
        roomData.peers[pId].messages.push(message);
      }
    }

    await saveRoomData(room, roomData);

    return res.json({ success: true });
  } catch (err) {
    console.error('[Signal Send Error]', err);
    return res.status(500).json({ error: 'Internal error during signal send' });
  }
});

apiRouter.get('/signal/poll', async (req, res) => {
  try {
    const { room, peerId } = req.query || {};
    if (!room || !peerId) return res.status(400).json({ error: 'Missing room or peerId' });

    const roomData = await getRoomData(room);
    if (!roomData || !roomData.peers || !roomData.peers[peerId]) {
      return res.json({ messages: [] });
    }

    const peer = roomData.peers[peerId];
    peer.lastPoll = Date.now();
    const msgs = peer.messages || [];
    peer.messages = [];

    if (msgs.length > 0) {
      console.log(`[Signal Poll] Room: ${room}, Peer: ${peerId} pulled ${msgs.length} msg(s): ${msgs.map(m => m.type).join(', ')}`);
      await saveRoomData(room, roomData);
    }

    return res.json({ messages: msgs });
  } catch (err) {
    console.error('[Signal Poll Error]', err);
    return res.status(500).json({ error: 'Internal error during signal poll' });
  }
});

apiRouter.post('/signal/leave', async (req, res) => {
  try {
    const { room, peerId } = req.body || {};
    if (room && peerId) {
      const roomData = await getRoomData(room);
      if (roomData && roomData.peers && roomData.peers[peerId]) {
        delete roomData.peers[peerId];
        const remainingPeerKeys = Object.keys(roomData.peers);
        if (remainingPeerKeys.length === 0) {
          await deleteRoomData(room);
        } else {
          for (const pId of remainingPeerKeys) {
            roomData.peers[pId].messages.push({ type: 'peer-disconnected' });
          }
          await saveRoomData(room, roomData);
        }
      }
    }
    return res.json({ success: true });
  } catch (err) {
    return res.json({ success: true });
  }
});

// ─── Multer (memory storage for audio blobs) ─────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
});

// ─── POST /transcribe ─────────────────────────────────────────────────────────
apiRouter.post('/transcribe', upload.single('audio'), async (req, res) => {
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

// ─── POST /translate ──────────────────────────────────────────────────────────
apiRouter.post('/translate', async (req, res) => {
  try {
    const { text, from, to } = req.body || {};

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

// Local Express: routes are at /api/* (browser calls /api/signal/send)
// Netlify Functions: Netlify redirect strips /api prefix, function receives /signal/send
// So we mount on BOTH so it works in both environments.
app.use('/api', apiRouter);  // local dev & any direct /api/* calls
app.use('/', apiRouter);     // Netlify: receives path without /api prefix

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

  ws.send(JSON.stringify({ type: 'role', role: isOfferer ? 'offerer' : 'answerer' }));

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

    const other = peers.find(p => p !== ws && p.readyState === WebSocket.OPEN);
    if (other) {
      other.send(JSON.stringify(msg));
    }
  });

  ws.on('close', () => {
    console.log(`[Room ${room}] A peer disconnected`);
    const idx = peers.indexOf(ws);
    if (idx !== -1) peers.splice(idx, 1);

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
