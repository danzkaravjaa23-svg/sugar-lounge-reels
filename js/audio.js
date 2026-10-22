// Хөгжим: урьдчилан харахад чанга яригч руу, экспортын үед бичигч рүү гаргана.

export class AudioEngine {
  constructor(settings) {
    this.settings = { ...settings };
    this.ctx = null;
    this.buffer = null;
    this.output = null; // null = чанга яригч
    this._src = null;
  }

  ensureContext() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    }
    return this.ctx;
  }

  // iPhone дээр AudioContext-ийг товч дарсан агшинд асаах ёстой
  resume() {
    const ctx = this.ensureContext();
    return ctx.state === 'running' ? Promise.resolve() : ctx.resume();
  }

  // Чанга яригч/Bluetooth-ын хоцролт (сек) — урьдчилан харахад видеог тааруулахад
  outputLatency() {
    const ctx = this.ctx;
    if (!ctx) return 0;
    return Math.min(0.5, ctx.outputLatency || ctx.baseLatency || 0);
  }

  async loadFile(file) {
    const ctx = this.ensureContext();
    this.stop();
    this.buffer = await ctx.decodeAudioData(await file.arrayBuffer());
  }

  clear() {
    this.stop();
    this.buffer = null;
  }

  setOutput(node) {
    this.output = node;
  }

  // Цагийн хуваарийн t агшнаас эхлүүлнэ. Төгсгөлд нь аажмаар намжина.
  start(t, duration) {
    this.stop();
    if (!this.buffer || !this.ctx) return;
    const ctx = this.ctx;
    const { volume, fadeIn, fadeOut, offset } = this.settings;
    const remaining = duration - t;
    if (remaining <= 0) return;

    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    src.loop = true; // хөгжим богино бол давтана
    const gain = ctx.createGain();
    src.connect(gain).connect(this.output || ctx.destination);

    const now = ctx.currentTime + 0.02;
    const env = (x) => volume * Math.max(0, Math.min(1, fadeIn ? x / fadeIn : 1, fadeOut ? (duration - x) / fadeOut : 1));
    const fadeStart = duration - fadeOut;
    gain.gain.setValueAtTime(env(t), now);
    if (t < fadeIn) gain.gain.linearRampToValueAtTime(env(fadeIn), now + (fadeIn - t));
    if (t < fadeStart) gain.gain.setValueAtTime(env(fadeStart), now + (fadeStart - t));
    gain.gain.linearRampToValueAtTime(0, now + remaining);

    src.start(now, (offset + t) % this.buffer.duration);
    src.stop(now + remaining + 0.05);
    this._src = src;
  }

  stop() {
    if (!this._src) return;
    try {
      this._src.stop();
    } catch {
      // аль хэдийн зогссон
    }
    this._src.disconnect();
    this._src = null;
  }
}
