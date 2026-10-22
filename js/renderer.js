// Нэг агшны (t) зургийг canvas дээр зурна. Урьдчилан харах, экспорт хоёулаа үүнийг ашиглана.
// recipe-ийн intro/outro/watermark/look-ийг зурах бүрт уншдаг тул preset солиход шууд өөрчлөгдөнө.

import { activeLayers } from './timeline.js';
import { createGrader } from './grade.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const easeOut = (x) => 1 - (1 - x) ** 3;

export function createRenderer(canvas, recipe) {
  const W = recipe.canvas.width;
  const H = recipe.canvas.height;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: false });
  const { colors } = recipe.brand;
  const safe = recipe.safeZone;

  // Өнгө засвар WebGL дээр (Safari/WebKit-д canvas filter байхгүй). WebGL байхгүй бол 2D fallback.
  const grader = createGrader(W, H);
  const supportsFilter = typeof ctx.filter === 'string';

  const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.5)');

  const fontFor = (kind) => (kind === 'display' ? recipe.brand.displayFont : recipe.brand.fontFamily);

  function draw(t, timeline, assetsById, opts) {
    const layers = activeLayers(timeline, t);
    if (!layers.length) return false;
    // Бичлэгийн кадр бэлэн болоогүй бол өмнөх зургийг үлдээнэ (хар анивчихгүй)
    for (const { seg } of layers) {
      if (seg.type === 'clip' && seg.kind === 'video' && assetsById.get(seg.assetId).el.readyState < 2) {
        return false;
      }
    }

    ctx.globalAlpha = 1;
    ctx.fillStyle = colors.dark;
    ctx.fillRect(0, 0, W, H);

    for (const { seg, alpha } of layers) {
      ctx.globalAlpha = alpha;
      if (seg.type === 'clip') drawClip(seg, assetsById.get(seg.assetId), t);
      else drawBrandBackground(t);
    }
    ctx.globalAlpha = 1;

    const { intro, outro, watermark } = recipe;
    const inOutro = outro.enabled && t >= timeline.outroStart;
    if (intro.enabled && t < intro.duration) drawIntro(t, opts.introText);
    if (inOutro) drawOutroOverlay(t - timeline.outroStart, opts);
    if (watermark.enabled && !(inOutro && watermark.hideInOutro)) drawWatermark(opts.logo);
    if (opts.showSafeZone) drawSafeZone();
    return true;
  }

  function drawClip(seg, asset, t) {
    const { motion, look } = recipe;
    const progress = clamp((t - seg.start) / (seg.end - seg.start), 0, 1.2);
    const zoom = Math.min(motion.maxZoom ?? 1.2, 1 + motion.kenBurns * progress);

    if (grader) {
      const graded = grader.render(asset.el, zoom, look, t);
      if (graded) {
        ctx.drawImage(graded, 0, 0);
        return; // tint, vignette, grain шэйдэр дотор хийгдсэн
      }
    }

    if (supportsFilter) {
      ctx.filter = `brightness(${2 ** (look.exposure ?? 0)}) contrast(${look.contrast ?? 1}) saturate(${look.saturation ?? 1})`;
    }
    drawCover(asset.el, zoom);
    if (supportsFilter) ctx.filter = 'none';

    const alpha = ctx.globalAlpha;
    if (look.tint?.opacity > 0) {
      ctx.globalAlpha = alpha * look.tint.opacity;
      ctx.fillStyle = look.tint.color;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = alpha;
    }
    if (look.vignette > 0) {
      ctx.globalAlpha = alpha * look.vignette * 2;
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = alpha;
    }
  }

  function drawCover(el, zoom) {
    const sw = el.videoWidth || el.naturalWidth;
    const sh = el.videoHeight || el.naturalHeight;
    if (!sw || !sh) return;
    const s = Math.max(W / sw, H / sh) * zoom;
    const dw = sw * s;
    const dh = sh * s;
    ctx.drawImage(el, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }

  // Клипгүй үед (outro-д тохирох бичлэг олдоогүй) брэндийн дэвсгэр
  function drawBrandBackground(t) {
    ctx.fillStyle = colors.dark;
    ctx.fillRect(0, 0, W, H);
    const drift = Math.sin(t * 0.8) * 60;
    glow(W * 0.25 + drift, H * 0.28, H * 0.55, colors.primary, 0.5);
    glow(W * 0.8 - drift, H * 0.78, H * 0.5, colors.accent, 0.22);
  }

  function glow(x, y, r, color, strength) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hexToRgba(color, strength));
    g.addColorStop(1, hexToRgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // Эхний текст (hook): бичлэг дээр overlay, t=0-ээс
  function drawIntro(t, text) {
    const { intro } = recipe;
    if (!text) return;
    const a = Math.min(clamp(t / intro.fadeIn, 0, 1), clamp((intro.duration - t) / intro.fadeOut, 0, 1));
    const scale = 1.06 - 0.06 * easeOut(clamp(t / 0.6, 0, 1));
    const maxWidth = W - safe.left - safe.right - 40;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(W / 2, H * intro.y);
    ctx.scale(scale, scale);
    const lines = drawTextBlock(text, {
      size: intro.size, weight: intro.font === 'display' ? 600 : 800, maxWidth,
      family: fontFor(intro.font), letterSpacing: intro.font === 'display' ? 0.06 : 0,
    });
    if (intro.subText) {
      const offset = (lines * intro.size * 1.12) / 2 + intro.subSize * 1.1;
      ctx.translate(0, offset);
      ctx.globalAlpha = a * 0.9;
      drawTextBlock(intro.subText, { size: intro.subSize, weight: 600, maxWidth, family: fontFor('sans'), maxLines: 1 });
    }
    ctx.restore();
  }

  // Outro: сүүлийн клип дээр харанхуйлсан давхарга + лого + мөрүүд
  function drawOutroOverlay(local, opts) {
    const { outro } = recipe;
    const a = clamp(local / 0.35, 0, 1);
    ctx.save();
    ctx.globalAlpha = a * outro.vignetteBoost;
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = a;

    const lines = [...(opts.outroLines || [])];
    const sizes = outro.lineSizes || [];
    const gap = 26;
    const logoW = opts.logo ? outro.logoWidth : 0;
    const logoH = opts.logo ? (logoW * opts.logo.naturalHeight) / opts.logo.naturalWidth : 0;
    const linesH = lines.reduce((s, _, i) => s + (sizes[i] ?? 56) * 1.4, 0);
    const blockH = logoH + (logoH && lines.length ? 48 : 0) + linesH;
    let y = H * outro.y - blockH / 2;

    if (opts.logo) {
      ctx.drawImage(opts.logo, (W - logoW) / 2, y, logoW, logoH);
      y += logoH + 48;
    }
    const maxWidth = W - safe.left - safe.right - 40;
    lines.forEach((line, i) => {
      const size = sizes[i] ?? 56;
      ctx.save();
      ctx.translate(W / 2, y + (size * 1.4) / 2);
      // Нэг мөрөнд багтахгүй бол жижигрүүлнэ (мөр хуваавал дараагийн мөр дээр давхардана)
      drawTextBlock(line, { size, weight: i === 0 ? 700 : 600, maxWidth, family: fontFor('sans'), maxLines: 1 });
      ctx.restore();
      y += size * 1.4 + (i === lines.length - 1 ? 0 : gap - 16);
    });
    ctx.restore();
  }

  function drawWatermark(logo) {
    const wm = recipe.watermark;
    const x = W - wm.inset.x;
    const y = wm.inset.y;
    ctx.save();
    ctx.globalAlpha = wm.opacity;
    if (logo) {
      const w = wm.size;
      const h = (w * logo.naturalHeight) / logo.naturalWidth;
      ctx.drawImage(logo, x - w, y, w, h);
    } else {
      ctx.font = `700 40px ${fontFor('sans')}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      setShadow(10);
      ctx.fillStyle = colors.text;
      ctx.fillText(recipe.name.toUpperCase(), x, y);
    }
    ctx.restore();
  }

  function drawSafeZone() {
    ctx.save();
    ctx.fillStyle = 'rgba(255,60,60,0.28)';
    ctx.fillRect(0, 0, W, safe.top);
    ctx.fillRect(0, H - safe.bottom, W, safe.bottom);
    ctx.fillRect(0, safe.top, safe.left, H - safe.top - safe.bottom);
    ctx.fillRect(W - safe.right, safe.top, safe.right, H - safe.top - safe.bottom);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 4;
    ctx.setLineDash([24, 16]);
    ctx.strokeRect(safe.left, safe.top, W - safe.left - safe.right, H - safe.top - safe.bottom);
    ctx.restore();
  }

  // Текстийг (x=0, y=0) төвд байрлуулж, багтахгүй бол мөр хувааж, жижигрүүлнэ. Мөрийн тоог буцаана.
  function drawTextBlock(text, { size, weight, maxWidth, family, maxLines = 3, letterSpacing = 0 }) {
    let px = size;
    let lines;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${letterSpacing * size}px`;
    for (; px >= size * 0.45; px -= 4) {
      ctx.font = `${weight} ${px}px ${family}`;
      lines = wrap(text, maxWidth);
      if (lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= maxWidth)) break;
    }
    const lh = px * 1.12;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = colors.text;
    setShadow(px * 0.25);
    lines.forEach((line, i) => ctx.fillText(line, 0, (i - (lines.length - 1) / 2) * lh));
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    return lines.length;
  }

  function wrap(text, maxWidth) {
    const out = [];
    for (const para of String(text).split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(next).width > maxWidth) {
          out.push(line);
          line = word;
        } else {
          line = next;
        }
      }
      if (line) out.push(line);
    }
    return out.length ? out : [''];
  }

  function setShadow(blur) {
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = blur;
    ctx.shadowOffsetY = blur * 0.15;
  }

  return { draw, width: W, height: H, hasWebGL: !!grader };
}

function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
