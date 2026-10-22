"""Эрхийн асуудалгүй lounge-house суурь хөгжим (Python stdlib, WAV). Туршилт, demo-д — бодит reel-д эрхтэй дууг солино.
  python3 scripts/make_lounge_track.py [bpm] [bars] → generated/music/sugar-lounge-<bpm>.wav
"""
import math, random, struct, sys, wave
from pathlib import Path

bpm = int(sys.argv[1]) if len(sys.argv) > 1 else 122
bars = int(sys.argv[2]) if len(sys.argv) > 2 else 16
sr = 44100
beat = 60 / bpm
total = bars * 4 * beat + 2.0
n = int(total * sr)
random.seed(7)

# Минор хөвч (Am - F - C - G) bar бүрт солигдоно; басс = хөвчийн үндэс
chords = [[220.0, 261.63, 329.63], [174.61, 220.0, 261.63], [130.81, 164.81, 196.0], [196.0, 246.94, 293.66]]
bass_notes = [55.0, 43.65, 65.41, 49.0]

def env(t, a, d):  # энгийн attack/decay
    return min(1.0, t / a) * math.exp(-max(0.0, t - a) / d) if t >= 0 else 0.0

out = bytearray()
for i in range(n):
    t = i / sr
    b = t / beat                       # beat тоо (бутархай)
    bar = int(b // 4) % 4
    in_beat = (t % beat)
    in_half = t % (beat / 2)
    in_bar = t % (4 * beat)
    chord = chords[bar]
    # Kick: beat бүр
    kick = math.sin(2 * math.pi * 52 * in_beat * (1 + 10 * math.exp(-in_beat * 40))) * math.exp(-in_beat * 7) * 0.9
    # Clap: 2, 4 дээр
    beat_in_bar = int(b % 4)
    clap_t = in_beat if beat_in_bar in (1, 3) else 9
    clap = (random.random() * 2 - 1) * math.exp(-clap_t * 35) * 0.35 if clap_t < 0.2 else 0.0
    # Hat: off-beat 8th
    hat_t = (t + beat / 2) % beat
    hat = (random.random() * 2 - 1) * math.exp(-hat_t * 90) * 0.18
    # Bass: 8th нот, sidechain (kick-ийн дараа аажмаар орж ирнэ)
    side = 1 - 0.7 * math.exp(-in_beat * 12)
    bass = math.sin(2 * math.pi * bass_notes[bar] * t) * 0.35 * side * (0.6 + 0.4 * (1 if in_half < beat / 4 else 0.4))
    # Pad: хөвч, зөөлөн saw-маягийн 2 harmonics, sidechain
    pad = sum(math.sin(2 * math.pi * f * t) + 0.3 * math.sin(2 * math.pi * 2 * f * t + 0.5) for f in chord) / 3 * 0.12 * side
    # Pluck: bar-ын 3-р beat дээр хөвчийн дээд нот
    pl_t = in_bar - 2 * beat
    pluck = math.sin(2 * math.pi * chord[2] * 2 * t) * env(pl_t, 0.005, 0.25) * 0.15 if 0 <= pl_t < 1.0 else 0.0
    # Intro 2 bar: зөвхөн pad + hat, дараа нь kick орно; төгсгөлд fade
    k = 1.0 if b >= 8 else 0.0
    fade = min(1.0, (total - t) / 1.5)
    v = (kick * k + clap * k + hat + bass * (0.3 + 0.7 * k) + pad + pluck) * 0.9 * fade
    out += struct.pack('<h', int(max(-1, min(1, v)) * 32767))

dest = Path(__file__).resolve().parent.parent / 'generated' / 'music' / f'sugar-lounge-{bpm}.wav'
dest.parent.mkdir(parents=True, exist_ok=True)
with wave.open(str(dest), 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(bytes(out))
print('✓', dest.relative_to(dest.parents[2]), f'{total:.1f}с', f'{bpm} BPM, kick 8 beat-ээс эхэлнэ (2 bar intro)')
