/* vad.js — Energy-based Voice Activity Detection
 *
 * Uses the Web Audio API's AnalyserNode to compute per-frame RMS energy.
 * Emits 'speechstart' and 'speechend' custom events on the returned object.
 *
 * Usage:
 *   const vad = createVAD(mediaStream);
 *   vad.on('speechstart', () => { ... });
 *   vad.on('speechend',   () => { ... });
 *   vad.destroy();
 */

function createVAD(stream, options = {}) {
  const {
    threshold       = 0.012,   // RMS energy threshold (0–1 scale)
    speakingMinMs   = 100,     // must exceed threshold for this long → speaking
    silenceMinMs    = 900,     // must be below threshold for this long → silent
    sampleInterval  = 30,      // check energy every N ms
  } = options;

  const listeners = { speechstart: [], speechend: [] };

  function on(event, fn) { listeners[event].push(fn); }
  function emit(event) { listeners[event].forEach(fn => fn()); }

  // Set up AudioContext
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.3;
  source.connect(analyser);

  const buf = new Float32Array(analyser.fftSize);

  function getRMS() {
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.sqrt(sum / buf.length);
  }

  let speaking = false;
  let speakingTimer = null;
  let silenceTimer = null;

  const intervalId = setInterval(() => {
    const rms = getRMS();
    const loud = rms > threshold;

    if (!speaking) {
      if (loud) {
        // Start timing: are we genuinely speaking?
        if (!speakingTimer) {
          speakingTimer = setTimeout(() => {
            speaking = true;
            emit('speechstart');
            speakingTimer = null;
          }, speakingMinMs);
        }
        // Cancel any pending silence timer
        clearTimeout(silenceTimer);
        silenceTimer = null;
      } else {
        clearTimeout(speakingTimer);
        speakingTimer = null;
      }
    } else {
      // Currently speaking
      if (!loud) {
        if (!silenceTimer) {
          silenceTimer = setTimeout(() => {
            speaking = false;
            emit('speechend');
            silenceTimer = null;
          }, silenceMinMs);
        }
      } else {
        clearTimeout(silenceTimer);
        silenceTimer = null;
      }
    }
  }, sampleInterval);

  function destroy() {
    clearInterval(intervalId);
    clearTimeout(speakingTimer);
    clearTimeout(silenceTimer);
    source.disconnect();
    ctx.close();
  }

  return { on, destroy };
}
