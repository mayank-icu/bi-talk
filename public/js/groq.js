/* groq.js — STT + Translation pipeline with live speech callbacks
 *
 * Flow per audio chunk:
 *   processChunk(blob, mimeType)
 *     → POST /api/transcribe  (Groq Whisper)      → onTranscribed(text, liveId)
 *     → POST /api/translate   (Groq Llama)         → onTranslated(original, translation, liveId)
 *     → DataChannel send { type:'caption', ... }
 */

const GroqPipeline = (() => {
  let _myLang       = 'en';
  let _getDC        = () => null;
  let _onTranscribed = null;  // (text, liveId) => void
  let _onTranslated  = null;  // (original, translation, liveId) => void
  let _currentLiveId = null;

  function init(lang, getDcFn, callbacks = {}) {
    _myLang         = lang;
    _getDC          = getDcFn;
    _onTranscribed  = callbacks.onTranscribed  || null;
    _onTranslated   = callbacks.onTranslated   || null;
  }

  function setLanguage(lang) { _myLang = lang; }

  function setLiveId(id) { _currentLiveId = id; }

  async function processChunk(blob, mimeType) {
    const liveId = _currentLiveId;
    let transcript = '';

    // 1. Transcribe
    try {
      const form = new FormData();
      form.append('audio', blob, `speech.${mimeType.split('/')[1] || 'webm'}`);
      form.append('language', _myLang);

      const res = await fetch('/api/transcribe', { method: 'POST', body: form });
      if (!res.ok) throw new Error(`Transcribe HTTP ${res.status}`);
      const data = await res.json();
      transcript = (data.text || '').trim();
    } catch (err) {
      console.error('[Groq] Transcribe error:', err);
      if (_onTranslated) _onTranslated('', '', liveId);
      return;
    }

    if (!transcript) {
      if (_onTranslated) _onTranslated('', '', liveId);
      return;
    }

    // Notify caller of transcript (to fill live bubble text)
    if (_onTranscribed) _onTranscribed(transcript, liveId);

    // 2. Translate
    const targetLang = _myLang === 'en' ? 'zh' : 'en';
    // null = translation not yet available (do NOT default to transcript — that's the wrong language)
    let translation = null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: transcript, from: _myLang, to: targetLang }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`Translate HTTP ${res.status}`);
      const data = await res.json();
      const raw = (data.translation || '').trim();
      // Only accept it if it's non-empty AND not identical to the source
      // (Groq sometimes echoes the input back if confused about language direction)
      translation = raw && raw !== transcript ? raw : null;
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('[Groq] Translate error (will show transcript only):', err.message);
      }
      translation = null; // never send wrong-language text to partner
    }

    // Notify caller to finalize the live speech bubble.
    // Pass translation as-is (null = no translation tag shown)
    if (_onTranslated) _onTranslated(transcript, translation, liveId);

    // 3. Only send to partner if we have a real translation
    if (translation) {
      const dc = _getDC();
      if (dc && dc.readyState === 'open') {
        dc.send(JSON.stringify({
          type:        'caption',
          msgId:       liveId,
          original:    transcript,
          translation: translation,
          fromLang:    _myLang,
          toLang:      targetLang,
        }));
      }
    }
  }

  return { init, setLanguage, setLiveId, processChunk };
})();
