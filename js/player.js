// Цагийн хуваарийг тоглуулна: бичлэгүүдийг цагтай нь тааруулж, кадр бүрийг зурна.
// Events: 'time', 'play', 'pause', 'ended'

import { activeLayers, sourceTime } from './timeline.js';

export class Player extends EventTarget {
  constructor(renderer, audio) {
    super();
    this.renderer = renderer;
    this.audio = audio;
    this.timeline = { duration: 0, segments: [], fade: 0 };
    this.assets = new Map();
    this.opts = {};
    this.t = 0;
    this.playing = false;
    this.latencyComp = true; // урьдчилан харахад чанга яригчийн хоцролтыг нөхнө (экспортод унтраана)
    this._segOf = new Map(); // assetId → сүүлд тоглуулсан сегмент (cut бүрт бодит seek хийхэд)
    this._raf = 0;
    this._startT = 0;
    this._startWall = 0;
    this._redraw = () => this._draw();
    this._tick = this._tick.bind(this);
  }

  get duration() {
    return this.timeline.duration;
  }

  load(timeline, assets) {
    this.pause();
    this.timeline = timeline;
    this.assets = new Map(assets.map((a) => [a.id, a]));
    this.seek(Math.min(this.t, timeline.duration));
  }

  play(from) {
    if (!this.duration) return;
    if (from !== undefined) this.t = from;
    if (this.t >= this.duration - 0.01) this.t = 0;
    this.playing = true;
    this._restartClock();
    this._sync();
    this._schedule();
    this.dispatchEvent(new Event('play'));
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    cancelAnimationFrame(this._raf);
    clearTimeout(this._timer);
    this.audio?.stop();
    for (const a of this.assets.values()) if (a.kind === 'video') a.el.pause();
    this.dispatchEvent(new Event('pause'));
  }

  seek(t) {
    this.t = Math.min(Math.max(0, t), this.duration);
    if (this.playing) this._restartClock();
    this._sync();
    this._draw();
    this.dispatchEvent(new Event('time'));
  }

  redraw() {
    this._draw();
  }

  // Тухайн агшны бичлэгүүдийг байрлуулж, эхний кадр зурагдах хүртэл хүлээнэ (экспортын өмнө)
  async prepare(t) {
    this.pause();
    this.seek(t);
    const videos = activeLayers(this.timeline, this.t)
      .filter(({ seg }) => seg.type === 'clip' && seg.kind === 'video')
      .map(({ seg }) => this.assets.get(seg.assetId).el);
    await Promise.all(videos.map(waitFrame));
    this._draw();
  }

  _restartClock() {
    this._startT = this.t;
    this._startWall = performance.now();
    this.audio?.start(this.t, this.duration);
    // Дуу ctx.currentTime+0.02 дээр эхэлж, чанга яригч (Bluetooth 100–250мс) хоцроодог — видеог мөн тэр хэрээр хойшлуулна
    if (this.latencyComp && this.audio?.buffer) this._startWall += (0.02 + (this.audio.outputLatency?.() ?? 0)) * 1000;
    this._segOf.clear();
  }

  _tick() {
    if (!this.playing) return;
    this.t = Math.max(this._startT, this._startT + (performance.now() - this._startWall) / 1000);
    if (this.t >= this.duration) {
      this.t = this.duration;
      this._draw();
      this.pause();
      this.dispatchEvent(new Event('time'));
      this.dispatchEvent(new Event('ended'));
      return;
    }
    this._sync();
    this._draw();
    this.dispatchEvent(new Event('time'));
    this._schedule();
  }

  // Цонх далд байхад rAF зогсдог — тэр үед timer-ээр үргэлжлүүлнэ (удаан ч гэсэн дуусна)
  _schedule() {
    if (document.hidden) this._timer = setTimeout(this._tick, 1000 / 30);
    else this._raf = requestAnimationFrame(this._tick);
  }

  _draw() {
    this.renderer.draw(this.t, this.timeline, this.assets, this.opts);
  }

  _sync() {
    const t = this.t;
    const keep = new Set();
    for (const { seg } of activeLayers(this.timeline, t)) {
      if (seg.type !== 'clip' || seg.kind !== 'video') continue;
      const asset = this.assets.get(seg.assetId);
      const v = asset.el;
      const want = sourceTime(seg, t, asset);
      keep.add(asset.id);
      if (this.playing) {
        // Нэг бичлэг дараалсан сегментүүдэд орвол cut бүрт заавал seek хийнэ — үгүй бол зүгээр л үргэлжилж харагдана
        const newSeg = this._segOf.get(asset.id) !== seg;
        if (!v.seeking && (Math.abs(v.currentTime - want) > 0.3 || (newSeg && Math.abs(v.currentTime - want) > 0.05))) {
          v.currentTime = want;
        }
        this._segOf.set(asset.id, seg);
        if (v.paused) v.play().catch(() => {});
      } else {
        if (!v.paused) v.pause();
        if (Math.abs(v.currentTime - want) > 0.02) {
          v.currentTime = want;
          v.addEventListener('seeked', this._redraw, { once: true });
        }
      }
    }
    // Дараагийн бичлэгийг урьдчилж байрлуулна — огтлолт дээр гацахгүй
    if (this.playing) {
      const next = this.timeline.segments.find(
        (s) => s.start > t && s.type === 'clip' && s.kind === 'video' && !keep.has(s.assetId),
      );
      if (next && next.start - t < 1.5) {
        const v = this.assets.get(next.assetId).el;
        keep.add(next.assetId);
        if (v.paused && !v.seeking && Math.abs(v.currentTime - next.srcIn) > 0.05) v.currentTime = next.srcIn;
      }
    }
    for (const a of this.assets.values()) {
      if (a.kind === 'video' && !keep.has(a.id) && !a.el.paused) a.el.pause();
    }
  }
}

function waitFrame(v) {
  if (!v.seeking && v.readyState >= 2) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      v.removeEventListener('seeked', check);
      v.removeEventListener('canplay', check);
      resolve();
    };
    const check = () => {
      if (!v.seeking && v.readyState >= 2) done();
    };
    const timer = setTimeout(done, 4000);
    v.addEventListener('seeked', check);
    v.addEventListener('canplay', check);
  });
}
