/* room.js — Homepage logic: language toggle, name input, tabs, room navigation */

(function () {
  // ── Element refs ──────────────────────────────────────────────────────
  const btnLangEn       = document.getElementById('btn-lang-en');
  const btnLangZh       = document.getElementById('btn-lang-zh');
  const tabStartBtn     = document.getElementById('tab-start-btn');
  const tabJoinBtn      = document.getElementById('tab-join-btn');
  const contentStart    = document.getElementById('content-start');
  const contentJoin     = document.getElementById('content-join');
  const createRoomBtn   = document.getElementById('create-room-btn');
  const joinRoomBtn     = document.getElementById('join-room-btn');
  const roomCodeInput   = document.getElementById('room-code-input');
  const nameInputStart  = document.getElementById('display-name-start');
  const nameInputJoin   = document.getElementById('display-name-join');
  const avatarInputStart = document.getElementById('avatar-input-start');
  const avatarInputJoin  = document.getElementById('avatar-input-join');
  const avatarBoxStart   = document.getElementById('avatar-preview-box-start');
  const avatarBoxJoin    = document.getElementById('avatar-preview-box-join');

  let profileAvatarData = sessionStorage.getItem('displayAvatar') || '';

  // UI i18n elements
  const uiSubtitle      = document.getElementById('ui-subtitle');
  const uiStartHeading  = document.getElementById('ui-start-heading');
  const uiStartDesc     = document.getElementById('ui-start-desc');
  const uiJoinHeading   = document.getElementById('ui-join-heading');
  const uiJoinDesc      = document.getElementById('ui-join-desc');
  const uiCreateBtnText = document.getElementById('ui-create-btn-text');
  const uiJoinBtnText   = document.getElementById('ui-join-btn-text');
  const uiLabelName     = document.getElementById('ui-label-name');
  const uiLabelNameJoin = document.getElementById('ui-label-name-join');
  const uiLabelCode     = document.getElementById('ui-label-code');

  let selectedLang = sessionStorage.getItem('myLang') || 'en';

  // ── Translation Strings ───────────────────────────────────────────────
  const i18n = {
    en: {
      subtitle:       'Two languages, one conversation.',
      tabStart:       'Start a call',
      tabJoin:        'Join a call',
      startHeading:   'Start a call',
      startDesc:      'Initiate a new bilingual session. Your preferred language settings will be applied automatically.',
      joinHeading:    'Join a call',
      joinDesc:       'Enter the room code shared by your partner to connect.',
      labelName:      'Your name',
      labelCode:      'Room code',
      namePlaceholder:'e.g. Sarah',
      codePlaceholder:'ENTER CODE',
      createBtn:      'Create Room',
      joinBtn:        'Join Room',
    },
    zh: {
      subtitle:       '两种语言，同心对话。',
      tabStart:       '发起通话',
      tabJoin:        '加入通话',
      startHeading:   '发起双语通话',
      startDesc:      '开启一个新的双语实时通话。您的语言偏好设置将自动应用。',
      joinHeading:    '加入双语通话',
      joinDesc:       '请输入对方分享给您的房间代码以连接。',
      labelName:      '您的姓名',
      labelCode:      '房间代码',
      namePlaceholder:'例如：伟',
      codePlaceholder:'请输入代码',
      createBtn:      '创建房间',
      joinBtn:        '加入房间',
    }
  };

  // ── Apply UI Translation ──────────────────────────────────────────────
  function applyLang(lang) {
    const t = i18n[lang] || i18n.en;
    if (uiSubtitle)      uiSubtitle.textContent     = t.subtitle;
    if (uiStartHeading)  uiStartHeading.textContent  = t.startHeading;
    if (uiStartDesc)     uiStartDesc.textContent     = t.startDesc;
    if (uiJoinHeading)   uiJoinHeading.textContent   = t.joinHeading;
    if (uiJoinDesc)      uiJoinDesc.textContent      = t.joinDesc;
    if (uiCreateBtnText) uiCreateBtnText.textContent = t.createBtn;
    if (uiJoinBtnText)   uiJoinBtnText.textContent   = t.joinBtn;
    if (uiLabelName)     uiLabelName.textContent     = t.labelName;
    if (uiLabelNameJoin) uiLabelNameJoin.textContent = t.labelName;
    if (uiLabelCode)     uiLabelCode.textContent     = t.labelCode;
    if (tabStartBtn)     tabStartBtn.textContent     = t.tabStart;
    if (tabJoinBtn)      tabJoinBtn.textContent      = t.tabJoin;
    if (nameInputStart)  nameInputStart.placeholder  = t.namePlaceholder;
    if (nameInputJoin)   nameInputJoin.placeholder   = t.namePlaceholder;
    if (roomCodeInput)   roomCodeInput.placeholder   = t.codePlaceholder;

    btnLangEn.className = `lang-btn${lang === 'en' ? ' active' : ''}`;
    btnLangZh.className = `lang-btn${lang === 'zh' ? ' active' : ''}`;
  }

  // Restore previously saved name & avatar
  const savedName = sessionStorage.getItem('displayName') || '';
  if (nameInputStart) nameInputStart.value = savedName;
  if (nameInputJoin)  nameInputJoin.value  = savedName;

  function renderAvatarPreview(dataUrl) {
    if (!dataUrl) return;
    const imgHtml = `<img src="${dataUrl}" alt="Avatar preview"/>`;
    if (avatarBoxStart) avatarBoxStart.innerHTML = imgHtml;
    if (avatarBoxJoin)  avatarBoxJoin.innerHTML  = imgHtml;
  }

  if (profileAvatarData) renderAvatarPreview(profileAvatarData);

  function handleFileSelect(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      // Compress image via Canvas to keep base64 small for WebRTC DataChannel
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const maxDim = 120;
        let w = img.width, h = img.height;
        if (w > h) {
          if (w > maxDim) { h = Math.round((h * maxDim) / w); w = maxDim; }
        } else {
          if (h > maxDim) { w = Math.round((w * maxDim) / h); h = maxDim; }
        }
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(img, 0, 0, w, h);
        profileAvatarData = canvas.toDataURL('image/jpeg', 0.8);
        sessionStorage.setItem('displayAvatar', profileAvatarData);
        renderAvatarPreview(profileAvatarData);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  if (avatarInputStart) {
    avatarInputStart.addEventListener('change', (e) => handleFileSelect(e.target.files[0]));
  }
  if (avatarInputJoin) {
    avatarInputJoin.addEventListener('change', (e) => handleFileSelect(e.target.files[0]));
  }

  applyLang(selectedLang);

  btnLangEn.addEventListener('click', () => {
    selectedLang = 'en';
    sessionStorage.setItem('myLang', 'en');
    applyLang('en');
  });

  btnLangZh.addEventListener('click', () => {
    selectedLang = 'zh';
    sessionStorage.setItem('myLang', 'zh');
    applyLang('zh');
  });

  // ── Tab Switching ─────────────────────────────────────────────────────
  tabStartBtn.addEventListener('click', () => {
    tabStartBtn.classList.add('active');
    tabJoinBtn.classList.remove('active');
    contentStart.classList.remove('hidden');
    contentJoin.classList.add('hidden');
  });

  tabJoinBtn.addEventListener('click', () => {
    tabJoinBtn.classList.add('active');
    tabStartBtn.classList.remove('active');
    contentJoin.classList.remove('hidden');
    contentStart.classList.add('hidden');
  });

  // ── Helper to extract room code from raw string or full URL ──────────
  function extractRoomCode(str) {
    if (!str) return '';
    str = str.trim();
    // If it's a URL (or contains http/https/?room=), extract the room parameter
    try {
      if (str.includes('http://') || str.includes('https://') || str.includes('?room=')) {
        // Handle full URLs like http://localhost:3000/?room=ABCD1234
        const urlObj = new URL(str.startsWith('http') ? str : `http://dummy.com/${str.startsWith('?') ? str : '?' + str}`);
        const codeParam = urlObj.searchParams.get('room');
        if (codeParam) str = codeParam;
      }
    } catch (e) {
      // Fallback regex parsing if URL object parsing fails
      const match = str.match(/[?&]room=([^&]+)/i);
      if (match && match[1]) str = match[1];
    }
    // Clean up non-alphanumeric chars and uppercase
    return str.toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  // Auto-switch to Join tab if URL has ?room= parameter
  const params = new URLSearchParams(window.location.search);
  if (params.has('room')) {
    const rawCode = params.get('room');
    const cleanCode = extractRoomCode(rawCode);
    if (roomCodeInput) roomCodeInput.value = cleanCode;
    tabJoinBtn.click();
  }

  // ── Room code input: handle paste & typing ────────────────────────────
  if (roomCodeInput) {
    roomCodeInput.addEventListener('input', () => {
      roomCodeInput.value = extractRoomCode(roomCodeInput.value);
    });

    roomCodeInput.addEventListener('paste', (e) => {
      e.preventDefault();
      const pastedData = (e.clipboardData || window.clipboardData).getData('text');
      roomCodeInput.value = extractRoomCode(pastedData);
    });
  }

  // ── Generate code ─────────────────────────────────────────────────────
  function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  // ── Navigate to call page ─────────────────────────────────────────────
  function goToCall(roomCode) {
    sessionStorage.setItem('myLang', selectedLang);
    sessionStorage.setItem('roomCode', roomCode);
    window.location.href = `/call.html?room=${encodeURIComponent(roomCode)}`;
  }

  // ── Create Room ───────────────────────────────────────────────────────
  createRoomBtn.addEventListener('click', () => {
    const name = (nameInputStart?.value.trim()) || '';
    sessionStorage.setItem('displayName', name);
    goToCall(generateCode());
  });

  // ── Join Room ─────────────────────────────────────────────────────────
  joinRoomBtn.addEventListener('click', () => {
    const code = extractRoomCode(roomCodeInput?.value || '');
    if (code.length < 4) {
      alert(selectedLang === 'zh' ? '请输入有效的房间代码（至少4位）。' : 'Please enter a valid room code (at least 4 characters).');
      return;
    }
    const name = (nameInputJoin?.value.trim()) || '';
    sessionStorage.setItem('displayName', name);
    goToCall(code);
  });

  if (roomCodeInput) {
    roomCodeInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') joinRoomBtn.click();
    });
  }

})();
