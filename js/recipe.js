// Sugar Lounge reels-ийн ХЭВ МАЯГ — апп видеог яг яаж хийхийг энэ файл бүхэлд нь тодорхойлно.
// Хичээл бүрийн дараа энд утга өөрчлөгдөж, docs/LESSONS.md-д бүртгэгдэнэ.
//   ✅ Х1 = 1-р хичээл (2026-10-22: судалгаа + @sugarlounge.ub + Google Maps шинжилгээ)
//   ⏳    = таамаг, дараагийн хичээлээр тодорхойлно
//
// Эх сурвалжийн товчлол: [IG] = Instagram/Meta албан ёсны, [M] = Adam Mosseri, [S] = Sugar-ийн IG/Maps хэмжилт,
// [R] = судалгааны бусад эх сурвалж (docs/LESSONS.md-д бүрэн жагсаалт)

export const recipe = {
  version: 1,
  name: 'Sugar Lounge',

  // [IG] 9:16, доод тал нь 720p, 30fps тогтмол
  canvas: { width: 1080, height: 1920, fps: 30 },

  brand: {
    colors: {
      primary: '#D43C82', // ✅ Х1 [S] IG profile-ийн неон магента лого (хэмжсэн #b54385–#d482a3)
      accent: '#F5C450',  // ✅ Х1 [S] эвентийн постерын алт/шар ("Chill Friday" #f5c450)
      red: '#D53532',     // ✅ Х1 [S] эвентийн улаан (Halloween, Sweet Wednesday) + интерьерийн улаан неон
      dark: '#0B0A0E',    // ✅ Х1 [S] хар дэвсгэр (IG постер, интерьер)
      text: '#FFFFFF',
      ivory: '#F3EBE4',
      shadowTone: '#123A5E', // [R] неон split-tone: харанхуйг хөхлөг болгох
    },
    // ⏳ Х1: IG постер = condensed том гарчиг + бичмэл script. Фонт файл бага дараа суулгана (offline апп).
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    displayFont: '"Playfair Display", "Cormorant Garamond", Georgia, "Times New Roman", serif',
    logoUrl: 'assets/brand/sugar-logo-white.png', // ✅ Sugar лого (цагаан, тунгалаг)
    tagline: 'DINING · KTV · ENT',
    handle: '@sugarlounge.ub',              // ✅ Х1 хэрэглэгч хэлсэн, IG дээр баталгаажсан
    website: 'sugarlounge.mn',              // ✅ Х1 IG bio
    address: 'Нарны зам 31/2, Mega Centro', // ✅ Х1 Google Maps + IG мэдээллийн карт
    phone: '8008-8056',                     // ✅ Х1 IG постер дээрх захиалгын утас (Google Maps: 8821 7108)
    hours: 'Өдөр бүр 11:00 – 04:00',        // ✅ Х1 IG bio
  },

  timing: {
    targetDuration: 15, // ✅ Х1 [IG] 3–15с = "хурдан, уур амьсгал"; [M] бүрэн үзсэн богино > орхисон урт
    minClip: 1.0,       // ✅ Х1 [R] 1с-ээс богино cut чичирхийлсэн iPhone бичлэг дээр глич шиг харагдана
    maxClip: 2.5,       // ✅ Х1 [R] 3с-ээс урт зогсонги; walk клип 3с хүртэл
    firstClipMin: 1.5,  // ✅ Х1 [IG] эхний 3с = View Rate — hero клип хамгийн багадаа 1.5с
    heroFirst: true,    // ✅ Х1 хамгийн хөдөлгөөнтэй клипийг эхэнд (постер/гадна зураг биш)
    pickFrom: 'peak',   // ✅ Х1 'peak' = хөдөлгөөн ихтэй хэсэг | 'middle' | 'start'
    maxDuration: 90,    // [IG] 90с-ээс урт reel зөвлөдөггүй
  },

  // ✅ Х1 [R] Cut-ууд beat дээр буухгүй бол сонирхогчийн ажил шиг харагдана — бүх auto editor beat-д тааруулдаг
  beatSync: {
    enabled: true,
    bpm: null,              // null = хөгжмөөс автоматаар илрүүлнэ; хэрэглэгч гараар өгч болно
    tempoRange: [80, 160],  // БҮТЭН октав (дээд = доод×2): 85 hip-hop, 128 house, 140 trap, 174 DnB(→87)
    weights: { 1: 0.2, 2: 0.5, 4: 0.3 }, // cut бүр хэдэн beat; minClip/maxClip-д багтахгүй нь хасагдана (1 beat зөвхөн ktv-д)
    maxSameInRow: 3,        // ижил урттай 3-аас олон cut дараалахгүй (slideshow мэдрэмжээс сэргийлнэ)
    snapToBars: true,       // нийт урт бүтэн bar (4 beat) болно — хөгжим төгсгөлдөө таарна
  },

  // ✅ Х1 [R] Энергийн муруй: hero барих → богиносгож drop руу → drop дээр 1-beat цувралт → 4 beat барих → сүүл
  energyCurve: { enabled: true, heroHoldBeats: 4, dropAt: 0.4, dropBurstCuts: 4, postDropHoldBeats: 4 },

  intro: {
    enabled: true,
    mode: 'overlay',   // ✅ Х1 [IG][M] тусдаа лого карт 3с-ийн hook цонхыг идэж, секунд үрнэ — зөвхөн overlay
    duration: 2.0,     // ✅ Х1 2 үгийн блок ≥1.2с, 3с-ийн дотор
    text: 'SUGAR LOUNGE',
    subText: 'Улаанбаатар · 04:00 хүртэл',
    maxWords: 6,
    font: 'display',   // serif брэнд тэмдэг
    size: 100,         // ✅ Х1 [R] 1080px дээр 75–100px
    subSize: 52,
    y: 0.33,           // дэлгэцийн дээд гуравны нэг (safe zone дотор)
    fadeIn: 0.25,
    fadeOut: 0.35,
  },

  outro: {
    enabled: true,
    mode: 'overlay',       // ✅ Х1 [R] сүүлийн клип үргэлжилж, дээр нь текст — хар карт секунд үрнэ
    duration: 3.0,         // 3 мөр ≈ 8–10 үг → ≥2.5–3с
    vignetteBoost: 0.55,   // текст уншигдахын тулд захыг илүү харлуулна
    logoWidth: 300,
    lines: ['@sugarlounge.ub', 'Нарны зам 31/2 · Mega Centro', 'Захиалга → 8008-8056'], // ✅ Х1 ганц CTA
    lineSizes: [64, 52, 60],
    y: 0.45,
  },

  transition: { type: 'cut', duration: 0, fadeDuration: 0.25 }, // ✅ Х1 [R] хурдан сошиал монтаж = hard cut

  motion: { kenBurns: 0.05, maxZoom: 1.12 }, // ✅ Х1 [R] stabilization аль хэдийн crop хийдэг; ≤1.12x

  // ✅ Х1 [R] iPhone шөнийн бичлэг: хар цэг өргөх, midtone contrast, харанхуй хөхлөг / гэрэл ягаалаг split-tone
  look: {
    exposure: 0.05,
    blackPoint: 0.03,
    contrast: 1.12,
    saturation: 1.2,
    temperature: 0.1,
    shadows: { color: '#123A5E', amount: 0.18 },
    highlights: { color: '#D43C82', amount: 0.12 },
    tint: { color: '#D43C82', opacity: 0.04 },
    vignette: 0.3,
    grain: 0.06,
  },

  watermark: {
    enabled: true,
    size: 110,       // ✅ Х1 [R] өргөний ~10%; 150 нь upscale брэндэд чанга байсан
    opacity: 0.7,
    inset: { x: 72, y: 260 }, // ✅ Х1 IG-ийн толгойн доор (safeZone.top-оос доош)
    hideInOutro: true,        // outro-д том лого гардаг
  },

  music: {
    volume: 0.8,     // ✅ Х1 жишиг түвшин (loudness normalisation дараагийн хичээлд)
    fadeIn: 0.3,
    fadeOut: 1.5,
    offset: 0,       // хэрэглэгчийн сонгосон эхлэх цэг (сек)
    autoOffset: true, // ✅ Х1 эхний beat t=0 дээр буухаар автоматаар тааруулна
  },

  // ✅ Х1 [IG ads] дээр 14% (269px) / доор 35% (ads) → organic-д 480px / хажуу 6%
  safeZone: { top: 270, bottom: 480, left: 90, right: 150 },

  // ✅ Х1 [R] утасны дэлгэц дээр уншигдах хэмжээ
  text: { hookSize: 84, captionSize: 64, minSize: 48, maxSize: 100, maxLines: 2, maxWidth: 820 },

  // Загварын төрлүүд — сонгоход доорх утгууд үндсэн дээр давхарлагдана
  presets: {
    vibe: {
      label: 'Vibe · 15с',
      hint: 'Долоо хоногийн уур амьсгалын reel',
    },
    cocktail: {
      label: 'Коктейль · 10с',
      hint: 'Нэг коктейлийн ASMR, давтагдах (loop)',
      timing: { targetDuration: 10, minClip: 1.0, maxClip: 2.5 },
      beatSync: { weights: { 2: 0.6, 4: 0.4 } },
      energyCurve: { enabled: false },
      intro: { text: 'Sugar Martini', subText: '', duration: 1.5, font: 'sans', size: 84 },
      outro: { enabled: false },
      motion: { kenBurns: 0.03 },
      music: { volume: 0.6, fadeIn: 0.05, fadeOut: 0.3 },
      look: { exposure: 0.1, vignette: 0.4 },
    },
    ktv: {
      label: 'KTV · 24с',
      hint: 'Баасан орой, найзууд, drop дээр хурдан cut',
      timing: { targetDuration: 24, minClip: 0.5, maxClip: 2.5 },
      beatSync: { weights: { 1: 0.3, 2: 0.5, 4: 0.2 } },
      energyCurve: { dropAt: 0.42, dropBurstCuts: 4 },
      intro: { text: 'Баасан орой → Sugar KTV', subText: '', font: 'sans', size: 84 },
      outro: { lines: ['@sugarlounge.ub', 'Хамт ирэх найзууддаа явуул', 'KTV захиалга → 8008-8056'] },
      music: { volume: 0.8 },
    },
    story: {
      label: 'Story · 30с',
      hint: 'Удаан, нэг оройн түүх',
      timing: { targetDuration: 30, minClip: 1.2, maxClip: 4.2 },
      beatSync: { weights: { 2: 0.2, 4: 0.5, 8: 0.3 } },
      energyCurve: { enabled: false },
      transition: { type: 'fade', duration: 0.25 },
    },
  },

  // Хичээл бүр энд нэг мөр нэмэгдэнэ
  lessons: [
    { n: 1, date: '2026-10-22', title: 'Судалгаа + @sugarlounge.ub + Google Maps шинжилгээ → бодит суурь' },
  ],
};

// Загвар сонгоход үндсэн утга дээр preset-ийн утгыг давхарлана (гүн нэгтгэл)
export function resolveRecipe(base, presetName) {
  const preset = base.presets?.[presetName];
  const { presets, lessons, ...core } = base;
  const merged = merge(core, preset ? omit(preset, ['label', 'hint']) : {});
  return { ...merged, presets, lessons, preset: presetName };
}

function merge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] = isPlain(v) && isPlain(a[k]) ? merge(a[k], v) : v;
  }
  return out;
}

const isPlain = (v) => v && typeof v === 'object' && !Array.isArray(v);
const omit = (o, keys) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));
