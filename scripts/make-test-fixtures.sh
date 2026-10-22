#!/bin/bash
# Selftest-ийн туршилтын файлуудыг test-fixtures/-д үүсгэнэ: 2 бичлэг (MP4) + 2 зураг (JPG).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/test-fixtures"
mkdir -p "$OUT" "$ROOT/dist"

swiftc -O "$ROOT/scripts/make_fixtures.swift" -o "$ROOT/dist/make_fixtures"
"$ROOT/dist/make_fixtures" "$OUT/vid-a.mp4" 3.2 0.48 0.12 0.31
"$ROOT/dist/make_fixtures" "$OUT/vid-b.mp4" 4.5 0.12 0.31 0.48

python3 "$ROOT/scripts/make_test_photos.py" "$OUT"

# Beat илрүүлэлтийн туршилтын хөгжим
python3 "$ROOT/scripts/make_test_music.py" 124
python3 "$ROOT/scripts/make_test_music.py" 100
