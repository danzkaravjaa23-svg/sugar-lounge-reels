# Sugar Lounge Reels

Sugar Lounge-ийн Instagram reels-ийг **нэг хэв маягаар** автоматаар хийдэг
жижиг апп. Бичлэг/зураг + хөгжим + текст өгөхөд 9:16 видео гаргана.
Mac дээр хөтчөөр, iPhone дээр "Add to Home Screen" хийсэн апп шиг ажиллана.
Сервер, бүртгэл хэрэггүй — бүх зүйл төхөөрөмж дээр л болдог.

## Татаж авах

| Хаана | Хэрхэн |
|---|---|
| **Mac програм** | [Releases → Sugar-Lounge-Reels-mac.zip](https://github.com/danzkaravjaa23-svg/sugar-lounge-reels/releases/latest) татаад задлана. Анх нээхэд Finder дээр **баруун товч → Open → Open** (Apple-ийн гэрчилгээгүй тул нэг удаа асуудаг). Видео MP4. |
| **iPhone / хөтөч** | **https://danzkaravjaa23-svg.github.io/sugar-lounge-reels/** — iPhone Safari дээр Share → Add to Home Screen. Mac дээр Safari-гаар нээвэл MP4, Chrome-оор WebM. |

Mac програм `main` салбарт push хийх бүрт GitHub Actions дээр автоматаар бүтээгдэж,
"latest" release-д шинэчлэгдэнэ — суулгасан програмаа дахин татаж солиход л хангалттай.

## Бүтэц

```
index.html          UI
css/app.css         Загвар (бараан, ягаан — брэндэд тааруулна)
js/recipe.js        ★ ХЭВ МАЯГ — хичээл бүрээр энд дүрэм нэмэгдэнэ
js/timeline.js      Клип → цагийн хуваарь
js/renderer.js      Кадр зурах (өнгө засвар, текст, лого, Ken Burns)
js/player.js        Урьдчилан харах тоглуулагч
js/audio.js         Хөгжим (fade in/out, эхлэх цэг)
js/exporter.js      MediaRecorder → MP4 (Safari) / WebM (Chrome)
js/media.js         Файл унших
docs/LESSONS.md     ★ Хичээлийн дэвтэр — юу сурсан, дараа нь юу заах
mac/ReelsApp.swift  Mac програм (WKWebView цонх, файл сонгох, хадгалах, цэс)
scripts/            build-mac-app.sh (програм бүтээх/суулгах), make_icons.py (icon)
assets/brand/       Sugar лого
```

## Mac програм (Desktop дээр)

`~/Desktop/Sugar Lounge Reels.app` — давхар товшоод нээнэ. Хөтөч, сервер, интернэт хэрэггүй.
Видео **MP4**-өөр гарна. "Хадгалах" дарахад хаана хадгалахаа асууж, дараа нь Finder-т харуулна
(тэндээсээ AirDrop-оор iPhone руу явуулна).

Вэб файл (ялангуяа `js/recipe.js`) өөрчлөгдсөн бүрт програмыг дахин бүтээнэ:

```bash
scripts/build-mac-app.sh
```

Энэ нь `mac/ReelsApp.swift`-ийг compile хийж (Xcode хэрэггүй, зөвхөн Command Line Tools),
вэб файлуудыг програм дотор хуулж, Desktop дээрх хуучин хувилбарыг солино.
`scripts/build-mac-app.sh /Applications` гэвэл Applications хавтсанд суулгана.

Програм зөв ажиллаж байгааг автоматаар шалгах (туршилтын бичлэгээр видео гаргаж хадгална):

```bash
"dist/Sugar Lounge Reels.app/Contents/MacOS/SugarLoungeReels" --selftest "$PWD/test-fixtures" "$PWD/dist/selftest"
```

## Хөтчөөр ажиллуулах (хөгжүүлэлтэд)

Claude Code дотроос: Browser pane → `reels` preview (`.claude/launch.json`-д байна).

Эсвэл терминалаас:

```bash
python3 -m http.server 5571 --bind 0.0.0.0
```

дараа нь http://localhost:5571 нээнэ. Safari-гаар нээвэл **MP4** гарна (Instagram-д шууд
тавих боломжтой), Chrome-оор нээвэл WebM гарна.

## iPhone дээр суулгах

iPhone, Mac хоёр **нэг Wi-Fi**-д байх ёстой.

1. Mac дээр серверээ дээрх командаар асаа.
2. Mac-ийн IP-г ол: `ipconfig getifaddr en0` (жишээ `192.168.1.23`).
3. iPhone Safari дээр `http://192.168.1.23:5571` нээ.
4. Share товч → **Add to Home Screen** → "SL Reels" нэртэй icon гарна.
5. Icon-оос нээхэд бүтэн дэлгэцийн апп шиг ажиллана. Видеог "Хадгалах" дарахад
   Photos руу хадгалах share sheet гарна → Instagram-д тавина.

> Хэрэв Mac унтарсан бол iPhone дээр нээгдэхгүй. Хэзээ ч нээгддэг болгохыг
> хүсвэл хавтсыг Netlify-д чирээд тавьвал (Night Owl шиг) HTTPS линк гарна —
> тэр үед Mac хэрэггүй. Дараа нь хийх зүйл.

## Хэрхэн ашиглах

0. **Загвар** — Vibe (15с, долоо хоног бүр), Коктейль (10с, давтагдана), KTV (24с), Story (30с).
1. **Бичлэг ба зураг** — 6–8 файл нэм (`docs/SHOOTING.md`-ийн 8 төрөл). Апп хамгийн хөдөлгөөнтэй
   клипийг ⭐ эхэнд тавьж (hook), клип бүрээс хамгийн амьд хэсгийг авна. Дарааллыг ↑↓-оор солино.
2. **Хөгжим** — файл сонгоход BPM-ийг автоматаар илрүүлж, бүх cut beat дээр буудаг, нийт урт бүтэн bar болно.
   Буруу илрүүлбэл BPM-ийг гараар бичнэ. "Эхлэх цэг" = дууны аль секундээс.
3. **Текст ба лого** — эхний hook (6 үг хүртэл), төгсгөлийн 3 мөр (ганц үйлдэл: захиалга эсвэл "найздаа явуул").
   Лого анхдагчаар Sugar-ийн цагаан лого.
4. **Видео гаргах** — бодит хугацаанд бичдэг (15с reel ≈ 15с). Цонхыг нуухгүй.
5. **Хадгалах** → Instagram. Caption-д ≤5 hashtag + байршил tag.

Кадрын жагсаалт: [docs/SHOTLISTS.md](docs/SHOTLISTS.md). Зураг авах заавар: [docs/SHOOTING.md](docs/SHOOTING.md).

## Хэв маягийг сургах

[docs/LESSONS.md](docs/LESSONS.md)-г унш. Товчоор: та надад Sugar Lounge-ийн жишээ
reel + тайлбар өгнө, би `js/recipe.js`-д тоон дүрэм болгон хувиргана, та аппаар
туршаад засуулна. Хичээл бүр `recipe.version`-ийг нэгээр ахиулна.

## Хязгаарлалт (одоогийн хувилбар)

- Экспорт бодит хугацаанд — 30с reel 30с хүлээнэ.
- iPhone Safari дээр 10+ том бичлэг нэмвэл санах ой дүүрч магадгүй — 4K биш 1080p
  бичлэг хэрэглэх нь дээр.
- HEIC зураг Safari-д уншигддаг, Chrome-д уншигдахгүй (JPG болго).
- Safari, iPhone, Mac програм (бүгд WebKit) дээр canvas `filter` байхгүй тул `recipe.look`-ийн
  brightness/contrast/saturate хэрэгжихгүй — зөвхөн tint, vignette ажиллана. Өнгө засварын
  хичээл (Х4)-ээр WebGL-ээр шийдэнэ.
