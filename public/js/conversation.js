/* conversation.js
 * Manages the full-screen scrollable conversation view with Undo & message tracking.
 */

const Conversation = (() => {
  let _area      = null;
  let _showOrig  = true;   // show translation tag
  let _msgIdSeq  = 0;
  let _messages  = [];     // Structured array of transcript entries

  function init(area) {
    _area = area;
  }

  function _scroll() {
    if (_area) _area.scrollTop = _area.scrollHeight;
  }

  function _id() { return `cmsg-${++_msgIdSeq}`; }

  function _formatTime() {
    const d = new Date();
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function getTranscript() {
    return _messages;
  }

  // ── System message (centered pill) ───────────────────────────────
  function systemMsg(text) {
    if (!_area) return;
    const el = document.createElement('div');
    el.className = 'sys-msg';
    el.textContent = text;
    _area.appendChild(el);
    _scroll();

    _messages.push({
      id: _id(),
      time: _formatTime(),
      speaker: 'system',
      speakerName: 'System',
      type: 'system',
      text: text,
    });

    return el;
  }

  // ── Waiting for partner UI ────────────────────────────────────────
  function waitingUI(code, onCopy) {
    if (!_area) return null;
    const box = document.createElement('div');
    box.className = 'waiting-overlay';
    box.id = 'waiting-overlay';
    box.innerHTML = `
      <div class="waiting-pulse"></div>
      <p class="waiting-label" id="ui-waiting-desc">Share room code to connect:</p>
      <div class="waiting-code-row">
        <span class="waiting-code-text">${code}</span>
        <button class="icon-btn" id="copy-code-btn" title="Copy join link">
          <span class="material-symbols-outlined">content_copy</span>
        </button>
      </div>
    `;
    _area.appendChild(box);
    _scroll();
    const copyBtn = box.querySelector('#copy-code-btn');
    if (copyBtn && onCopy) copyBtn.addEventListener('click', onCopy);
    return box;
  }

  // ── Remove waiting overlay ────────────────────────────────────────
  function removeWaiting() {
    const el = document.getElementById('waiting-overlay');
    if (el) el.remove();
  }

  // ── Build a message row ───────────────────────────────────────────
  function _buildRow(isMine, partnerInitial) {
    const row = document.createElement('div');
    row.className = `msg-row ${isMine ? 'mine' : 'theirs'}`;

    if (!isMine) {
      const dot = document.createElement('div');
      dot.className = 'msg-avatar-dot';
      dot.textContent = (partnerInitial || 'P')[0];
      row.appendChild(dot);
    }

    const bubble = document.createElement('div');
    bubble.className = `msg-bubble ${isMine ? 'mine' : 'theirs'}`;
    row.appendChild(bubble);

    return { row, bubble };
  }

  // ── Live speech bubble (while recording) ──────────────────────────
  function startLiveSpeech() {
    if (!_area) return null;
    const id = _id();
    const { row, bubble } = _buildRow(true, null);
    bubble.classList.add('streaming');
    bubble.id = id;

    const textEl = document.createElement('div');
    textEl.className = 'live-speech-text';
    textEl.innerHTML = `<span class="rec-dots"><span></span><span></span><span></span></span>`;
    bubble.appendChild(textEl);

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;gap:3px;align-items:flex-end;max-width:82%;align-self:flex-end;';
    wrapper.id = `wrapper-${id}`;
    wrapper.dataset.msgId = id;
    wrapper.appendChild(row);

    const label = document.createElement('div');
    label.className = 'msg-label';
    label.textContent = '🎤 Recording…';
    wrapper.appendChild(label);

    _area.appendChild(wrapper);
    _scroll();
    return id;
  }

  // ── Update live speech text (streaming transcript) ─────────────────
  function updateLiveSpeech(id, text) {
    const bubble = document.getElementById(id);
    if (!bubble) return;
    const textEl = bubble.querySelector('.live-speech-text');
    if (textEl) textEl.textContent = text || '';
    _scroll();
  }

  // ── Finalize a speech bubble ──────────────────────────────────────
  function finalizeSpeech(id, original, translation, fromLang, toLang) {
    const bubble = document.getElementById(id);
    const wrapper = document.getElementById(`wrapper-${id}`);
    if (!bubble) return null;

    bubble.classList.remove('streaming');
    bubble.innerHTML = '';

    const textEl = document.createElement('div');
    textEl.className = 'msg-text';
    textEl.textContent = original;
    bubble.appendChild(textEl);

    if (translation && _showOrig) {
      const transl = document.createElement('div');
      transl.className = 'msg-translation';
      transl.dataset.transl = '1';
      transl.textContent = translation;
      bubble.appendChild(transl);
    }

    if (wrapper) {
      const label = wrapper.querySelector('.msg-label');
      if (label) label.textContent = `You · ${fromLang.toUpperCase()} → ${toLang.toUpperCase()}`;
    }
    _scroll();

    _messages.push({
      id: id,
      time: _formatTime(),
      speaker: 'mine',
      speakerName: 'You',
      type: 'speech',
      original: original,
      translation: translation,
      fromLang: fromLang,
      toLang: toLang,
    });

    return wrapper;
  }

  // ── Add Undo button below speech message (active for 4s) ───────────
  function addUndoButton(wrapper, msgId, onUndo) {
    if (!wrapper || !msgId) return;

    const undoWrap = document.createElement('div');
    undoWrap.className = 'undo-wrap';
    undoWrap.id = `undo-${msgId}`;

    const btn = document.createElement('button');
    btn.className = 'undo-btn';
    btn.type = 'button';
    btn.innerHTML = `
      <div class="undo-timer-fill"></div>
      <span class="material-symbols-outlined undo-icon">undo</span>
      <span class="undo-label">Undo voice message</span>
    `;

    undoWrap.appendChild(btn);
    wrapper.appendChild(undoWrap);
    _scroll();

    let timer = setTimeout(() => {
      dismissUndo(msgId);
    }, 4000);

    btn.addEventListener('click', () => {
      clearTimeout(timer);
      onUndo(msgId);
      removeBubble(msgId);
    });
  }

  function dismissUndo(msgId) {
    const undoWrap = document.getElementById(`undo-${msgId}`);
    if (undoWrap) {
      undoWrap.classList.add('dismissing');
      setTimeout(() => undoWrap.remove(), 300);
    }
  }

  // ── Remove message bubble by ID (smooth exit animation) ──────────
  function removeBubble(msgId) {
    const wrapper = document.getElementById(`wrapper-${msgId}`);
    if (wrapper) {
      wrapper.style.animation = 'msg-out 0.28s ease forwards';
      setTimeout(() => wrapper.remove(), 280);
    }
    _messages = _messages.filter(m => m.id !== msgId);
  }

  // ── Partner's speech message ─────────────────────────────────────
  function addTheirMessage(original, translation, partnerInitial, fromLang, toLang, msgId) {
    if (!_area) return;
    const id = msgId || _id();
    const { row, bubble } = _buildRow(false, partnerInitial);

    const primaryEl = document.createElement('div');
    primaryEl.className = 'msg-text';
    primaryEl.textContent = translation || original;
    bubble.appendChild(primaryEl);

    if (original && _showOrig) {
      const origEl = document.createElement('div');
      origEl.className = 'msg-translation';
      origEl.dataset.orig = '1';
      origEl.textContent = original;
      bubble.appendChild(origEl);
    }

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;gap:3px;align-items:flex-start;max-width:82%;align-self:flex-start;';
    wrapper.id = `wrapper-${id}`;
    wrapper.dataset.msgId = id;
    wrapper.appendChild(row);

    const label = document.createElement('div');
    label.className = 'msg-label';
    label.textContent = `Partner · ${fromLang.toUpperCase()} → ${toLang.toUpperCase()}`;
    wrapper.appendChild(label);

    _area.appendChild(wrapper);
    _scroll();

    _messages.push({
      id: id,
      time: _formatTime(),
      speaker: 'theirs',
      speakerName: 'Partner',
      type: 'speech',
      original: original,
      translation: translation,
      fromLang: fromLang,
      toLang: toLang,
    });
  }

  // ── My typed chat message ─────────────────────────────────────────
  function addChatMine(text, translation, fromLang, toLang) {
    if (!_area) return;
    const id = _id();
    const { row, bubble } = _buildRow(true, null);

    const textEl = document.createElement('div');
    textEl.className = 'msg-text';
    textEl.textContent = text;
    bubble.appendChild(textEl);

    if (translation && _showOrig) {
      const transl = document.createElement('div');
      transl.className = 'msg-translation';
      transl.dataset.transl = '1';
      transl.textContent = translation;
      bubble.appendChild(transl);
    }

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;gap:3px;align-items:flex-end;max-width:82%;align-self:flex-end;';
    wrapper.id = `wrapper-${id}`;
    wrapper.dataset.msgId = id;
    wrapper.appendChild(row);

    const label = document.createElement('div');
    label.className = 'msg-label';
    label.textContent = `You · ${fromLang.toUpperCase()} → ${toLang.toUpperCase()} · Text`;
    wrapper.appendChild(label);

    _area.appendChild(wrapper);
    _scroll();

    _messages.push({
      id: id,
      time: _formatTime(),
      speaker: 'mine',
      speakerName: 'You',
      type: 'chat',
      original: text,
      translation: translation,
      fromLang: fromLang,
      toLang: toLang,
    });
  }

  // ── Partner's typed chat message ──────────────────────────────────
  function addChatTheirs(text, translation, partnerInitial, fromLang, toLang) {
    if (!_area) return;
    const id = _id();
    const { row, bubble } = _buildRow(false, partnerInitial);

    const primaryEl = document.createElement('div');
    primaryEl.className = 'msg-text';
    primaryEl.textContent = translation || text;
    bubble.appendChild(primaryEl);

    if (text && _showOrig) {
      const origEl = document.createElement('div');
      origEl.className = 'msg-translation';
      origEl.dataset.orig = '1';
      origEl.textContent = text;
      bubble.appendChild(origEl);
    }

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;gap:3px;align-items:flex-start;max-width:82%;align-self:flex-start;';
    wrapper.id = `wrapper-${id}`;
    wrapper.dataset.msgId = id;
    wrapper.appendChild(row);

    const label = document.createElement('div');
    label.className = 'msg-label';
    label.textContent = `Partner · ${fromLang.toUpperCase()} → ${toLang.toUpperCase()} · Text`;
    wrapper.appendChild(label);

    _area.appendChild(wrapper);
    _scroll();

    _messages.push({
      id: id,
      time: _formatTime(),
      speaker: 'theirs',
      speakerName: 'Partner',
      type: 'chat',
      original: text,
      translation: translation,
      fromLang: fromLang,
      toLang: toLang,
    });
  }

  // ── Toggle original/translation visibility ────────────────────────
  function setShowOriginal(show) {
    _showOrig = show;
    if (!_area) return;
    _area.querySelectorAll('[data-transl], [data-orig]').forEach(el => {
      el.style.display = show ? '' : 'none';
    });
  }

  return {
    init,
    systemMsg,
    waitingUI,
    removeWaiting,
    startLiveSpeech,
    updateLiveSpeech,
    finalizeSpeech,
    addUndoButton,
    removeBubble,
    addTheirMessage,
    addChatMine,
    addChatTheirs,
    setShowOriginal,
    getTranscript,
  };
})();
