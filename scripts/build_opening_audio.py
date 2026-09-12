"""Generate original, deterministic opening sound layers (no external samples)."""
import math
import random
import struct
import wave
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / 'godot/assets/audio'
OUT.mkdir(parents=True, exist_ok=True)
RATE = 22050
rng = random.Random(42)

def write(name, duration, sample):
    frames = bytearray()
    low = 0.0
    for i in range(int(duration * RATE)):
        t = i / RATE
        low = .92 * low + .08 * rng.uniform(-1, 1)
        value = sample(t, low)
        fade = min(1, t / .03, (duration - t) / .08)
        value = max(-.95, min(.95, value * fade))
        frames.extend(struct.pack('<h', round(value * 32767)))
    with wave.open(str(OUT / (name + '.wav')), 'wb') as f:
        f.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
        f.writeframes(frames)

tau = math.tau
write('gallery', 8, lambda t,n: .10*math.sin(tau*55*t) + .06*math.sin(tau*82.5*t)*( .5+.5*math.sin(tau*t/4)) + n*.08)
write('signal', 1.6, lambda t,n: .20*math.sin(tau*(440*t+90*t*t))*math.exp(-t*3) + .06*math.sin(tau*880*t)*math.exp(-t*5))
write('pull', 4.5, lambda t,n: (t/4.5)**1.5*(n*.9 + .22*math.sin(tau*(48*t+18*t*t))))
write('tunnel', 9, lambda t,n: (.2+.3*math.sin(math.pi*t/9))*(n*1.5+.25*math.sin(tau*65*t)) + .05*math.sin(tau*(230*t+8*math.sin(t)))*math.sin(t*7)**12)
write('landing', 1.2, lambda t,n: .45*math.sin(tau*(65*t-14*t*t))*math.exp(-t*7) + n*.9*math.exp(-t*16))
print('Generated five opening audio layers')
