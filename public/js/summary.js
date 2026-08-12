/* summary.js — Logic for Call Summary Screen
 *
 * Loads call metrics, audio recording blob, and full transcript from CallStorage.
 * Provides audio playback preview, transcript rendering, and file download options (.webm, .txt, .json).
 */
(async function () {
  const params = new URLSearchParams(window.location.search);
  const roomParam = params.get('room') || '';

  // DOM elements
  const summaryDuration = document.getElementById('summary-duration');
  const summaryParticipants = document.getElementById('summary-participants');
  const summaryRoom = document.getElementById('summary-room');
  const summaryMsgCount = document.getElementById('summary-msg-count');

  const audioPlayer = document.getElementById('summary-audio-player');
  const audioNoRecording = document.getElementById('audio-no-recording');
  const btnDownloadAudio = document.getElementById('btn-download-audio');

  const btnDownloadTxt = document.getElementById('btn-download-txt');
  const btnDownloadJson = document.getElementById('btn-download-json');
  const transcriptContainer = document.getElementById('transcript-container');
  const transcriptEmpty = document.getElementById('transcript-empty');

  const btnHome = document.getElementById('btn-home');

  // Load summary data
  let summary = null;
  if (typeof CallStorage !== 'undefined') {
    summary = await CallStorage.getLatestSummary();
  }

  // Fallback check
  if (!summary) {
    try {
      const raw = sessionStorage.getItem('latestSummary');
      if (raw) summary = JSON.parse(raw);
    } catch (e) {}
  }

  // Fallback defaults if no stored session found
  const data = summary || {
    room: roomParam || 'ROOM',
    duration: '00:00',
    transcript: [],
    audioBlob: null,
    myName: sessionStorage.getItem('displayName') || 'You',
    partnerName: 'Partner',
    myLang: sessionStorage.getItem('myLang') || 'en',
    partnerLang: sessionStorage.getItem('myLang') === 'en' ? 'zh' : 'en',
    endedAt: new Date().toISOString()
  };

  // Populate metrics
  if (summaryRoom) summaryRoom.textContent = data.room || roomParam || 'ROOM';
  if (summaryDuration) summaryDuration.textContent = data.duration || '00:00';
  if (summaryParticipants) summaryParticipants.textContent = `${data.myName} & ${data.partnerName}`;

  const validMsgs = (data.transcript || []).filter(m => m.type !== 'system');
  if (summaryMsgCount) summaryMsgCount.textContent = validMsgs.length;

  // Handle Audio Player & Download
  let audioUrl = null;
  if (data.audioBlob && data.audioBlob.size > 0) {
    try {
      audioUrl = URL.createObjectURL(data.audioBlob);
      if (audioPlayer) {
        audioPlayer.src = audioUrl;
      }
    } catch (err) {
      console.error('[Summary] Error creating audio object URL:', err);
    }
  } else {
    if (audioPlayer) audioPlayer.style.display = 'none';
    if (audioNoRecording) audioNoRecording.classList.remove('hidden');
    if (btnDownloadAudio) btnDownloadAudio.disabled = true;
  }

  if (btnDownloadAudio) {
    btnDownloadAudio.addEventListener('click', () => {
      if (!data.audioBlob || data.audioBlob.size === 0) return;
      const fileExt = data.audioBlob.type.includes('mp4') ? 'mp4' : 'webm';
      const fileName = `Thread_Call_Audio_${data.room}_${formatDateForFile()}.` + fileExt;
      downloadBlob(data.audioBlob, fileName);
    });
  }

  // Render Transcript Entries
  if (data.transcript && data.transcript.length > 0) {
    if (transcriptEmpty) transcriptEmpty.style.display = 'none';
    
    data.transcript.forEach((msg) => {
      if (msg.type === 'system') return;

      const item = document.createElement('div');
      item.className = `transcript-item ${msg.speaker === 'mine' ? 'mine' : 'theirs'}`;

      const meta = document.createElement('div');
      meta.className = 'transcript-meta';
      
      const isMine = msg.speaker === 'mine';
      const speakerName = isMine ? data.myName : data.partnerName;
      const langPair = `${(msg.fromLang || 'en').toUpperCase()} → ${(msg.toLang || 'zh').toUpperCase()}`;
      const typeBadge = msg.type === 'chat' ? '💬 Text' : '🎤 Speech';

      meta.innerHTML = `
        <span class="transcript-speaker">${escapeHtml(speakerName)}</span>
        <span class="transcript-tag">${langPair}</span>
        <span class="transcript-tag">${typeBadge}</span>
        <span class="transcript-time">${msg.time || ''}</span>
      `;

      const body = document.createElement('div');
      body.className = 'transcript-body';

      if (msg.original) {
        const orig = document.createElement('div');
        orig.className = 'transcript-text-orig';
        orig.textContent = msg.original;
        body.appendChild(orig);
      }

      if (msg.translation && msg.translation !== msg.original) {
        const transl = document.createElement('div');
        transl.className = 'transcript-text-transl';
        transl.textContent = msg.translation;
        body.appendChild(transl);
      }

      item.appendChild(meta);
      item.appendChild(body);
      transcriptContainer.appendChild(item);
    });
  }

  // Download Transcript (.txt)
  if (btnDownloadTxt) {
    btnDownloadTxt.addEventListener('click', () => {
      const textContent = generateTextTranscript(data);
      const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
      downloadBlob(blob, `Thread_Transcript_${data.room}_${formatDateForFile()}.txt`);
    });
  }

  // Download Structured Data (.json)
  if (btnDownloadJson) {
    btnDownloadJson.addEventListener('click', () => {
      const jsonObj = {
        roomCode: data.room,
        duration: data.duration,
        endedAt: data.endedAt,
        participants: {
          localUser: { name: data.myName, language: data.myLang },
          remotePartner: { name: data.partnerName, language: data.partnerLang }
        },
        totalMessages: validMsgs.length,
        transcript: data.transcript || []
      };
      const blob = new Blob([JSON.stringify(jsonObj, null, 2)], { type: 'application/json' });
      downloadBlob(blob, `Thread_Call_Data_${data.room}_${formatDateForFile()}.json`);
    });
  }

  // Home button
  if (btnHome) {
    btnHome.addEventListener('click', () => {
      location.href = '/';
    });
  }

  // Helpers
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function formatDateForFile() {
    const d = new Date();
    return d.toISOString().slice(0, 10) + '_' + d.getHours() + '-' + d.getMinutes();
  }

  function escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function generateTextTranscript(summaryData) {
    let lines = [];
    lines.push(`==================================================`);
    lines.push(`THREAD CALL TRANSCRIPT`);
    lines.push(`==================================================`);
    lines.push(`Room Code:    ${summaryData.room}`);
    lines.push(`Duration:     ${summaryData.duration}`);
    lines.push(`Date/Time:    ${new Date(summaryData.endedAt).toLocaleString()}`);
    lines.push(`Participants: ${summaryData.myName} (${(summaryData.myLang||'en').toUpperCase()}) & ${summaryData.partnerName} (${(summaryData.partnerLang||'zh').toUpperCase()})`);
    lines.push(`==================================================\n`);

    const msgs = (summaryData.transcript || []).filter(m => m.type !== 'system');
    if (msgs.length === 0) {
      lines.push(`(No messages recorded in this call session)`);
    } else {
      msgs.forEach((m, idx) => {
        const isMine = m.speaker === 'mine';
        const name = isMine ? summaryData.myName : summaryData.partnerName;
        const typeStr = m.type === 'chat' ? '[Text]' : '[Speech]';
        const langStr = `[${(m.fromLang||'').toUpperCase()} -> ${(m.toLang||'').toUpperCase()}]`;
        
        lines.push(`${idx + 1}. [${m.time || ''}] ${name} ${typeStr} ${langStr}:`);
        lines.push(`   Original:    ${m.original}`);
        if (m.translation && m.translation !== m.original) {
          lines.push(`   Translation: ${m.translation}`);
        }
        lines.push(``);
      });
    }

    lines.push(`==================================================`);
    lines.push(`End of Transcript — Thread Video Communications`);
    return lines.join('\n');
  }

})();
