"""Beat илрүүлэлтийг шалгах туршилтын хөгжим: 124 BPM kick + hi-hat + pad, 40с, WAV.
  python3 scripts/make_test_music.py [bpm] → test-fixtures/beat-<bpm>.wav
"""
import math, struct, sys, wave
from pathlib import Path

bpm = int(sys.argv[1]) if len(sys.argv) > 1 else 124
sr, secs = 44100, 40
beat = 60 / bpm
first_beat = 0.37  # эхний beat 0.37с дээр — offset илрүүлэлтийг шалгана
n = sr * secs
out = bytearray()
for i in range(n):
    t = i / sr
    since = (t - first_beat) % beat if t >= first_beat else 1.0
    kick = math.sin(2 * math.pi * 55 * since * (1 + 8 * math.exp(-since * 30))) * math.exp(-since * 9) if since < 0.4 else 0.0
    hat_since = (t - first_beat + beat / 2) % (beat / 2)
    hat = (math.sin(2 * math.pi * 6000 * t) * 0.15 * math.exp(-hat_since * 60)) if t >= first_beat else 0.0
    pad = 0.08 * (math.sin(2 * math.pi * 220 * t) + 0.5 * math.sin(2 * math.pi * 330 * t))
    v = 0.8 * kick + hat + pad
    out += struct.pack('<h', int(max(-1, min(1, v)) * 32767))
dest = Path(__file__).resolve().parent.parent / 'test-fixtures' / f'beat-{bpm}.wav'
dest.parent.mkdir(exist_ok=True)
with wave.open(str(dest), 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(bytes(out))
print('✓', dest.name, f'{secs}с', f'{bpm} BPM, эхний beat {first_beat}с')
