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


# ---------------------------------------------------------------- 分裂桥段
# 新层一律追加在末尾：rng 是共享状态，插到前面会改掉上面五个文件的噪声。

def q_split(t, n):
    """拉伸到极限再「啵」一声弹开，尾巴留果冻余振。"""
    tension = min(t / 0.55, 1.0)
    # 音高随张力下行，像麦芽糖被拉长
    stretch = 0.17 * math.sin(tau * (250 - 140 * t) * t) * tension * math.exp(-max(t - 0.72, 0) * 9)
    pop = 0.0
    jelly = 0.0
    if t > 0.78:
        d = t - 0.78
        pop = 0.44 * math.sin(tau * (155 + 55 * math.sin(d * 38)) * d) * math.exp(-d * 5.2)
        jelly = 0.13 * math.sin(tau * 8.5 * d) * math.exp(-d * 2.1)
    return stretch + pop + jelly + n * 0.05


def babble(base, contour, speed):
    """无字乱语：音节包络 + 每节音高跳变，听起来像在说话但没有词。
    音节边界处包络归零，顺便掩掉相位跳变。"""
    def sample(t, n):
        index = int(t * speed)
        if index >= len(contour):
            return 0.0
        frac = t * speed - index
        env = math.sin(math.pi * frac) ** 1.4
        f = base * contour[index]
        # 三个谐波堆出元音感
        voice = (0.52 * math.sin(tau * f * t)
                 + 0.28 * math.sin(tau * f * 2.4 * t)
                 + 0.14 * math.sin(tau * f * 3.7 * t))
        return (0.30 * voice + n * 0.05) * env
    return sample


def hop_away(t, n):
    """四次弹跳，越远越轻、音高越低。"""
    out = 0.0
    for i, at in enumerate((0.0, 0.33, 0.64, 0.92)):
        if t >= at:
            d = t - at
            f = (188 - i * 24) * (1.0 - d * 0.45)
            out += 0.33 * (0.66 ** i) * math.sin(tau * f * d) * math.exp(-d * 11)
    return out + n * 0.04 * math.exp(-t * 2.0)


def belly_laugh(t, n):
    """「哈哈哈」：约 6.5Hz 音节，整体下行且逐渐没力。"""
    speed = 6.5
    index = int(t * speed)
    if index > 9:
        return 0.0
    frac = t * speed - index
    env = math.sin(math.pi * frac) ** 1.2
    fade = math.exp(-t * 0.5)
    f = (335 - index * 15) * (1.0 - frac * 0.18)
    voice = 0.55 * math.sin(tau * f * t) + 0.24 * math.sin(tau * f * 2.2 * t)
    return (0.32 * voice + n * 0.26 * env) * env * fade


write('split', 1.5, q_split)
# 妈妈：低、平、三个音节收尾下沉，像敷衍地应了一声
write('voice_mother', 0.85, babble(150, (1.0, 0.92, 0.78), 4.6))
# 奶蛙：高、跳、末音上扬，像在追问
write('voice_child', 1.0, babble(255, (1.0, 1.22, 0.95, 1.4), 5.4))
write('hop_away', 1.6, hop_away)
# laugh.wav 已换成实录素材，不再由 belly_laugh 生成；重新启用会覆盖掉素材。
# 它原本是最后一个 write，注释掉不影响上面各层的 rng 噪声。
print('Generated five opening layers plus four mitosis layers')
