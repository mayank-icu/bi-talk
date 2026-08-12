/* webrtc.js — Full orchestration for conversation-UI call page
 *
 * Coordinates:
 *  - getUserMedia (video+audio → audio-only fallback)
 *  - WebSocket signaling
 *  - RTCPeerConnection + DataChannel
 *  - VAD → live speech bubble → Groq STT/translate → finalize bubble
 *  - Chat messages with auto-translation
 *  - Full UI language toggle (i18n)
 *  - Name, mute, lang sync over DataChannel
 */
(async function () {
  // ── Session params ────────────────────────────────────────────────
  const params  = new URLSearchParams(window.location.search);
  const room    = params.get('room') || sessionStorage.getItem('roomCode') || 'room';
  let   myLang  = sessionStorage.getItem('myLang') || 'en';
  const myName  = (sessionStorage.getItem('displayName') || '').trim();
  const myAvatar = sessionStorage.getItem('displayAvatar') || '';

  let _partnerName   = '';
  let _partnerAvatar = '';

  // ── Derived labels ────────────────────────────────────────────────
  function partnerLang()    { return myLang === 'en' ? 'zh' : 'en'; }
  function myInitial()      { return myName ? myName[0].toUpperCase() : (myLang === 'zh' ? '我' : 'Y'); }
  function partnerInitial() { return _partnerName ? _partnerName[0].toUpperCase() : (partnerLang() === 'zh' ? '对' : 'P'); }


  // ── i18n ──────────────────────────────────────────────────────────
  const i18n = {
    en: {
      connecting:    'Connecting…',
      connected:     'Connected',
      reconnecting:  'Reconnecting…',
      disconnected:  'Disconnected',
      partnerLeft:   'Partner left the call',
      waitingDesc:   'Share room code to connect:',
      toastJoined:   'Partner has joined the call!',
      inputPh:       'Type a message — auto-translated…',
      endBtn:        'End',
      myName:        myName || 'You',
      partnerName:   'Partner',
      myLangLabel:   'EN',
      partnerLangLabel: 'ZH',
    },
    zh: {
      connecting:    '正在连接…',
      connected:     '已连接',
      reconnecting:  '正在重连…',
      disconnected:  '已断开',
      partnerLeft:   '对方已离开通话',
      waitingDesc:   '分享房间代码以连接：',
      toastJoined:   _partnerName ? `${_partnerName} 已加入通话！` : '对方已加入通话！',
      inputPh:       '输入消息 — 将自动翻译…',
      endBtn:        '结束',
      myName:        myName || '我',
      partnerName:   '对方',
      myLangLabel:   'ZH',
      partnerLangLabel: 'EN',
    }
  };

  function t(key) { return (i18n[myLang] || i18n.en)[key] || key; }

  // ── DOM refs ──────────────────────────────────────────────────────
  const get = id => document.getElementById(id);

  const remoteVideo          = get('remote-video');
  const localVideo           = get('local-video');
  const connDot              = get('conn-dot');
  const connLabel            = get('conn-label');
  const callTimerEl          = get('call-timer');

  const localAvatarCircle    = get('local-avatar-circle');
  const remoteAvatarCircle   = get('remote-avatar-circle');
  const localAvatarInitial   = get('local-avatar-initial');
  const remoteAvatarInitial  = get('remote-avatar-initial');
  const localSpeakerName     = get('local-speaker-name');
  const remoteSpeakerName    = get('remote-speaker-name');
  const localLangTag         = get('local-lang-tag');
  const remoteLangTag        = get('remote-lang-tag');
  const localMuteDot         = get('local-mute-dot');
  const remoteMuteDot        = get('remote-mute-dot');
  const localMutedOverlay    = get('local-muted-overlay');   // red avatar overlay
  const remoteMutedOverlay   = get('remote-muted-overlay');  // red avatar overlay

  const btnMic               = get('btn-mic');
  const iconMic              = get('icon-mic');
  const btnCaptions          = get('btn-captions');
  const btnReaction          = get('btn-reaction');
  const btnOriginal          = get('btn-original');
  const btnLangToggle        = get('btn-lang-toggle');
  const langToggleText       = get('lang-toggle-text');
  const btnHangup            = get('btn-hangup');
  const uiEndCallText        = get('ui-end-call-text');

  const chatForm             = get('chat-form');
  const chatInput            = get('chat-input');
  const chatSendBtn          = get('chat-send-btn');

  const conversationArea     = get('conversation-area');

  const joinToast            = get('join-toast');
  const joinToastText        = get('join-toast-text');

  // End-call modal
  const endCallModal         = get('end-call-modal');
  const modalCancelBtn       = get('modal-cancel-btn');
  const modalEndBtn          = get('modal-end-btn');

  // ── Apply UI language ─────────────────────────────────────────────
  function renderAvatarCircle(circleEl, initialEl, name, avatarUrl, defaultInitial) {
    if (!circleEl) return;

    // Update or create img without touching mute-dot / muted-overlay siblings
    let img = circleEl.querySelector('img.avatar-img');

    if (avatarUrl) {
      if (!img) {
        img = document.createElement('img');
        img.className = 'avatar-img';
        // Insert before the first child so it's behind the initial span
        circleEl.insertBefore(img, circleEl.firstChild);
      }
      img.src = avatarUrl;
      img.alt = name || 'Avatar';
      if (initialEl) initialEl.style.display = 'none'; // hide letter when photo set
    } else {
      if (img) img.remove();
      if (initialEl) {
        initialEl.style.display = '';
        initialEl.textContent = name ? name[0].toUpperCase() : defaultInitial;
      }
    }
  }

  function applyLangUI() {
    if (langToggleText)    langToggleText.textContent    = myLang.toUpperCase();
    if (localLangTag)      localLangTag.textContent      = myLang.toUpperCase();
    if (remoteLangTag)     remoteLangTag.textContent     = partnerLang().toUpperCase();
    if (localSpeakerName)  localSpeakerName.textContent  = t('myName');
    if (remoteSpeakerName) remoteSpeakerName.textContent = _partnerName || t('partnerName');
    if (chatInput)         chatInput.placeholder         = t('inputPh');
    if (uiEndCallText)     uiEndCallText.textContent     = t('endBtn');

    renderAvatarCircle(localAvatarCircle, localAvatarInitial, myName, myAvatar, myInitial());
    renderAvatarCircle(remoteAvatarCircle, remoteAvatarInitial, _partnerName, _partnerAvatar, partnerInitial());
  }

  Conversation.init(conversationArea);
  applyLangUI();

  // ── Status helper ──────────────────────────────────────────────────
  function setStatus(cssClass, textKey) {
    if (connDot)   connDot.className    = `conn-dot ${cssClass}`;
    if (connLabel) connLabel.textContent = t(textKey);
  }
  setStatus('connecting', 'connecting');

  // ── Toast helper ───────────────────────────────────────────────────
  function showToast(msg) {
    if (!joinToast) return;
    if (joinToastText) joinToastText.textContent = msg;
    joinToast.classList.add('show');
    setTimeout(() => joinToast.classList.remove('show'), 3500);
  }

  // ── Error banner ───────────────────────────────────────────────────
  function showError(msg) {
    const banner = get('error-banner');
    const msgEl  = get('error-message');
    if (!banner) return;
    if (msgEl) msgEl.textContent = msg;
    banner.classList.add('visible');
    setTimeout(() => banner.classList.remove('visible'), 6000);
  }

  // ── Timer ──────────────────────────────────────────────────────────
  let timerInterval = null, secondsElapsed = 0;
  function startTimer() {
    if (timerInterval) return;
    timerInterval = setInterval(() => {
      secondsElapsed++;
      const m = String(Math.floor(secondsElapsed / 60)).padStart(2, '0');
      const s = String(secondsElapsed % 60).padStart(2, '0');
      if (callTimerEl) callTimerEl.textContent = `${m}:${s}`;
    }, 1000);
  }
  function stopTimer() { clearInterval(timerInterval); timerInterval = null; }

  // ── ICE servers (fetched dynamically from server env) ──────────────────────
  let ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

  try {
    const res = await fetch('/api/ice-servers');
    if (res.ok) {
      const config = await res.json();
      if (Array.isArray(config.iceServers) && config.iceServers.length > 0) {
        ICE_SERVERS = config.iceServers;
      }
    }
  } catch (err) {
    console.warn('[WebRTC] Failed to fetch /api/ice-servers, using STUN fallback:', err);
  }

  // ── State ──────────────────────────────────────────────────────────
  let localStream       = null;
  let pc                = null;
  let dataChannel       = null;
  let role              = null;
  let ws                = null;
  let recorder          = null;
  let callAudioRecorder = null;
  let micEnabled        = true;
  let showOriginal      = true;

  // Track the live speech bubble id (set on speechstart, cleared after finalize)
  let liveSpeechId = null;

  function sendDC(obj) {
    if (dataChannel && dataChannel.readyState === 'open') {
      dataChannel.send(JSON.stringify(obj));
    }
  }

  // ── getUserMedia — try video+audio, fall back to audio-only ————————
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  } catch (videoErr) {
    // NotFoundError / DevicesNotFoundError = no camera, completely expected on
    // laptops/desktops without a webcam. Silently fall back to audio-only.
    const noCamera = ['NotFoundError', 'DevicesNotFoundError', 'NotReadableError']
      .includes(videoErr.name);
    if (!noCamera) {
      console.warn('[Media] video+audio failed:', videoErr.message);
    }
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (audioErr) {
      console.error('[Media] getUserMedia failed entirely:', audioErr);
      showError(`Microphone access denied: ${audioErr.message}`);
      Conversation.systemMsg(`⚠ Cannot access microphone: ${audioErr.message}`);
      return;
    }
  }

  if (localVideo) localVideo.srcObject = localStream;

  // Initialize call-wide audio recorder for combined call audio
  try {
    if (typeof CallAudioRecorder !== 'undefined') {
      callAudioRecorder = new CallAudioRecorder(localStream);
    }
  } catch (err) {
    console.error('[CallAudioRecorder] Failed to start audio mixer:', err);
  }

  // ── Waiting overlay in conversation area ───────────────────────────
  let waitingEl = Conversation.waitingUI(room, () => {
    const link = `${location.origin}/?room=${encodeURIComponent(room)}`;
    navigator.clipboard.writeText(link).then(() => {
      const btn = document.getElementById('copy-code-btn');
      const icon = btn?.querySelector('.material-symbols-outlined');
      if (icon) { icon.textContent = 'check'; setTimeout(() => { icon.textContent = 'content_copy'; }, 2000); }
    });
  });

  // ── DataChannel setup ──────────────────────────────────────────────
  function setupDC(dc) {
    dc.onopen = () => {
      sendDC({ type: 'mute-status', muted: !micEnabled });
      sendDC({ type: 'lang-status', lang: myLang });
      sendDC({ type: 'profile-status', name: myName || '', avatar: myAvatar || '' });
    };

    dc.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }

      switch (msg.type) {
        case 'caption':
          // Partner's speech: original = what they said, translation = in my language
          if (msg.original && msg.translation) {
            Conversation.addTheirMessage(
              msg.original, msg.translation,
              partnerInitial(),
              msg.fromLang || partnerLang(),
              msg.toLang   || myLang,
              msg.msgId
            );
            // Pulse partner avatar
            if (remoteAvatarCircle) {
              remoteAvatarCircle.classList.add('speaking');
              setTimeout(() => remoteAvatarCircle.classList.remove('speaking'), 2500);
            }
          }
          break;

        case 'undo-caption':
          if (msg.msgId) {
            Conversation.removeBubble(msg.msgId);
          }
          break;

        case 'mute-status':
          if (remoteMuteDot)     remoteMuteDot.classList.toggle('visible', !!msg.muted);
          if (remoteMutedOverlay) remoteMutedOverlay.classList.toggle('visible', !!msg.muted);
          break;

        case 'lang-status':
          if (msg.lang && remoteLangTag) remoteLangTag.textContent = msg.lang.toUpperCase();
          break;

        case 'profile-status':
        case 'name-status':
          if (msg.name !== undefined) {
            _partnerName = msg.name;
            if (remoteSpeakerName) remoteSpeakerName.textContent = msg.name || t('partnerName');
          }
          if (msg.avatar !== undefined) {
            _partnerAvatar = msg.avatar;
          }
          renderAvatarCircle(remoteAvatarCircle, remoteAvatarInitial, _partnerName, _partnerAvatar, partnerInitial());

          // Show personalized toast with actual name
          const pName = _partnerName || t('partnerName');
          const toastMsg = myLang === 'zh' ? `${pName} 已加入通话！` : `${pName} has joined the call!`;
          showToast(toastMsg);
          break;

        case 'chat-message':
          // Partner sent a typed chat — translation = in my language
          Conversation.addChatTheirs(
            msg.text, msg.translation,
            partnerInitial(),
            msg.fromLang || partnerLang(),
            msg.toLang   || myLang
          );
          break;

        case 'reaction':
          if (msg.emoji && typeof Reactions !== 'undefined') {
            Reactions.triggerSuperReact(
              msg.emoji,
              false,
              msg.senderName || _partnerName || t('partnerName')
            );
          }
          break;
      }
    };
  }

  // ── RTCPeerConnection ──────────────────────────────────────────────
  function createPC() {
    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.ontrack = (e) => {
      if (remoteVideo && remoteVideo.srcObject !== e.streams[0]) {
        remoteVideo.srcObject = e.streams[0];
      }
      if (callAudioRecorder && e.streams && e.streams[0]) {
        callAudioRecorder.addRemoteStream(e.streams[0]);
      }
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) wsSend({ type: 'ice-candidate', candidate: candidate.toJSON() });
    };

    pc.oniceconnectionstatechange = () => {
      const s = pc.iceConnectionState;
      if (s === 'connected' || s === 'completed') {
        setStatus('connected', 'connected');
        Conversation.removeWaiting();
        startTimer();
        const pName = _partnerName || t('partnerName');
        const joinMsg = myLang === 'zh' ? `✓ ${pName} 已加入通话！` : `✓ ${pName} has joined the call!`;
        Conversation.systemMsg(joinMsg);
        showToast(myLang === 'zh' ? `${pName} 已加入通话！` : `${pName} has joined the call!`);
        sendDC({ type: 'mute-status', muted: !micEnabled });
        sendDC({ type: 'lang-status', lang: myLang });
        sendDC({ type: 'profile-status', name: myName || '', avatar: myAvatar || '' });
      } else if (s === 'checking') {
        setStatus('connecting', 'connecting');
      } else if (s === 'disconnected') {
        setStatus('connecting', 'reconnecting');
      } else if (s === 'failed' || s === 'closed') {
        setStatus('failed', 'disconnected');
        stopTimer();
      }
    };

    if (role === 'offerer') {
      dataChannel = pc.createDataChannel('main', { ordered: true });
      setupDC(dataChannel);
    }
    pc.ondatachannel = (e) => { dataChannel = e.channel; setupDC(dataChannel); };
  }

  // ── Signaling (WebSocket with HTTP Polling Fallback for Netlify) ───
  let httpPeerId = null;
  let pollInterval = null;
  let useHttpSignal = false;

  function wsSend(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    } else if (useHttpSignal && httpPeerId) {
      fetch('/api/signal/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room, peerId: httpPeerId, message: obj }),
      }).catch(err => console.warn('[HTTP Signal] Send error:', err));
    }
  }

  let pendingCandidates = [];

  async function drainPendingCandidates() {
    if (!pc || !pc.remoteDescription) return;
    if (pendingCandidates.length > 0) {
      console.log(`[WebRTC] Draining ${pendingCandidates.length} queued ICE candidate(s)...`);
      for (const cand of pendingCandidates) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
          console.log('[WebRTC] Successfully added queued ICE candidate');
        } catch (e) {
          console.warn('[WebRTC] Error adding queued ICE candidate:', e.message);
        }
      }
      pendingCandidates = [];
    }
  }

  async function handleSignalMessage(msg) {
    if (!msg || !msg.type) return;
    console.log('[Signal Client] Received message:', msg.type, msg);

    switch (msg.type) {
      case 'role':
        console.log(`[Signal Client] Assigned role: ${msg.role}`);
        role = msg.role;
        createPC();
        break;
      case 'ready':
        console.log(`[Signal Client] Signaling ready received (role: ${role})`);
        if (role === 'offerer') {
          console.log('[WebRTC] Creating SDP offer...');
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          console.log('[WebRTC] Local offer set. Sending offer to partner...');
          wsSend({ type: 'offer', sdp: pc.localDescription });
        }
        break;
      case 'offer':
        console.log('[WebRTC] SDP offer received from offerer.');
        if (!pc) createPC();
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        console.log('[WebRTC] Remote description set. Creating SDP answer...');
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        console.log('[WebRTC] Local answer set. Sending answer to offerer...');
        wsSend({ type: 'answer', sdp: pc.localDescription });
        await drainPendingCandidates();
        break;
      case 'answer':
        console.log('[WebRTC] SDP answer received from answerer.');
        if (role === 'offerer') {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          console.log('[WebRTC] Remote answer description set successfully.');
          await drainPendingCandidates();
        }
        break;
      case 'ice-candidate':
        if (msg.candidate) {
          if (pc && pc.remoteDescription && pc.remoteDescription.type) {
            console.log('[WebRTC] Remote description present — adding ICE candidate immediately');
            try {
              await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
              console.log('[WebRTC] ICE candidate added successfully');
            } catch (e) {
              console.warn('[WebRTC] ICE add candidate error:', e.message);
            }
          } else {
            console.log('[WebRTC] Remote description NOT set yet — queuing ICE candidate');
            pendingCandidates.push(msg.candidate);
          }
        }
        break;
      case 'peer-disconnected':
        console.log('[Signal Client] Partner disconnected notification received');
        setStatus('failed', 'partnerLeft');
        stopTimer();
        Conversation.systemMsg(t('partnerLeft'));
        if (remoteMuteDot) remoteMuteDot.classList.remove('visible');
        if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
        break;
    }
  }

  async function startHttpSignaling() {
    if (useHttpSignal) return;
    useHttpSignal = true;
    console.log(`[HTTP Signal] Initializing HTTP signaling for room: ${room}`);

    try {
      const res = await fetch('/api/signal/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error('[HTTP Signal] Join failed:', res.status, err);
        showError(err.error || 'Failed to join room over HTTP signaling');
        return;
      }
      const data = await res.json();
      httpPeerId = data.peerId;
      console.log(`[HTTP Signal] Joined successfully. PeerId: ${httpPeerId}, Role: ${data.role}, Storage: ${data.storage || 'unknown'}`);

      pollInterval = setInterval(async () => {
        if (!httpPeerId) return;
        try {
          const pRes = await fetch(`/api/signal/poll?room=${encodeURIComponent(room)}&peerId=${encodeURIComponent(httpPeerId)}`);
          if (pRes.ok) {
            const pData = await pRes.json();
            if (Array.isArray(pData.messages) && pData.messages.length > 0) {
              console.log(`[HTTP Signal] Polled ${pData.messages.length} message(s):`, pData.messages.map(m => m.type));
              for (const m of pData.messages) {
                await handleSignalMessage(m);
              }
            }
          }
        } catch (e) {
          console.warn('[HTTP Signal] Poll network error:', e.message);
        }
      }, 700);

    } catch (err) {
      console.error('[HTTP Signal] Join error:', err);
      showError('Cannot connect to signaling server');
    }
  }

  const isNetlify = location.hostname.endsWith('.netlify.app') || location.hostname.endsWith('.netlify.com');

  if (isNetlify) {
    startHttpSignaling();
  } else {
    try {
      const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${wsProto}//${location.host}/ws?room=${encodeURIComponent(room)}`);

      const wsTimer = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          try { ws.close(); } catch {}
          startHttpSignaling();
        }
      }, 2000);

      ws.onopen = () => clearTimeout(wsTimer);

      ws.onmessage = async (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }
        await handleSignalMessage(msg);
      };

      ws.onerror = () => {
        clearTimeout(wsTimer);
        startHttpSignaling();
      };

      ws.onclose = () => {
        clearTimeout(wsTimer);
        if (!useHttpSignal && (!pc || pc.iceConnectionState !== 'connected')) {
          startHttpSignaling();
        }
      };
    } catch (e) {
      startHttpSignaling();
    }
  }

  // ── Groq pipeline with callbacks ───────────────────────────────────
  GroqPipeline.init(myLang, () => dataChannel, {
    onTranscribed: (text, liveId) => {
      // Whisper returned — update live bubble with actual transcript text
      Conversation.updateLiveSpeech(liveId, text);
    },
    onTranslated: (original, translation, liveId) => {
      // Translation done — finalize the bubble
      if (!original) {
        // Empty / silence — remove live bubble (no text to show)
        const bubble = document.getElementById(liveId);
        const wrapper = document.getElementById(`wrapper-${liveId}`);
        if (wrapper) wrapper.remove();
        else if (bubble) bubble.closest('[style]')?.remove();
        liveSpeechId = null;
        return;
      }
      const wrapper = Conversation.finalizeSpeech(
        liveId, original, translation,
        myLang, partnerLang()
      );
      if (wrapper) {
        Conversation.addUndoButton(wrapper, liveId, (msgIdToUndo) => {
          sendDC({ type: 'undo-caption', msgId: msgIdToUndo });
        });
      }
      liveSpeechId = null;
    },
  });

  // ── VAD + Recorder ────────────────────────────────────────────────
  recorder = createRecorder(localStream, (blob, mimeType) => {
    if (micEnabled && liveSpeechId) {
      GroqPipeline.setLiveId(liveSpeechId);
      GroqPipeline.processChunk(blob, mimeType);
    }
  });

  recorder.vad.on('speechstart', () => {
    if (!micEnabled) return;
    // Create live speech bubble in conversation
    liveSpeechId = Conversation.startLiveSpeech();
    GroqPipeline.setLiveId(liveSpeechId);
    // Pulse my avatar
    if (localAvatarCircle) localAvatarCircle.classList.add('speaking');
  });

  recorder.vad.on('speechend', () => {
    if (localAvatarCircle) localAvatarCircle.classList.remove('speaking');
    // liveSpeechId stays set — processChunk callback will finalize it
  });

  // ── Mic toggle ──────────────────────────────────────────────────────────
  if (btnMic) {
    btnMic.addEventListener('click', () => {
      micEnabled = !micEnabled;
      localStream.getAudioTracks().forEach(t => { t.enabled = micEnabled; });
      btnMic.classList.toggle('muted', !micEnabled);
      if (iconMic)           iconMic.textContent = micEnabled ? 'mic' : 'mic_off';
      if (localMuteDot)      localMuteDot.classList.toggle('visible', !micEnabled);
      if (localMutedOverlay) localMutedOverlay.classList.toggle('visible', !micEnabled);
      if (!micEnabled && localAvatarCircle) localAvatarCircle.classList.remove('speaking');
      sendDC({ type: 'mute-status', muted: !micEnabled });
    });
  }

  // ── Language toggle ────────────────────────────────────────────────
  if (btnLangToggle) {
    btnLangToggle.addEventListener('click', () => {
      myLang = myLang === 'en' ? 'zh' : 'en';
      sessionStorage.setItem('myLang', myLang);
      GroqPipeline.setLanguage(myLang);
      applyLangUI();
      sendDC({ type: 'lang-status', lang: myLang });
    });
  }

  // ── Captions toggle (show/hide all translation tags) ───────────────
  if (btnCaptions) {
    btnCaptions.addEventListener('click', () => {
      showOriginal = !showOriginal;
      btnCaptions.classList.toggle('active', showOriginal);
      Conversation.setShowOriginal(showOriginal);
    });
  }

  // ── Reactions Setup ────────────────────────────────────────────────
  if (typeof Reactions !== 'undefined' && btnReaction) {
    Reactions.init({
      btnEl: btnReaction,
      onSelect: (emoji) => {
        const sender = myName || t('myName');
        Reactions.triggerSuperReact(emoji, true, sender);
        sendDC({ type: 'reaction', emoji, senderName: sender });
      }
    });

    btnReaction.addEventListener('click', () => {
      Reactions.togglePicker();
    });
  }

  // ── Original text toggle (same as captions toggle, alias) ──────────
  if (btnOriginal) {
    btnOriginal.addEventListener('click', () => {
      showOriginal = !showOriginal;
      if (btnCaptions) btnCaptions.classList.toggle('active', showOriginal);
      btnOriginal.classList.toggle('active', !showOriginal);
      Conversation.setShowOriginal(showOriginal);
    });
  }

  // ── Chat: send typed message ────────────────────────────────────────
  if (chatForm) {
    chatForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = chatInput?.value.trim();
      if (!text) return;
      if (chatInput) chatInput.value = '';
      if (chatSendBtn) chatSendBtn.disabled = true;

      const toLang = partnerLang();

      // Show my message immediately with a "translating…" placeholder
      Conversation.addChatMine(text, '…translating…', myLang, toLang);

      let translation = text;
      try {
        const res = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, from: myLang, to: toLang }),
        });
        const data = await res.json();
        translation = (data.translation || text).trim();
      } catch (err) {
        console.error('[Chat] Translation failed:', err);
      }

      // Re-render my bubble with real translation
      // (quickest: just find the last .msg-translation[data-transl] and update it)
      const allTransl = conversationArea?.querySelectorAll('[data-transl]');
      if (allTransl && allTransl.length > 0) {
        const last = allTransl[allTransl.length - 1];
        if (last.textContent === '…translating…') last.textContent = translation;
      }

      // Send to partner
      sendDC({ type: 'chat-message', text, translation, fromLang: myLang, toLang });

      if (chatSendBtn) chatSendBtn.disabled = false;
      if (chatInput)   chatInput.focus();
    });
  }

  // ── End Call ────────────────────────────────────────────────────────
  let _ended = false;
  async function hangUp() {
    if (_ended) return;
    _ended = true;
    stopTimer();

    // Disable hangup button UI during saving state
    if (btnHangup) btnHangup.disabled = true;
    if (modalEndBtn) modalEndBtn.disabled = true;

    // Get call audio blob
    let audioBlob = null;
    if (callAudioRecorder) {
      try {
        audioBlob = await callAudioRecorder.stopAndGetBlob();
      } catch (err) {
        console.error('[hangUp] Failed to stop call audio recorder:', err);
      }
    }

    // Get transcript log
    const transcript = Conversation.getTranscript ? Conversation.getTranscript() : [];

    // Format summary object
    const durationText = callTimerEl ? callTimerEl.textContent || '00:00' : '00:00';
    const summaryData = {
      room: room,
      duration: durationText,
      secondsElapsed: secondsElapsed,
      transcript: transcript,
      audioBlob: audioBlob,
      myName: myName || 'You',
      partnerName: _partnerName || 'Partner',
      myLang: myLang,
      partnerLang: partnerLang(),
      endedAt: new Date().toISOString()
    };

    // Save summary into IndexedDB
    if (typeof CallStorage !== 'undefined') {
      await CallStorage.saveSummary(summaryData);
    }

    // Stop all media and peer connections
    if (recorder)    { recorder.destroy(); recorder = null; }
    if (pc)          { pc.close();         pc = null; }
    if (ws)          { ws.close();         ws = null; }
    if (localStream) localStream.getTracks().forEach(t => t.stop());

    // Redirect to Summary Screen instead of Home screen
    location.href = `/summary.html?room=${encodeURIComponent(room)}`;
  }

  // Show confirmation modal instead of ending immediately
  function showEndModal() {
    if (endCallModal) endCallModal.classList.add('visible');
  }
  function hideEndModal() {
    if (endCallModal) endCallModal.classList.remove('visible');
  }

  if (btnHangup)      btnHangup.addEventListener('click', showEndModal);
  if (modalCancelBtn) modalCancelBtn.addEventListener('click', hideEndModal);
  if (modalEndBtn)    modalEndBtn.addEventListener('click', hangUp);

  // Close modal on backdrop click
  if (endCallModal) {
    endCallModal.addEventListener('click', (e) => {
      if (e.target === endCallModal) hideEndModal();
    });
  }

  // ESC key closes modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideEndModal();
  });

  window.addEventListener('beforeunload', hangUp);

})();
