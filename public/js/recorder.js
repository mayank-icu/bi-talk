/* recorder.js — Speech-triggered audio chunker
 *
 * Listens to VAD events and records audio chunks using MediaRecorder.
 * Each chunk (speechstart → speechend) is emitted as an audio Blob.
 *
 * Usage:
 *   const recorder = createRecorder(stream, onChunk);
 *   // onChunk(blob, mimeType) is called for each complete speech segment
 *   recorder.destroy();
 */

function createRecorder(stream, onChunk) {
  const MAX_CHUNK_MS  = 5000;  // force-flush after 5s (safety limit)
  const MIN_CHUNK_MS  = 300;   // discard chunks shorter than this

  // Pick best supported MIME type
  const MIME_TYPES = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
  ];
  const mimeType = MIME_TYPES.find(m => MediaRecorder.isTypeSupported(m)) || '';

  let mediaRecorder = null;
  let chunks = [];
  let startTime = 0;
  let maxTimer = null;

  // Create VAD on the audio-only clone of the stream
  const audioStream = new MediaStream(stream.getAudioTracks());
  const vad = createVAD(audioStream, {
    threshold:     0.013,
    speakingMinMs: 120,
    silenceMinMs:  850,
  });

  function startRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') return;

    chunks = [];
    startTime = Date.now();

    const opts = mimeType ? { mimeType } : {};
    mediaRecorder = new MediaRecorder(audioStream, opts);

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const duration = Date.now() - startTime;
      clearTimeout(maxTimer);
      maxTimer = null;

      if (duration < MIN_CHUNK_MS || chunks.length === 0) return; // discard tiny blips

      const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
      onChunk(blob, mimeType || 'audio/webm');
      chunks = [];
    };

    mediaRecorder.start(100); // collect data every 100ms for smoother streaming

    // Safety timeout: force stop after MAX_CHUNK_MS
    maxTimer = setTimeout(() => {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        // Restart immediately so we don't miss ongoing speech
        setTimeout(startRecording, 50);
      }
    }, MAX_CHUNK_MS);
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }
  }

  vad.on('speechstart', startRecording);
  vad.on('speechend', stopRecording);

  function destroy() {
    vad.destroy();
    stopRecording();
  }

  return { vad, destroy };
}
