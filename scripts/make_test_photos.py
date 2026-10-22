"""Selftest-ийн туршилтын зураг (1080x1920 JPG) — зөвхөн Python stdlib + macOS `sips` (Pillow хэрэггүй, CI-д ч ажиллана).
  python3 scripts/make_test_photos.py [out_dir]
"""
import struct, subprocess, sys
from pathlib import Path

out = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "test-fixtures")
out.mkdir(parents=True, exist_ok=True)
W, H = 1080, 1920


def write_bmp(path, top, bottom):
    """Дээрээс доош градиент + цагаан тойрог (24-bit BMP, доороос дээш мөрлөнө)."""
    row_bytes = (W * 3 + 3) & ~3
    data = bytearray()
    cx, cy, r = 540, 900, 300
    for y in range(H - 1, -1, -1):
        t = y / H
        base = [int(bottom[k] + (top[k] - bottom[k]) * t) for k in range(3)]
        row = bytearray()
        for x in range(W):
            on_ring = abs((x - cx) ** 2 + (y - cy) ** 2 - r * r) < 2 * r * 20
            b, g, rr = (255, 255, 255) if on_ring else (base[2], base[1], base[0])
            row += bytes((b, g, rr))
        row += b"\0" * (row_bytes - W * 3)
        data += row
    header = struct.pack("<2sIHHI", b"BM", 54 + len(data), 0, 0, 54)
    info = struct.pack("<IiiHHIIiiII", 40, W, H, 1, 24, 0, len(data), 2835, 2835, 0, 0)
    path.write_bytes(header + info + data)


for i, (top, bottom) in enumerate([((255, 95, 162), (20, 10, 40)), ((255, 211, 110), (60, 20, 10))], start=1):
    bmp = out / f"photo{i}.bmp"
    jpg = out / f"photo{i}.jpg"
    write_bmp(bmp, top, bottom)
    try:
        subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "85", str(bmp), "--out", str(jpg)],
                       check=True, capture_output=True)
        bmp.unlink()
        print(f"✓ {jpg.name}")
    except (FileNotFoundError, subprocess.CalledProcessError):
        print(f"✓ {bmp.name} (sips алга — BMP хэвээр)")
