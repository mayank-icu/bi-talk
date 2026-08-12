/* audio-mixer.js — Continuous Call Audio Recorder
 *
 * Mixes local mic audio and remote WebRTC audio into a single AudioContext destination,
 * recording both participants continuously using MediaRecorder.
 */
class CallAudioRecorder {
  constructor(localStream) {
    this.localStream = localStream;
    this.remoteStream = null;
    this.audioCtx = null;
    this.destination = null;
    this.localSource = null;
    this.remoteSource = null;
    this.mediaRecorder = null;
    this.chunks = [];
    this.isRecording = false;

    this._init();
  }

  _init() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        console.warn('[CallAudioRecorder] Web Audio API not supported in this browser.');
        return;
      }

      this.audioCtx = new AudioCtx();
      this.destination = this.audioCtx.createMediaStreamDestination();

      // Connect local audio track if present
      if (this.localStream && this.localStream.getAudioTracks().length > 0) {
        this.localSource = this.audioCtx.createMediaStreamSource(this.localStream);
        this.localSource.connect(this.destination);
      }

      // Determine best audio mimeType
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
      ];
      this.mimeType = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || '';

      const opts = this.mimeType ? { mimeType: this.mimeType } : {};
      this.mediaRecorder = new MediaRecorder(this.destination.stream, opts);

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.chunks.push(e.data);
        }
      };

      this.mediaRecorder.start(250); // Slice data every 250ms
      this.isRecording = true;
      console.log('[CallAudioRecorder] Call recording started with mimeType:', this.mimeType || 'default');

    } catch (err) {
      console.error('[CallAudioRecorder] Failed to initialize call audio recorder:', err);
    }
  }

  addRemoteStream(remoteStream) {
    if (!this.audioCtx || !this.destination) return;
    if (!remoteStream || remoteStream.getAudioTracks().length === 0) return;

    try {
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      if (this.remoteSource) {
        try { this.remoteSource.disconnect(); } catch (e) {}
      }

      this.remoteStream = remoteStream;
      this.remoteSource = this.audioCtx.createMediaStreamSource(remoteStream);
      this.remoteSource.connect(this.destination);
      console.log('[CallAudioRecorder] Connected remote audio stream to mixer');
    } catch (err) {
      console.error('[CallAudioRecorder] Error adding remote stream to mixer:', err);
    }
  }

  async stopAndGetBlob() {
    if (!this.isRecording || !this.mediaRecorder) {
      if (this.chunks.length > 0) {
        return new Blob(this.chunks, { type: this.mimeType || 'audio/webm' });
      }
      return null;
    }

    return new Promise((resolve) => {
      this.mediaRecorder.onstop = () => {
        this.isRecording = false;
        const blob = new Blob(this.chunks, { type: this.mimeType || 'audio/webm' });
        console.log(`[CallAudioRecorder] Recording stopped. Total size: ${(blob.size / 1024).toFixed(1)} KB`);
        
        // Clean up audio context
        if (this.audioCtx && this.audioCtx.state !== 'closed') {
          this.audioCtx.close().catch(() => {});
        }
        resolve(blob);
      };

      try {
        this.mediaRecorder.stop();
      } catch (err) {
        console.error('[CallAudioRecorder] Error stopping mediaRecorder:', err);
        resolve(this.chunks.length > 0 ? new Blob(this.chunks, { type: this.mimeType || 'audio/webm' }) : null);
      }
    });
  }
}
