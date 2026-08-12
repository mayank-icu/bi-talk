/* captions.js — Subtitle Display Manager for Thread Call Interface */

const Captions = (() => {
  const container       = document.getElementById('captions-container');
  const langBadge       = document.getElementById('subtitle-lang-badge');
  let captionsEnabled   = true;
  let showOriginal      = false;
  let currentLang       = 'en';

  const placeholders = {
    en: 'Subtitles will appear here when speaking starts…',
    zh: '开始说话时，实时字幕将在此处显示…'
  };

  // ── Set Language Badge & Placeholder ──────────────────────────────────
  function setLanguage(lang) {
    currentLang = lang;
    if (langBadge) {
      langBadge.textContent = lang === 'zh' ? '文A 中文' : '文A EN';
    }
    const ph = document.getElementById('caption-placeholder');
    if (ph) {
      ph.textContent = placeholders[lang] || placeholders.en;
    }
  }

  // ── Public: add a new caption ────────────────────────────────────────
  function addCaption(translation, original = '') {
    if (!captionsEnabled || !container) return;

    // Remove placeholder text if present
    const placeholder = document.getElementById('caption-placeholder');
    if (placeholder) placeholder.remove();

    // Create caption line container
    const line = document.createElement('div');
    line.className = 'caption-line';
    line.textContent = translation;

    if (original) {
      const origLine = document.createElement('div');
      origLine.className = 'caption-line-original';
      origLine.textContent = original;
      origLine.style.display = showOriginal ? 'block' : 'none';
      origLine.dataset.originalText = 'true';
      line.appendChild(origLine);
    }

    container.appendChild(line);

    // Keep max 4 lines visible inside tall card
    while (container.children.length > 4) {
      container.removeChild(container.firstChild);
    }

    // Auto-scroll to bottom of card
    container.scrollTop = container.scrollHeight;
  }

  // ── Public: toggle captions on/off ──────────────────────────────────
  function toggleCaptions() {
    captionsEnabled = !captionsEnabled;
    const card = document.querySelector('.subtitle-card-container');
    if (card) card.style.display = captionsEnabled ? 'block' : 'none';
    return captionsEnabled;
  }

  // ── Public: toggle original text ────────────────────────────────────
  function toggleOriginal() {
    showOriginal = !showOriginal;
    container.querySelectorAll('[data-original-text]').forEach(el => {
      el.style.display = showOriginal ? 'block' : 'none';
    });
    return showOriginal;
  }

  // ── Public: clear all captions ──────────────────────────────────────
  function clear() {
    if (!container) return;
    const text = placeholders[currentLang] || placeholders.en;
    container.innerHTML = `<div id="caption-placeholder" class="caption-placeholder">${text}</div>`;
  }

  return { addCaption, setLanguage, toggleCaptions, toggleOriginal, clear };
})();
