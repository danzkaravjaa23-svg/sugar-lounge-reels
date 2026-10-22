// Бичлэгийн аль хэсэг нь хамгийн "амьд" (хөдөлгөөн, гэрлийн өөрчлөлт) болохыг хэмжинэ.
// Жижиг canvas дээр хэдэн кадр зурж, дараалсан кадрын ялгааг тоолно. Эхний 3с-ийн hook
// болон "peak" сонголтод ашиглана.

const SAMPLE_W = 48;
const SAMPLE_H = 86;

export async function analyzeMotion(video, { samples = 12 } = {}) {
  const dur = video.duration;
  if (!Number.isFinite(dur) || dur < 0.6) return null;
  const c = document.createElement('canvas');
  c.width = SAMPLE_W;
  c.height = SAMPLE_H;
  const g = c.getContext('2d', { willReadFrequently: true });
  const skip = Math.min(0.3, dur * 0.1); // эхний сэгсрэлтийг алгасна
  const step = (dur - skip) / samples;
  const points = [];
  let prev = null;
  const wasPaused = video.paused;
  const restoreTime = video.currentTime;

  for (let i = 0; i < samples; i++) {
    const t = skip + step * i;
    const ok = await seekTo(video, Math.min(t, dur - 0.05));
    if (!ok) continue;
    g.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);
    const px = g.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
    let luma = 0;
    let motion = 0;
    for (let p = 0; p < px.length; p += 4) {
      const l = 0.2126 * px[p] + 0.7152 * px[p + 1] + 0.0722 * px[p + 2];
      luma += l;
      if (prev) motion += Math.abs(l - prev[p >> 2]);
    }
    const n = px.length / 4;
    const cur = new Float32Array(n);
    for (let p = 0, k = 0; p < px.length; p += 4, k++) cur[k] = 0.2126 * px[p] + 0.7152 * px[p + 1] + 0.0722 * px[p + 2];
    points.push({ t, luma: luma / n / 255, motion: prev ? motion / n / 255 : 0 });
    prev = cur;
  }
  if (points.length > 1) points[0].motion = points[1].motion; // эхний цэг ялгаагүй тул хөршөөс авна

  video.currentTime = restoreTime;
  if (!wasPaused) video.play().catch(() => {});
  if (!points.length) return null;

  const peak = Math.max(...points.map((p) => p.motion));
  return { points, peak, step };
}

// len секундын хамгийн хөдөлгөөнтэй цонхны эхлэл
export function bestWindow(analysis, duration, len) {
  if (!analysis?.points?.length) return Math.max(0, (duration - len) / 2);
  const { points, step } = analysis;
  const span = Math.max(1, Math.round(len / step));
  let bestStart = points[0].t;
  let bestScore = -1;
  for (let i = 0; i + span <= points.length; i++) {
    let s = 0;
    for (let j = i; j < i + span; j++) s += points[j].motion;
    if (s > bestScore) {
      bestScore = s;
      bestStart = points[i].t;
    }
  }
  return Math.min(bestStart, Math.max(0, duration - len));
}

function seekTo(video, t) {
  return new Promise((resolve) => {
    const done = (ok) => {
      clearTimeout(timer);
      video.removeEventListener('seeked', onSeek);
      resolve(ok);
    };
    const onSeek = () => done(true);
    const timer = setTimeout(() => done(false), 1500);
    video.addEventListener('seeked', onSeek);
    video.currentTime = t;
  });
}
