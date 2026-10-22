#!/bin/bash
# Selftest-ийн туршилтын файлуудыг test-fixtures/-д үүсгэнэ: 2 бичлэг (MP4) + 2 зураг (JPG).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/test-fixtures"
mkdir -p "$OUT" "$ROOT/dist"

swiftc -O "$ROOT/scripts/make_fixtures.swift" -o "$ROOT/dist/make_fixtures"
"$ROOT/dist/make_fixtures" "$OUT/vid-a.mp4" 3.2 0.48 0.12 0.31
"$ROOT/dist/make_fixtures" "$OUT/vid-b.mp4" 4.5 0.12 0.31 0.48

python3 - "$OUT" <<'EOF'
import sys
from PIL import Image, ImageDraw

out = sys.argv[1]
for i, (top, bottom) in enumerate([((255, 95, 162), (20, 10, 40)), ((255, 211, 110), (60, 20, 10))], start=1):
    img = Image.new("RGB", (1080, 1920))
    d = ImageDraw.Draw(img)
    for y in range(0, 1920, 40):
        t = y / 1920
        d.rectangle([0, y, 1080, y + 40], fill=tuple(int(bottom[k] + (top[k] - bottom[k]) * t) for k in range(3)))
    d.ellipse([240, 600, 840, 1200], outline=(255, 255, 255), width=20)
    img.save(f"{out}/photo{i}.jpg", quality=85)
    print(f"✓ photo{i}.jpg")
EOF

# Beat илрүүлэлтийн туршилтын хөгжим
python3 "$ROOT/scripts/make_test_music.py" 124
python3 "$ROOT/scripts/make_test_music.py" 100
