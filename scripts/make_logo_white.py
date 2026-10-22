"""Хар-цагаан Sugar логоноос видеон дээр тавих ЦАГААН, тунгалаг дэвсгэртэй логог үүсгэнэ.

  python3 scripts/make_logo_white.py
Гаралт: assets/brand/sugar-logo-white.png (ватермарк + outro-д хэрэглэнэ)
"""
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
src = Image.open(ROOT / "assets/brand/sugar-logo-bw.png").convert("L")
alpha = ImageOps.invert(src).point(lambda v: 0 if v < 30 else min(255, int(v * 1.1)))
bbox = alpha.getbbox()
alpha = alpha.crop(bbox)
pad = int(alpha.width * 0.03)
canvas = Image.new("L", (alpha.width + 2 * pad, alpha.height + 2 * pad), 0)
canvas.paste(alpha, (pad, pad))
out = Image.new("RGBA", canvas.size, (255, 255, 255, 0))
out.putalpha(canvas)
out.save(ROOT / "assets/brand/sugar-logo-white.png")
print("ok", out.size)
