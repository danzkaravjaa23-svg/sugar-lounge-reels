// Хөгжмийн BPM ба эхний beat-ийн цэгийг илрүүлнэ (Web Audio, сервер хэрэггүй).
// Арга: 100–150 Hz (бөмбөр/басс) зурвасыг шүүж, 0.5с цонх бүрийн оргилыг авч,
// оргилуудын хоорондын зайг BPM болгож саналын хуудас (histogram) үүсгэнэ.
// (JMPerez/Joe Sullivan-ы алгоритм — docs/LESSONS.md эх сурвалж)
//
// tempoRange = [lo, 2·lo) БҮТЭН октав байх ёстой: нарийн муж (90–135) 1-, 2-beat зайг хаяж
// 140→93, 85→113 гэх мэт буруу tempo "итгэлтэй" гаргадаг байсан.

export async function detectBeats(buffer, { tempoRange = [80, 160], analyzeSeconds = 60, from = 0 } = {}) {
  const sampleRate = buffer.sampleRate;
  const start = Math.max(0, Math.min(from, buffer.duration - 10));
  const seconds = Math.min(buffer.duration - start, analyzeSeconds);
  const length = Math.floor(seconds * sampleRate);
  if (length < sampleRate * 4) return null; // 4с-ээс богино бол найдваргүй

  const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new OfflineCtx(1, length, sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 150;
  lowpass.Q.value = 1;
  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 100;
  highpass.Q.value = 1;
  source.connect(lowpass).connect(highpass).connect(ctx.destination);
  source.start(0, start);
  const rendered = await ctx.startRendering();
  const data = rendered.getChannelData(0);

  // 0.5с цонх бүрийн хамгийн чанга цэг
  const win = Math.floor(sampleRate * 0.5);
  const peaks = [];
  for (let i = 0; i + win <= data.length; i += win) {
    let max = 0;
    let at = i;
    for (let j = i; j < i + win; j++) {
      const v = Math.abs(data[j]);
      if (v > max) {
        max = v;
        at = j;
      }
    }
    peaks.push({ at, v: max });
  }
  // Хамгийн чангын 40%-иас дээш бүх оргил. ("Тооны 50%" авбал далайц 5% хэлбэлзэхэд л 3 kick тутмын
  // нэгийг хаяж, 7-beat зайнууд буруу tempo-д санал өгдөг байсан: 140 → 80.)
  const maxV = peaks.reduce((m, p) => Math.max(m, p.v), 0);
  if (maxV <= 0) return null;
  const strong = peaks.filter((p) => p.v >= maxV * 0.4).sort((a, b) => a.at - b.at);
  if (strong.length < 6) return null;

  // Оргил хоорондын зай → BPM санал. Зай бүрийг нэг бүтэн октав руу нугална, хэзээ ч хаяхгүй.
  const lo = tempoRange[0];
  const hi = lo * 2;
  const fold = (x) => {
    while (x < lo) x *= 2;
    while (x >= hi) x /= 2;
    return x;
  };
  const votes = new Map(); // бүхэл BPM → санал
  const sums = new Map(); // бүхэл BPM → tempo нийлбэр (бутархай дундаж)
  let totalVotes = 0;
  for (let i = 0; i < strong.length; i++) {
    for (let j = i + 1; j < Math.min(strong.length, i + 10); j++) {
      const interval = (strong[j].at - strong[i].at) / sampleRate;
      if (interval <= 0) continue;
      const tempo = fold(60 / interval);
      let key = Math.round(tempo);
      if (key >= hi) key = lo;
      votes.set(key, (votes.get(key) || 0) + 1);
      sums.set(key, (sums.get(key) || 0) + tempo);
      totalVotes++;
    }
  }
  if (!totalVotes) return null;
  let bestKey = 0;
  let best = 0;
  for (const [key, n] of votes) {
    // Хөрш утгуудыг нийлүүлж тоолно (123/124/125 нэг л tempo)
    const score = n + (votes.get(key - 1) || 0) * 0.5 + (votes.get(key + 1) || 0) * 0.5;
    if (score > best) {
      best = score;
      bestKey = key;
    }
  }
  // Ялсан ангийн бутархай дундаж (123.6 гэх мэт) — урт дуунд grid-ийг хазайлгахгүй
  let num = 0;
  let den = 0;
  for (const k of [bestKey - 1, bestKey, bestKey + 1]) {
    if (votes.has(k)) {
      num += sums.get(k);
      den += votes.get(k);
    }
  }
  const bpm = Math.round((num / den) * 10) / 10;
  const confidence = Math.min(1, best / totalVotes);

  const strongPeaks = strong.slice(0, 40).map((p) => ({ t: start + p.at / sampleRate, v: p.v }));
  const offset = phaseFor(strongPeaks, bpm);
  const beat = 60 / bpm;
  return { bpm, offset, beat, bar: beat * 4, confidence, peaks: strongPeaks, analyzedFrom: start };
}

// Өгөгдсөн BPM-д (гараар оруулсан ч) хүчтэй оргилуудаас эхний beat-ийн цэгийг олно (абсолют секунд)
export function phaseFor(peaks, bpm) {
  const beat = 60 / bpm;
  const bins = 16;
  const hist = new Array(bins).fill(0);
  for (const p of peaks) hist[Math.floor(((p.t % beat) / beat) * bins) % bins] += p.v;
  let bin = 0;
  for (let i = 1; i < bins; i++) if (hist[i] > hist[bin]) bin = i;
  return ((bin + 0.5) / bins) * beat;
}

// BPM-ээ мэдэж байгаа үед (гараар оруулсан) grid үүсгэнэ; peaks байвал фазыг тэр BPM-д дахин бодно
export function gridFor(bpm, peaks, fallbackOffset = 0) {
  const beat = 60 / bpm;
  const offset = peaks?.length ? phaseFor(peaks, bpm) : fallbackOffset;
  return { bpm, offset, beat, bar: beat * 4, confidence: 1, peaks };
}
