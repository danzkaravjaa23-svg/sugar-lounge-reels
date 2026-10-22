## Суулгах (Mac)

1. `Sugar-Lounge-Reels-mac.zip`-ийг татаад задална → **Sugar Lounge Reels.app** гарна.
2. Програмыг **Applications** эсвэл Desktop руу зөөнө.
3. Анх нээхэд macOS "Apple could not verify…" гэж хориглоно (Apple-ийн $99 гэрчилгээгүй тул).
   **Finder дээр програмыг баруун товчоор дараад "Open" → дахин "Open"** гэхэд нээгдэнэ.
   Хэрэв "Open" товч гарахгүй бол: System Settings → Privacy & Security → доош гүйлгээд **Open Anyway**.

   Эсвэл Terminal-д нэг мөр:

   ```bash
   xattr -dr com.apple.quarantine ~/Downloads/"Sugar Lounge Reels.app"
   ```

4. Давхар товшоод л ажиллана — интернэт, хөтөч хэрэггүй. Видео нь MP4.

## iPhone / хөтөч

Суулгалтгүй: **https://danzkaravjaa23-svg.github.io/sugar-lounge-reels/**
iPhone Safari дээр нээгээд Share → **Add to Home Screen**.

Энэ release нь `main` салбарын хамгийн сүүлийн хувилбараас автоматаар бүтээгддэг (GitHub Actions, macOS).
