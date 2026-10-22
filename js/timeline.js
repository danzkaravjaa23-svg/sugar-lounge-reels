// Клипүүд + recipe (+ хөгжмийн beat grid) → цагийн хуваарь. Цэвэр логик, DOM ашиглахгүй.
//
// Beat grid байвал cut бүр бүтэн beat-ийн тоо, нийт урт бүтэн bar, outro бүтэн beat.
// t ХЭЗЭЭ Ч grid-ээс гарахгүй: богино клипийг бүтэн beat-ээр тайрна, 1 beat ч багтахгүй бол алгасна.
// Энергийн муруй: hero барих → build → drop дээр 1-beat цуврал → hold → сүүл.
// Outro = сүүлийн клип үргэлжилж, дээр нь текст (timeline.outroStart-аас).

import { bestWindow } from './analyze.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function buildTimeline(assets, recipe, opts = {}) {
  const { timing, outro, transition, beatSync, energyCurve } = recipe;
  const segments = [];
  const fade = transition.type === 'fade' ? transition.duration : 0;
  if (!assets.length) return { duration: 0, segments, fade, outroStart: 0, grid: null };

  const grid = beatSync.enabled && opts.beats ? opts.beats : null;
  const beat = grid?.beat ?? null;

  let total = Math.min(timing.targetDuration, timing.maxDuration);
  if (grid && beatSync.snapToBars) total = Math.max(grid.bar, Math.round(total / grid.bar) * grid.bar);
  let outroLen = outro.enabled ? Math.min(outro.duration, total * 0.4) : 0;
  if (outroLen > 0 && beat) {
    // Outro руу орох cut ч beat дээр буух ёстой — бүтэн beat, 40%-ийн дотор
    const maxBeats = Math.max(1, Math.floor((total * 0.4) / beat + 1e-9));
    outroLen = clamp(Math.round(outroLen / beat), 1, maxBeats) * beat;
  }
  const bodyEnd = total - outroLen;

  // Ижил клипүүд → ижил монтаж. Дараалал солиход зөвхөн аль клип аль slot-д орох нь өөрчлөгдөнө.
  const seedKey = [...assets].map((a) => a.id + a.name).sort().join('|');
  const rng = mulberry32(opts.seed ?? hashString(seedKey));

  const availOf = (a) => Math.max(0.3, a.duration - 0.1);
  const fits = (a) => a.kind !== 'video' || !beat || availOf(a) >= beat;
  const skipShort = !!beat && assets.some(fits); // бүгд богино бол л хуучин шигээ хэрэглэнэ — reel хоосон үлдэхгүй

  // Grid горимд cut-ын урт = жинтэй beat тоо; minClip/maxClip-д (±10%) багтахгүй утгыг хасна
  const allowed = beat ? filterWeights(beatSync.weights, beat, timing) : null;

  const cursors = new Map(); // assetId → дараагийн srcIn (нэг клипийг дахин ашиглахад өөр хэсгийг авна)
  const recent = [];
  const curve = energyCurve.enabled && grid;
  let phase = curve ? 'hero' : 'free';
  let burstLeft = 0;
  const dropAt = total * energyCurve.dropAt;
  let t = 0;
  let i = 0;

  while (t < bodyEnd - 1e-3 && i < 400) {
    const asset = assets[i % assets.length];
    if (skipShort && !fits(asset)) {
      i++;
      continue;
    }
    let len;

    if (beat) {
      let nb;
      if (phase === 'hero') {
        nb = energyCurve.heroHoldBeats;
        phase = 'build';
      } else if (phase === 'build' && t >= dropAt) {
        phase = 'drop';
        burstLeft = energyCurve.dropBurstCuts;
      }
      if (phase === 'drop') {
        nb = 1; // drop дээр л 1-beat cut зөвшөөрнө
        if (--burstLeft <= 0) phase = 'hold';
      } else if (phase === 'hold') {
        nb = energyCurve.postDropHoldBeats;
        phase = 'tail';
      }
      if (nb === undefined) nb = pickBeats(allowed, rng, recent, beatSync.maxSameInRow);
      if (segments.length === 0) nb = Math.max(nb, Math.ceil(timing.firstClipMin / beat - 1e-9));
      // Богино бичлэг: бүтэн beat-ийн тоогоор багасгана — t үргэлж grid дээр үлдэнэ
      if (asset.kind === 'video') nb = Math.min(nb, Math.max(1, Math.floor(availOf(asset) / beat + 1e-9)));
      recent.push(nb);
      len = nb * beat;
    } else {
      len = timing.minClip + rng() * (timing.maxClip - timing.minClip);
      if (segments.length === 0) len = Math.max(len, timing.firstClipMin);
      if (asset.kind === 'video' && len > availOf(asset)) len = availOf(asset);
    }

    let srcIn = 0;
    if (asset.kind === 'video') {
      if (len > availOf(asset)) len = availOf(asset); // зөвхөн бүх клип 1 beat-ээс богино үед
      srcIn = pickSource(asset, len, cursors, timing.pickFrom, beat);
    }
    if (t + len > bodyEnd) len = bodyEnd - t;
    if (len < 0.15) break;

    segments.push({ type: 'clip', kind: asset.kind, assetId: asset.id, start: t, end: t + len, srcIn });
    t += len;
    i++;
  }

  if (outroLen > 0) {
    const holder = pickOutroAsset(assets, i, outroLen);
    if (holder) {
      const srcIn = holder.kind === 'video' ? pickSource(holder, outroLen, cursors, 'middle', beat) : 0;
      segments.push({ type: 'clip', kind: holder.kind, assetId: holder.id, start: t, end: t + outroLen, srcIn, outro: true });
    } else {
      segments.push({ type: 'outro', start: t, end: t + outroLen });
    }
    t += outroLen;
  }

  return { duration: t, segments, fade, outroStart: outroLen ? t - outroLen : t, grid };
}

// Жингийн түлхүүрүүдээс minClip/maxClip-д (±10%) багтах beat тоонуудыг үлдээнэ; юу ч үлдэхгүй бол хамгийн ойрхныг
function filterWeights(weights, beat, timing) {
  const entries = Object.entries(weights).map(([k, w]) => [Number(k), w]).filter(([k, w]) => k > 0 && w > 0);
  const ok = entries.filter(([k]) => k * beat >= timing.minClip * 0.9 && k * beat <= timing.maxClip * 1.1);
  if (ok.length) return ok;
  const mid = (timing.minClip + timing.maxClip) / 2;
  const nearest = entries.reduce((b, e) => (Math.abs(e[0] * beat - mid) < Math.abs(b[0] * beat - mid) ? e : b));
  return [nearest];
}

// Жинтэй санамсаргүй beat тоо; ижил урт maxSame-аас олон удаа дараалахгүй
function pickBeats(entries, rng, recent, maxSame) {
  if (entries.length === 1) return entries[0][0];
  const sum = entries.reduce((s, [, w]) => s + w, 0);
  const last = recent.slice(-maxSame);
  const repeating = last.length >= maxSame && last.every((x) => x === last[0]);
  const pool = repeating ? entries.filter(([k]) => k !== last[0]) : entries;
  const poolSum = repeating ? pool.reduce((s, [, w]) => s + w, 0) : sum;
  let r = rng() * poolSum;
  for (const [k, w] of pool) {
    if ((r -= w) <= 0) return k;
  }
  return pool[pool.length - 1][0];
}

// Бичлэгийн аль хэсгийг авах: эхний удаад peak/middle/start, дараа нь үргэлжлүүлэн (бодит cut болохуйц зайтай)
function pickSource(asset, len, cursors, mode, beat) {
  const maxStart = Math.max(0, asset.duration - len - 0.05);
  let start;
  if (!cursors.has(asset.id)) {
    if (mode === 'peak') start = bestWindow(asset.analysis, asset.duration, len);
    else if (mode === 'start') start = Math.min(0.3, maxStart);
    else start = maxStart / 2;
  } else {
    start = cursors.get(asset.id);
    if (start > maxStart) start = maxStart > 0 ? (start * 0.37) % maxStart : 0; // өөр хэсэг рүү эргэнэ
  }
  start = clamp(start, 0, maxStart);
  cursors.set(asset.id, start + len + Math.max(0.5, beat ?? 0));
  return start;
}

// Outro-г барих клип: дарааллын дараагийн, outro-гийн уртад хүрэх бичлэг эсвэл зураг
function pickOutroAsset(assets, nextIndex, outroLen) {
  for (let k = 0; k < assets.length; k++) {
    const a = assets[(nextIndex + k) % assets.length];
    if (a.kind === 'image' || a.duration >= outroLen + 0.2) return a;
  }
  return null;
}

// t агшинд зурагдах давхаргууд (доороос дээш), alpha-тай
export function activeLayers(timeline, t) {
  const { segments, fade } = timeline;
  if (!segments.length) return [];
  let idx = segments.findIndex((s) => t >= s.start && t < s.end);
  if (idx === -1) idx = t < 0 ? 0 : segments.length - 1;
  const cur = segments[idx];
  const local = t - cur.start;
  const prev = segments[idx - 1];
  // Нэг бичлэгийг өөртэй нь cross-fade хийхгүй (нэг <video> хоёр цагт байж чадахгүй)
  if (fade && prev && local < fade && prev.assetId !== cur.assetId) {
    return [
      { seg: prev, alpha: 1 },
      { seg: cur, alpha: local / fade },
    ];
  }
  return [{ seg: cur, alpha: 1 }];
}

export function sourceTime(seg, t, asset) {
  const st = seg.srcIn + (t - seg.start);
  return clamp(st, 0, Math.max(0, asset.duration - 0.05));
}

// Тогтвортой санамсаргүй тоо — ижил клипүүд ижил монтаж өгнө (хэрэглэгч гайхахгүй)
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
