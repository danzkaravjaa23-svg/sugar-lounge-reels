"""Sugar логоны мартини хундаганаас аппын icon-уудыг үүсгэнэ.

  python3 scripts/make_icons.py

Гаралт:
  mac/AppIcon.icns                Mac програмын icon
  icons/icon-192.png, icon-512.png, apple-touch-icon.png   PWA icon
"""

import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parent.parent
LOGO = ROOT / "assets/brand/sugar-logo-bw.png"

DARK = (14, 8, 13)
PLUM = (58, 18, 46)
PINK = (255, 95, 162)
GLASS_BOX = (175, 40, 720, 870)  # логон дээрх хундага + чидун + "S"
TEXT_BOX = (520, 445, 1529, 1029)  # "DINING", "ugar" — хундаганы баруун доод талд, арилгана


def glass_mask(height):
    """Хар зураасыг тунгалаг маск болгоно (хар → харагдана)."""
    logo = Image.open(LOGO).convert("L")
    ImageDraw.Draw(logo).rectangle(TEXT_BOX, fill=255)
    logo = logo.crop(GLASS_BOX)
    mask = ImageOps.invert(logo).point(lambda v: 0 if v < 40 else min(255, int(v * 1.15)))
    mask = mask.crop(mask.getbbox())
    w = round(mask.width * height / mask.height)
    return mask.resize((w, height), Image.LANCZOS)


def artwork(size):
    """Бараан дэвсгэр + ягаан гэрэл + цагаан хундага, дөрвөлжин (булан тайраагүй)."""
    img = Image.new("RGB", (size, size), DARK)
    grad = Image.linear_gradient("L").resize((size, size)).rotate(180)
    img = Image.composite(Image.new("RGB", (size, size), PLUM), img, grad.point(lambda v: v // 2))

    glow = Image.new("L", (size, size), 0)
    r = size * 0.42
    cx, cy = size * 0.52, size * 0.38
    ImageDraw.Draw(glow).ellipse([cx - r, cy - r, cx + r, cy + r], fill=150)
    glow = glow.filter(ImageFilter.GaussianBlur(size * 0.16))
    img = Image.composite(Image.new("RGB", (size, size), PINK), img, glow)

    mask = glass_mask(round(size * 0.70))
    x = (size - mask.width) // 2 + round(size * 0.02)
    y = (size - mask.height) // 2
    shadow = Image.new("L", (size, size), 0)
    shadow.paste(mask, (x, y + round(size * 0.012)))
    shadow = shadow.filter(ImageFilter.GaussianBlur(size * 0.012))
    img = Image.composite(Image.new("RGB", (size, size), (0, 0, 0)), img, shadow.point(lambda v: v * 6 // 10))
    full = Image.new("L", (size, size), 0)
    full.paste(mask, (x, y))
    img = Image.composite(Image.new("RGB", (size, size), (255, 244, 249)), img, full)
    return img


def mac_icon(size=1024):
    """macOS загвар: 824px дугуй булантай дөрвөлжин + сүүдэр, тунгалаг ирмэг."""
    inner = round(size * 824 / 1024)
    radius = round(inner * 0.225)
    off = (size - inner) // 2

    art = artwork(inner)
    shape = Image.new("L", (inner, inner), 0)
    ImageDraw.Draw(shape).rounded_rectangle([0, 0, inner - 1, inner - 1], radius=radius, fill=255)

    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    shadow = Image.new("L", (size, size), 0)
    shadow.paste(shape, (off, off + round(size * 0.01)))
    shadow = shadow.filter(ImageFilter.GaussianBlur(size * 0.012))
    canvas.paste(Image.new("RGBA", (size, size), (0, 0, 0, 110)), (0, 0), shadow)

    edge = Image.new("RGBA", (inner, inner), (255, 255, 255, 0))
    ImageDraw.Draw(edge).rounded_rectangle([0, 0, inner - 1, inner - 1], radius=radius,
                                           outline=(255, 255, 255, 40), width=max(1, size // 256))
    tile = art.convert("RGBA")
    tile.alpha_composite(edge)
    canvas.paste(tile, (off, off), shape)
    return canvas


def write_icns(master, out):
    with tempfile.TemporaryDirectory() as tmp:
        iconset = Path(tmp) / "AppIcon.iconset"
        iconset.mkdir()
        for base in (16, 32, 128, 256, 512):
            for scale in (1, 2):
                px = base * scale
                name = f"icon_{base}x{base}{'@2x' if scale == 2 else ''}.png"
                master.resize((px, px), Image.LANCZOS).save(iconset / name)
        subprocess.run(["iconutil", "-c", "icns", str(iconset), "-o", str(out)], check=True)


def main():
    (ROOT / "mac").mkdir(exist_ok=True)
    write_icns(mac_icon(1024), ROOT / "mac/AppIcon.icns")

    square = artwork(1024)
    square.resize((512, 512), Image.LANCZOS).save(ROOT / "icons/icon-512.png")
    square.resize((192, 192), Image.LANCZOS).save(ROOT / "icons/icon-192.png")
    square.resize((180, 180), Image.LANCZOS).save(ROOT / "icons/apple-touch-icon.png")
    mac_icon(1024).save(ROOT / "mac/AppIcon-preview.png")
    print("icons ok")


if __name__ == "__main__":
    main()
