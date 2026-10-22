// UI-г холбоно: загвар, файл нэмэх, дараалал, текст, хөгжим (BPM), урьдчилан харах, экспорт.

import { recipe as baseRecipe, resolveRecipe } from './recipe.js';
import { buildTimeline } from './timeline.js';
import { createRenderer } from './renderer.js';
import { Player } from './player.js';
import { AudioEngine } from './audio.js';
import { loadAsset, disposeAsset } from './media.js';
import { exportReel, pickMimeType } from './exporter.js';
import { detectBeats, gridFor } from './beats.js';
import { analyzeMotion } from './analyze.js';

const $ = (id) => document.getElementById(id);

// Хэрэглэгчийн сүүлд бичсэн текст, тохиргоог энэ төхөөрөмж дээр санана
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(`slr.${key}`);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`slr.${key}`, JSON.stringify(value));
    } catch {
      // хувийн цонх эсвэл дүүрсэн — санахгүй
    }
  },
};

// Хэв маяг шинэчлэгдсэн (хичээл орсон) бол текстийн хуучин хадгалсан утгыг шинэ анхдагчаар солино
try {
  if (store.get('recipeVersion', -1) !== baseRecipe.version) {
    for (const key of Object.keys(localStorage)) {
      if (/^slr\.(introText|outroLines)/.test(key)) localStorage.removeItem(key);
    }
    store.set('recipeVersion', baseRecipe.version);
  }
} catch {
  // Хадгалах сан хаалттай (cookie/site data блоклосон) — санахгүй горимоор үргэлжилнэ
}

// Идэвхтэй хэв маяг — preset солиход талбарууд нь нэг объект дотроо солигдоно (renderer нэг л объект уншина)
const recipe = resolveRecipe(baseRecipe, store.get('preset', 'vibe'));
function applyPreset(name) {
  const r = resolveRecipe(baseRecipe, name);
  for (const k of Object.keys(r)) recipe[k] = r[k];
  store.set('preset', name);
}

const state = {
  assets: [],
  timeline: null,
  beats: null,       // хөгжмөөс илрүүлсэн { bpm, offset, beat, bar, confidence, peaks }
  bpmOverride: null, // гараар өгсөн BPM — зөвхөн одоогийн дуунд (шинэ дуу сонгоход арилна)
  introText: '',
  outroLines: [],
  logo: null,
  showSafeZone: false,
  loading: 0, // уншиж буй файлын багц — энэ үед экспорт эхлүүлэхгүй (refresh() тоглуулагчийг зогсоодог)
  exporting: false,
  exportAbort: null,
  result: null,
};

const canvas = $('preview');
const renderer = createRenderer(canvas, recipe);
const audio = new AudioEngine({ ...recipe.music, offset: store.get('musicOffset', 0) });
const player = new Player(renderer, audio);
const pool = $('videoPool');

// ---------- Ерөнхий ----------

function renderOpts() {
  return {
    introText: state.introText,
    outroLines: state.outroLines,
    logo: state.logo,
    showSafeZone: state.showSafeZone && !state.exporting,
  };
}

function refresh() {
  state.timeline = buildTimeline(state.assets, recipe, { beats: activeGrid() });
  player.opts = renderOpts();
  player.load(state.timeline, state.assets);
  const has = state.assets.length > 0;
  $('stageEmpty').hidden = has;
  $('scrub').max = String(state.timeline.duration);
  $('scrub').disabled = !has || state.exporting;
  $('playBtn').disabled = !has || state.exporting;
  $('exportBtn').disabled = !has || state.loading > 0 || pickMimeType() === null;
  renderClipList();
  updateTime();
  updateBeatLabel();
  notifyNative();
}

function updateOpts() {
  player.opts = renderOpts();
  player.redraw();
}

function updateTime() {
  const d = player.duration;
  $('scrub').value = String(player.t);
  $('timeLabel').textContent = `${player.t.toFixed(1)} / ${d.toFixed(1)}с`;
}

let toastTimer = 0;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 4500);
}

// ---------- 0. Загвар ----------

function renderPresets() {
  const sel = $('preset');
  sel.replaceChildren(
    ...Object.entries(baseRecipe.presets).map(([key, p]) => {
      const o = document.createElement('option');
      o.value = key;
      o.textContent = p.label;
      return o;
    }),
  );
  sel.value = recipe.preset;
  $('presetHint').textContent = baseRecipe.presets[recipe.preset]?.hint ?? '';
}

$('preset').addEventListener('change', (e) => {
  if (state.exporting) {
    e.target.value = recipe.preset;
    return;
  }
  player.pause();
  applyPreset(e.target.value);
  $('presetHint').textContent = baseRecipe.presets[recipe.preset]?.hint ?? '';
  Object.assign(audio.settings, { volume: recipe.music.volume, fadeIn: recipe.music.fadeIn, fadeOut: recipe.music.fadeOut });
  loadTexts();
  refresh();
  syncMusicOffset();
});

// ---------- 1. Бичлэг ба зураг ----------

async function addFiles(files) {
  const all = [...files];
  const list = all.filter((f) => /^(video|image)\//.test(f.type) || /\.(mov|mp4|m4v|webm|jpe?g|png|heic|heif|webp)$/i.test(f.name));
  if (state.exporting) return;
  if (!list.length) {
    if (all.length) toast('Зөвхөн бичлэг эсвэл зураг сонгоно уу.');
    return;
  }
  const problems = [];
  if (all.length > list.length) problems.push(`${all.length - list.length} файл бичлэг/зураг биш тул алгаслаа.`);
  const firstBatch = state.assets.length === 0;
  state.loading++;
  $('exportBtn').disabled = true;
  $('clipStatus').hidden = false;
  try {
    for (const [i, file] of list.entries()) {
      $('clipStatus').textContent = `Уншиж байна… ${i + 1}/${list.length}`;
      try {
        const asset = await loadAsset(file, pool);
        state.assets.push(asset);
        notifyNative();
        if (asset.kind === 'video') {
          $('clipStatus').textContent = `Хөдөлгөөнийг шинжилж байна… ${i + 1}/${list.length}`;
          asset.analysis = await analyzeMotion(asset.el).catch(() => null);
        }
      } catch (e) {
        problems.push(e.message);
      }
    }
  } finally {
    state.loading--;
    if (!state.loading) $('clipStatus').hidden = true;
    // Эхний багцад хамгийн амьд клипийг эхэнд тавина (hook) — дараа нь хэрэглэгч өөрөө эрэмбэлнэ
    if (firstBatch && recipe.timing.heroFirst) {
      const hero = heroAsset();
      if (hero && state.assets[0] !== hero) {
        state.assets.splice(state.assets.indexOf(hero), 1);
        state.assets.unshift(hero);
        toast('Хамгийн хөдөлгөөнтэй клипийг эхэнд тавилаа (hook). Хүсвэл ↑↓-оор солино.');
      }
    }
    refresh();
  }
  if (problems.length) toast(problems.join(' '));
}

function heroAsset() {
  let best = null;
  for (const a of state.assets) {
    if (a.analysis && (!best || a.analysis.peak > best.analysis.peak)) best = a;
  }
  return best;
}

function renderClipList() {
  const segs = new Map();
  for (const s of state.timeline?.segments ?? []) {
    if (s.assetId) segs.set(s.assetId, (segs.get(s.assetId) || 0) + (s.end - s.start));
  }
  const hero = recipe.timing.heroFirst ? heroAsset() : null;
  const list = $('clipList');
  list.replaceChildren(
    ...state.assets.map((a, i) => {
      const li = document.createElement('li');
      li.className = 'clip';
      li.dataset.id = a.id;
      const used = (segs.get(a.id) || 0).toFixed(1);
      const meta = a.kind === 'video' ? `Бичлэг · ${a.duration.toFixed(1)}с → ${used}с` : `Зураг → ${used}с`;
      li.innerHTML = `
        <div class="thumb">${a.thumb ? `<img src="${a.thumb}" alt="">` : '🎞'}</div>
        <div class="clip-info"><strong></strong><span>${meta}</span></div>
        <div class="clip-actions">
          <button class="icon-btn" data-act="up" aria-label="Дээш" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="icon-btn" data-act="down" aria-label="Доош" ${i === state.assets.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="icon-btn danger" data-act="remove" aria-label="Хасах">✕</button>
        </div>`;
      li.querySelector('strong').textContent = `${i + 1}. ${a === hero ? '⭐ ' : ''}${a.name}`;
      return li;
    }),
  );
}

$('clipList').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn || state.exporting) return;
  const i = state.assets.findIndex((a) => a.id === btn.closest('li').dataset.id);
  const { act } = btn.dataset;
  if (act === 'up' && i > 0) [state.assets[i - 1], state.assets[i]] = [state.assets[i], state.assets[i - 1]];
  if (act === 'down' && i < state.assets.length - 1) [state.assets[i + 1], state.assets[i]] = [state.assets[i], state.assets[i + 1]];
  if (act === 'remove') disposeAsset(state.assets.splice(i, 1)[0]);
  refresh();
});

$('clipInput').addEventListener('change', (e) => {
  addFiles(e.target.files);
  e.target.value = '';
});

// Mac дээр файлаа чирээд тавьж болно
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
  e.preventDefault();
  if (state.exporting || !e.dataTransfer?.files.length) return;
  const items = [...(e.dataTransfer.items || [])];
  if (items.length && items.every((it) => it.webkitGetAsEntry?.()?.isDirectory)) {
    toast('Хавтсыг биш, доторх файлуудыг сонгож чирнэ үү.');
    return;
  }
  addFiles(e.dataTransfer.files);
});

// ---------- 2. Хөгжим ба beat ----------

// Идэвхтэй beat grid: гараар өгсөн BPM > илрүүлсэн. Гараар өгсөн ч эхний beat-ийн фазыг тэр BPM-д дахин бодно.
function activeGrid() {
  if (!recipe.beatSync.enabled || !audio.buffer) return null;
  if (state.bpmOverride) return gridFor(state.bpmOverride, state.beats?.peaks, state.beats?.offset ?? 0);
  return state.beats;
}

// Хэрэглэгчийн бичсэн эхлэх цэг — дуу reel-ийн дундуур дуусахгүйгээр хязгаарлана
function userOffset() {
  const raw = Math.max(0, Number($('musicOffset').value) || 0);
  if (!audio.buffer) return raw;
  const max = Math.max(0, audio.buffer.duration - (state.timeline?.duration ?? 0) - 0.5);
  $('musicOffset').max = String(Math.floor(max));
  if (raw > max) {
    $('musicOffset').value = String(Math.floor(max));
    toast(`Дуу ${audio.buffer.duration.toFixed(0)}с тул эхлэх цэгийг ${Math.floor(max)}с болголоо.`);
    return Math.floor(max);
  }
  return raw;
}

// Эхний beat t=0 дээр буухаар хөгжмийн эхлэх цэгийг beat-д наана
function effectiveOffset() {
  const user = userOffset();
  const grid = activeGrid();
  if (!grid || !recipe.music.autoOffset) return user;
  const phase = ((grid.offset - user) % grid.beat + grid.beat) % grid.beat;
  return user + phase;
}

// Хэрэглэгч эхлэх цэгээ дууны өөр хэсэг рүү зөөвөл beat-ийг тэр хэсгээс дахин илрүүлнэ (tempo бага зэрэг хэлбэлздэг)
async function syncMusicOffset() {
  if (!audio.buffer) return;
  const user = userOffset();
  if (state.beats && !state.bpmOverride && Math.abs((state.beats.analyzedFrom ?? 0) - user) > 5) {
    const beats = await detectBeats(audio.buffer, { ...recipe.beatSync, from: user }).catch(() => null);
    if (beats) state.beats = beats;
  }
  audio.settings.offset = effectiveOffset();
  updateBeatLabel();
  if (player.playing) player.seek(player.t);
}

function updateBeatLabel() {
  const grid = activeGrid();
  const el = $('bpmLabel');
  if (!audio.buffer) {
    el.textContent = '';
    return;
  }
  if (!grid) {
    el.textContent = 'BPM олдсонгүй — гараар оруулна уу';
    return;
  }
  const unsure = !state.bpmOverride && (state.beats?.confidence ?? 0) < 0.3;
  const src = state.bpmOverride ? 'гараар' : unsure ? 'автомат, тодорхойгүй — буруу бол гараар засна уу' : 'автомат';
  const start = audio.settings.offset;
  el.textContent = `${grid.bpm} BPM (${src}) · ${state.timeline?.duration.toFixed(1) ?? 0}с = бүтэн bar · дуу ${start.toFixed(2)}с-ээс (beat дээр)`;
}

$('musicInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file || state.exporting) return;
  player.pause();
  const prevName = $('musicName').textContent;
  $('musicName').textContent = `${file.name} · уншиж байна…`;
  try {
    await audio.loadFile(file);
  } catch {
    // Уншигдаагүй файл хуучин дууг үлдээж болохгүй — UI ба тоглуулагч нэг төлөвтэй байна
    audio.clear();
    state.beats = null;
    state.bpmOverride = null;
    $('bpmInput').value = '';
    $('musicName').textContent = 'Хөгжим сонгоогүй';
    $('musicClear').hidden = true;
    toast(`${file.name}: хөгжмийг уншиж чадсангүй (${prevName.includes('·') ? 'өмнөх дуу ч арилсан' : 'mp3/m4a/wav сонгоно уу'})`);
    refresh();
    return;
  }
  $('musicName').textContent = `${file.name} · ${audio.buffer.duration.toFixed(0)}с`;
  $('musicClear').hidden = false;
  state.bpmOverride = null; // шинэ дуу — өмнөх дууны гар тохиргоо хамаарахгүй
  $('bpmInput').value = '';
  $('bpmLabel').textContent = 'BPM илрүүлж байна…';
  state.beats = await detectBeats(audio.buffer, { ...recipe.beatSync, from: userOffset() }).catch(() => null);
  refresh();
  syncMusicOffset();
});

$('musicClear').addEventListener('click', () => {
  if (state.exporting) return;
  player.pause();
  audio.clear();
  state.beats = null;
  state.bpmOverride = null;
  $('bpmInput').value = '';
  $('musicName').textContent = 'Хөгжим сонгоогүй';
  $('musicClear').hidden = true;
  refresh();
});

$('musicOffset').value = String(store.get('musicOffset', 0));
$('musicOffset').addEventListener('change', (e) => {
  if (state.exporting) return;
  const v = Math.max(0, Number(e.target.value) || 0);
  e.target.value = String(v);
  store.set('musicOffset', v);
  syncMusicOffset();
});

$('bpmInput').addEventListener('change', (e) => {
  if (state.exporting) return;
  const v = Number(e.target.value);
  state.bpmOverride = v >= 40 && v <= 240 ? Math.round(v) : null;
  e.target.value = state.bpmOverride ?? '';
  refresh();
  syncMusicOffset();
});

// ---------- 3. Текст ба лого ----------

// Текст preset бүрд тусдаа хадгалагдана (коктейлийн нэр, KTV-ийн hook өөр)
function loadTexts() {
  state.introText = store.get(`introText:${recipe.preset}`, recipe.intro.text);
  state.outroLines = store.get(`outroLines:${recipe.preset}`, recipe.outro.lines);
  $('introText').value = state.introText;
  $('outroText').value = state.outroLines.join('\n');
  $('outroField').hidden = !recipe.outro.enabled;
}

$('introText').addEventListener('input', (e) => {
  state.introText = e.target.value;
  store.set(`introText:${recipe.preset}`, state.introText);
  updateOpts();
});

$('outroText').addEventListener('input', (e) => {
  state.outroLines = e.target.value.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 3);
  store.set(`outroLines:${recipe.preset}`, state.outroLines);
  updateOpts();
});

async function setLogo(dataUrl) {
  if (!dataUrl) {
    state.logo = null;
    $('logoPreview').hidden = true;
    $('logoClear').hidden = true;
    updateOpts();
    return;
  }
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  state.logo = img;
  $('logoPreview').src = dataUrl;
  $('logoPreview').hidden = false;
  $('logoClear').hidden = false;
  updateOpts();
}

$('logoInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      // Хадгалах сан ~5MB — логог renderer-ийн хэрэглэдэг хэмжээнд (outro 300px) багасгаж хадгална
      const small = await shrinkImage(reader.result, 600);
      await setLogo(small);
      store.set('logo', small);
      if (store.get('logo', null) !== small) toast('Лого хадгалагдсангүй — дараагийн удаа дахин сонгоно уу.');
    } catch {
      toast('Логог уншиж чадсангүй');
    }
  };
  reader.readAsDataURL(file);
});

async function shrinkImage(dataUrl, maxWidth) {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  if (img.naturalWidth <= maxWidth) return dataUrl;
  const c = document.createElement('canvas');
  c.width = maxWidth;
  c.height = Math.round((img.naturalHeight * maxWidth) / img.naturalWidth);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

$('logoClear').addEventListener('click', () => {
  store.set('logo', '');
  setLogo(null);
});

// ---------- Урьдчилан харах ----------

$('playBtn').addEventListener('click', async () => {
  if (player.playing) {
    player.pause();
    return;
  }
  // Дууны context асахыг хүлээнэ — үгүй бол видео дуунаас түрүүлж эхэлж, beat хазайсан мэт харагдана
  await audio.resume().catch(() => {});
  player.latencyComp = true;
  player.play();
});

$('scrub').addEventListener('input', (e) => player.seek(Number(e.target.value)));

$('safeToggle').addEventListener('change', (e) => {
  state.showSafeZone = e.target.checked;
  updateOpts();
});

player.addEventListener('time', updateTime);
player.addEventListener('play', () => ($('playBtn').textContent = '⏸'));
player.addEventListener('pause', () => ($('playBtn').textContent = '▶'));

// ---------- 4. Экспорт ----------

function setExporting(on) {
  state.exporting = on;
  document.body.classList.toggle('is-exporting', on);
  $('exportBtn').textContent = on ? '■ Цуцлах' : '🎬 Видео гаргах';
  $('exportProgress').hidden = !on;
  $('playBtn').disabled = on;
  $('scrub').disabled = on;
  // Экспортын үеэр хуучин видеог хадгалбал шинэ үр дүнг андуурч "хадгалсан" гэж тэмдэглэх эрсдэлтэй
  $('saveBtn').disabled = on;
  // Гараар (Tab) өөрчилж экспортыг гацаахгүй — CSS-ээс гадна бодитоор түгжинэ
  for (const id of ['preset', 'musicOffset', 'bpmInput', 'introText', 'outroText']) $(id).disabled = on;
  updateOpts();
  notifyNative();
}

$('exportBtn').addEventListener('click', async () => {
  if (state.exporting) {
    state.exportAbort?.abort();
    return;
  }
  if (state.loading) return;
  audio.resume().catch(() => {});
  setExporting(true);
  state.exportAbort = new AbortController();
  let wakeLock = null;
  try {
    wakeLock = await navigator.wakeLock?.request('screen');
  } catch {
    // дэлгэц унтахаас сэргийлэх боломжгүй — асуудалгүй
  }
  const startedHidden = document.hidden;
  player.latencyComp = false; // бичлэгт дуу, зураг нэг л цагаар орно
  try {
    const blob = await exportReel({
      canvas,
      player,
      audio,
      fps: recipe.canvas.fps,
      signal: state.exportAbort.signal,
      onProgress: (p) => {
        $('exportBar').style.width = `${(p * 100).toFixed(1)}%`;
        $('exportLabel').textContent = `Бичиж байна… ${Math.round(p * 100)}%`;
      },
    });
    showResult(blob, player.duration);
    if (startedHidden || document.hidden) toast('Цонх нуугдсан байсан тул видео тасарч магадгүй. Дахин гаргаж үзээрэй.');
  } catch (e) {
    if (e.name !== 'AbortError') toast(e.message || 'Видео гаргаж чадсангүй');
  } finally {
    wakeLock?.release?.().catch(() => {});
    player.latencyComp = true;
    setExporting(false);
    player.seek(0);
  }
});

function showResult(blob, duration) {
  if (state.result) URL.revokeObjectURL(state.result.url);
  const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const name = `sugar-${recipe.preset}-${stamp}.${ext}`;
  state.result = { blob, name, url: URL.createObjectURL(blob) };
  $('resultVideo').src = state.result.url;
  $('resultInfo').textContent = `${ext.toUpperCase()} · ${(blob.size / 1e6).toFixed(1)} MB · ${duration.toFixed(1)}с`;
  $('result').hidden = false;
  $('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  notifyNative();
}

$('saveBtn').addEventListener('click', async () => {
  const { blob, name, url } = state.result;
  const file = new File([blob], name, { type: blob.type });
  // iPhone дээр "Save Video" гарч ирэхээр share sheet нээнэ, Mac дээр шууд татна
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Sugar Lounge reel' });
      markSaved(url);
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  // Mac програмд хадгалах цонхыг цуцалж болох тул тэр тал нь хадгалагдсаны дараа markSaved(url)-г дуудна
  if (!window.webkit?.messageHandlers?.reels) markSaved(url);
});

// url = яг аль видеог хадгалсан (blob URL). Өөр (шинэ) үр дүнг андуурч тэмдэглэхгүй.
function markSaved(url) {
  if (state.result && (!url || state.result.url === url)) state.result.saved = true;
  notifyNative();
}

// Алдагдах ажил байвал тайлбар буцаана — Mac програм цонх хаах, дахин ачаалахаас өмнө асууна.
// Гарахад: видеогоо хадгалсан бол нэмсэн клипүүдийг асуухгүй (ажил дууссан). Дахин ачаалахад үргэлж асууна.
function pendingWork(includeClips) {
  if (state.exporting) return 'Видео гаргаж байна.';
  if (state.result && !state.result.saved) return 'Гаргасан видео хадгалагдаагүй байна.';
  if (state.assets.length && (includeClips || !state.result?.saved)) return 'Нэмсэн бичлэгүүд арилна.';
  return null;
}

// Mac програм ⌘Q дээр хүлээлгүй шийдэхийн тулд төлөв өөрчлөгдөх бүрт урьдчилж мэдэгдэнэ
function notifyNative() {
  const handler = window.webkit?.messageHandlers?.reels;
  if (!handler) return;
  handler.postMessage(JSON.stringify({ step: 'pending', quit: pendingWork(false), reload: pendingWork(true) }));
}

// ---------- Сурсан дүрмүүд ----------

function renderLessons() {
  $('recipeBadge').textContent = `Хэв маяг v${baseRecipe.version} · ${baseRecipe.lessons.length} хичээл`;
  const list = $('lessonList');
  if (!baseRecipe.lessons.length) {
    list.innerHTML = '<li class="muted">Одоохондоо хичээл ороогүй — анхны таамаг тохиргоогоор ажиллаж байна.</li>';
    return;
  }
  list.replaceChildren(
    ...baseRecipe.lessons.map((l) => {
      const li = document.createElement('li');
      li.textContent = `Х${l.n} · ${l.date} · ${l.title}`;
      return li;
    }),
  );
}

// ---------- Эхлэл ----------

if (pickMimeType() === null) {
  $('exportNote').textContent = 'Энэ хөтөч видео бичих боломжгүй. Safari эсвэл Chrome-ын шинэ хувилбар ашиглана уу.';
}
renderPresets();
renderLessons();
loadTexts();
// Хэрэглэгч лого сонгоогүй бол брэндийн логог ашиглана; "Арилгах" дарсан бол ('' хадгалагдана) логогүй
const storedLogo = store.get('logo', null);
setLogo(storedLogo === null ? recipe.brand.logoUrl : storedLogo || null).catch(() => setLogo(null));
refresh();

// Туршилт, debug, Mac програмд зориулав
window.__reels = { state, player, audio, recipe, addFiles, pendingWork, markSaved, applyPreset, refresh, activeGrid, syncMusicOffset };
