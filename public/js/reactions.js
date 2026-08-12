/* reactions.js — Super Reactions & Emoji Picker for Thread Call
 *
 * Features:
 *  - Glassmorphic emoji slider modal (minimized by default, toggling on button click)
 *  - 5 curated high-expression emojis: ❤️, 👍, 😂, 👏, 🎉
 *  - Super React Animation:
 *     1. Multi-particle floating emoji fountain ascending with physics sway
 *     2. Big Hero pop elastic spring rebound
 *     3. Speaker avatar pulsing aura & floating badge
 *     4. Synthetic Web Audio chime / pop sound effect
 *  - Synchronized across both peers over WebRTC DataChannel
 */

window.Reactions = (function () {
  'use strict';

  // Available emojis (4-5 options as requested)
  const EMOJIS = [
    { symbol: '❤️', label: 'Love',    color: '#ff4b72' },
    { symbol: '👍', label: 'Thumbs Up', color: '#ffb703' },
    { symbol: '😂', label: 'Joy',     color: '#ffd166' },
    { symbol: '👏', label: 'Clap',    color: '#06d6a0' },
    { symbol: '🎉', label: 'Party',   color: '#118ab2' }
  ];

  let pickerContainer = null;
  let overlayContainer = null;
  let reactionBtn = null;
  let onSelectCallback = null;
  let isOpen = false;
  let audioCtx = null;

  // ── Web Audio Synth Pop/Chime ──────────────────────────────────────
  function playReactionSound(emojiSymbol) {
    try {
      if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        audioCtx = new AudioContext();
      }

      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const now = audioCtx.currentTime;

      // Select pitch frequency based on emoji
      let baseFreq = 523.25; // C5
      if (emojiSymbol === '❤️') baseFreq = 587.33; // D5
      if (emojiSymbol === '😂') baseFreq = 659.25; // E5
      if (emojiSymbol === '👏') baseFreq = 698.46; // F5
      if (emojiSymbol === '🎉') baseFreq = 783.99; // G5

      // Oscillator 1 (Main Pop)
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(baseFreq, now);
      osc1.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, now + 0.12);

      gain1.gain.setValueAtTime(0.25, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);

      osc1.start(now);
      osc1.stop(now + 0.35);

      // Oscillator 2 (Sparkle high chime)
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(baseFreq * 2, now + 0.05);
      osc2.frequency.exponentialRampToValueAtTime(baseFreq * 2.5, now + 0.25);

      gain2.gain.setValueAtTime(0.15, now + 0.05);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);

      osc2.start(now + 0.05);
      osc2.stop(now + 0.4);

    } catch (e) {
      // Audio autoplay policy restriction or unsupported browser
    }
  }

  // ── Initialize Reactions Engine ──────────────────────────────────
  function init(options) {
    reactionBtn = options.btnEl;
    onSelectCallback = options.onSelect;

    // Create reaction overlay container inside call-container if not exists
    const callContainer = document.querySelector('.call-container') || document.body;
    
    if (!document.getElementById('super-react-overlay')) {
      overlayContainer = document.createElement('div');
      overlayContainer.id = 'super-react-overlay';
      overlayContainer.className = 'super-react-overlay';
      callContainer.appendChild(overlayContainer);
    } else {
      overlayContainer = document.getElementById('super-react-overlay');
    }

    // Build the Emoji Picker Slider Modal
    buildPickerSlider(callContainer);

    // Global listener to close picker on click outside
    document.addEventListener('click', (e) => {
      if (!isOpen) return;
      if (
        pickerContainer && !pickerContainer.contains(e.target) &&
        reactionBtn && !reactionBtn.contains(e.target)
      ) {
        closePicker();
      }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) {
        closePicker();
      }
    });
  }

  // ── Build Glassmorphic Emoji Slider Modal ───────────────────────
  function buildPickerSlider(parent) {
    if (document.getElementById('reaction-picker-slider')) {
      pickerContainer = document.getElementById('reaction-picker-slider');
      return;
    }

    pickerContainer = document.createElement('div');
    pickerContainer.id = 'reaction-picker-slider';
    pickerContainer.className = 'reaction-picker-slider minimized';

    const innerWrap = document.createElement('div');
    innerWrap.className = 'reaction-slider-track';

    EMOJIS.forEach((item) => {
      const btn = document.createElement('button');
      btn.className = 'emoji-picker-btn';
      btn.type = 'button';
      btn.title = item.label;
      btn.setAttribute('aria-label', item.label);
      btn.innerHTML = `<span class="emoji-symbol">${item.symbol}</span>`;

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // Trigger local reaction
        if (typeof onSelectCallback === 'function') {
          onSelectCallback(item.symbol);
        }

        // Quick pop animation feedback on button
        btn.classList.add('pop-active');
        setTimeout(() => btn.classList.remove('pop-active'), 250);

        // Close picker after selection smoothly
        setTimeout(() => {
          closePicker();
        }, 150);
      });

      innerWrap.appendChild(btn);
    });

    pickerContainer.appendChild(innerWrap);
    parent.appendChild(pickerContainer);
  }

  // ── Toggle / Open / Close Picker Slider ──────────────────────────
  function togglePicker() {
    if (isOpen) {
      closePicker();
    } else {
      openPicker();
    }
  }

  function openPicker() {
    if (!pickerContainer) return;
    isOpen = true;
    pickerContainer.classList.remove('minimized');
    pickerContainer.classList.add('visible');
    if (reactionBtn) reactionBtn.classList.add('active-picker');
  }

  function closePicker() {
    if (!pickerContainer) return;
    isOpen = false;
    pickerContainer.classList.remove('visible');
    pickerContainer.classList.add('minimized');
    if (reactionBtn) reactionBtn.classList.remove('active-picker');
  }

  // ── Trigger Super React (Both Users Device) ──────────────────────
  function triggerSuperReact(emojiSymbol, isMine = true, senderName = '') {
    if (!overlayContainer) return;

    // 1. Play synthesized chime sound
    playReactionSound(emojiSymbol);

    // 2. Pulse speaker avatar with glowing aura and floating badge
    pulseAvatar(isMine, emojiSymbol);

    // 3. Create Big Hero Emoji Elastic Pop in Center
    createHeroPop(emojiSymbol);

    // 4. Create Fountain of Floating Animated Emojis across screen
    createParticleFountain(emojiSymbol, isMine);

    // 5. Show short Toast pill
    showReactionToast(emojiSymbol, isMine, senderName);
  }

  // ── Avatar Pulse & Reaction Badge ────────────────────────────────
  function pulseAvatar(isMine, emojiSymbol) {
    const avatarCircleId = isMine ? 'local-avatar-circle' : 'remote-avatar-circle';
    const circle = document.getElementById(avatarCircleId);
    if (!circle) return;

    // Add aura class
    circle.classList.add('super-react-aura');
    setTimeout(() => circle.classList.remove('super-react-aura'), 1800);

    // Attach floating avatar badge
    const badge = document.createElement('div');
    badge.className = 'avatar-reaction-badge';
    badge.textContent = emojiSymbol;
    circle.appendChild(badge);

    setTimeout(() => {
      badge.classList.add('fade-out');
      setTimeout(() => badge.remove(), 400);
    }, 1600);
  }

  // ── Hero Elastic Pop Animation ───────────────────────────────────
  function createHeroPop(emojiSymbol) {
    const hero = document.createElement('div');
    hero.className = 'super-react-hero';
    hero.innerHTML = `
      <span class="hero-emoji">${emojiSymbol}</span>
      <div class="hero-ring"></div>
    `;

    overlayContainer.appendChild(hero);

    // Self-destruct after animation completes
    setTimeout(() => {
      hero.remove();
    }, 1500);
  }

  // ── Multi-particle Floating Fountain ─────────────────────────────
  function createParticleFountain(emojiSymbol, isMine) {
    const particleCount = 16;
    const containerWidth = overlayContainer.clientWidth || 360;

    for (let i = 0; i < particleCount; i++) {
      const p = document.createElement('div');
      p.className = 'super-react-particle';
      p.textContent = emojiSymbol;

      // Random horizontal origin biased towards sender side
      let startXPercent;
      if (isMine) {
        startXPercent = 10 + Math.random() * 45; // 10% - 55%
      } else {
        startXPercent = 45 + Math.random() * 45; // 45% - 90%
      }

      // Randomize motion params
      const delayMs = Math.random() * 450;
      const durationSec = 1.8 + Math.random() * 1.2;
      const scale = 0.7 + Math.random() * 0.9; // 0.7x to 1.6x
      const horizontalDrift = (Math.random() - 0.5) * 120; // -60px to +60px
      const rotation = (Math.random() - 0.5) * 60; // -30deg to +30deg

      p.style.left = `${startXPercent}%`;
      p.style.bottom = `-20px`;
      p.style.animationDelay = `${delayMs}ms`;
      p.style.animationDuration = `${durationSec}s`;
      p.style.setProperty('--drift-x', `${horizontalDrift}px`);
      p.style.setProperty('--scale-val', `${scale}`);
      p.style.setProperty('--rot-val', `${rotation}deg`);

      overlayContainer.appendChild(p);

      setTimeout(() => {
        p.remove();
      }, delayMs + durationSec * 1000 + 100);
    }
  }

  // ── Reaction Toast Notification ──────────────────────────────────
  function showReactionToast(emojiSymbol, isMine, senderName) {
    const existing = document.querySelector('.reaction-toast-pill');
    if (existing) existing.remove();

    const pill = document.createElement('div');
    pill.className = `reaction-toast-pill ${isMine ? 'mine' : 'theirs'}`;
    const nameStr = isMine ? 'You' : (senderName || 'Partner');
    pill.innerHTML = `<span class="toast-emoji">${emojiSymbol}</span> <span>${nameStr} reacted!</span>`;

    overlayContainer.appendChild(pill);

    setTimeout(() => {
      pill.classList.add('show');
    }, 20);

    setTimeout(() => {
      pill.classList.remove('show');
      setTimeout(() => pill.remove(), 400);
    }, 2200);
  }

  return {
    init: init,
    togglePicker: togglePicker,
    openPicker: openPicker,
    closePicker: closePicker,
    triggerSuperReact: triggerSuperReact
  };
})();
