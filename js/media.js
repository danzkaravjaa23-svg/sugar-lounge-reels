// Файлыг (бичлэг/зураг) уншиж, тоглуулахад бэлэн asset болгоно.

let nextId = 1;

export async function loadAsset(file, pool) {
  const url = URL.createObjectURL(file);
  const base = { id: `a${nextId++}`, name: file.name, url };

  if (file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name)) {
    const img = new Image();
    img.src = url;
    try {
      // decode()-ийг хүлээхгүй: далд таб дээр Chrome дүрс тайлахыг хойшлуулдаг, 'load' л хангалттай
      if (!img.complete || !img.naturalWidth) await once(img, 'load', 15000);
      if (!img.naturalWidth) throw new Error('empty');
    } catch {
      URL.revokeObjectURL(url);
      throw new Error(`${file.name}: зургийг уншиж чадсангүй`);
    }
    return { ...base, kind: 'image', el: img, duration: 0, thumb: makeThumb(img) };
  }

  const v = document.createElement('video');
  v.muted = true;
  v.defaultMuted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.setAttribute('muted', '');
  v.setAttribute('playsinline', '');
  v.src = url;
  pool.appendChild(v); // iPhone Safari DOM-д байгаа бичлэгийг л найдвартай тоглуулдаг
  try {
    await once(v, 'loadedmetadata', 15000);
    if (!Number.isFinite(v.duration)) await fixDuration(v);
    v.currentTime = Math.min(0.5, v.duration / 2);
    await once(v, 'seeked', 8000);
  } catch {
    v.remove();
    URL.revokeObjectURL(url);
    throw new Error(`${file.name}: бичлэгийг уншиж чадсангүй`);
  }
  return { ...base, kind: 'video', el: v, duration: v.duration, thumb: makeThumb(v) };
}

export function disposeAsset(asset) {
  if (asset.kind === 'video') {
    asset.el.pause();
    asset.el.removeAttribute('src');
    asset.el.load();
    asset.el.remove();
  }
  URL.revokeObjectURL(asset.url);
}

function once(el, event, timeout) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      el.removeEventListener(event, ok);
      el.removeEventListener('error', fail);
    };
    const ok = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(new Error(event));
    };
    const timer = setTimeout(fail, timeout);
    el.addEventListener(event, ok);
    el.addEventListener('error', fail);
  });
}

// Зарим WebM файл толгойдоо уртаа хадгалдаггүй (duration = Infinity)
async function fixDuration(v) {
  await new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      v.removeEventListener('durationchange', check);
      resolve();
    };
    const check = () => Number.isFinite(v.duration) && done();
    const timer = setTimeout(done, 5000);
    v.addEventListener('durationchange', check);
    v.currentTime = 1e101;
  });
  if (!Number.isFinite(v.duration)) throw new Error('duration');
}

function makeThumb(el) {
  try {
    const c = document.createElement('canvas');
    c.width = 108;
    c.height = 192;
    const sw = el.videoWidth || el.naturalWidth;
    const sh = el.videoHeight || el.naturalHeight;
    const s = Math.max(c.width / sw, c.height / sh);
    c.getContext('2d', { willReadFrequently: true }).drawImage(el, (c.width - sw * s) / 2, (c.height - sh * s) / 2, sw * s, sh * s);
    return c.toDataURL('image/jpeg', 0.7);
  } catch {
    return null;
  }
}
