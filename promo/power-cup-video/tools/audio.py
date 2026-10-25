"""Musik latar 120 BPM × SPEED + efek suara yang disinkronkan dengan EVENTS animasi.
python3 audio.py events.json out.wav"""
import json, sys
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve
from scipy.io import wavfile

SR = 44100
ev = json.load(open(sys.argv[1]))
DUR = ev['duration']
SPD = ev.get('speed', 1)   # timeline animasi dipercepat; musik ikut supaya adegan tetap jatuh di ketukan
N = int(SR * (DUR + 1.0))
rng = np.random.default_rng(7)

def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], 'bandpass', fs=SR, output='sos'), x)
def lp(x, f, order=2):
    return sosfilt(butter(order, f, 'lowpass', fs=SR, output='sos'), x)
def hp(x, f, order=2):
    return sosfilt(butter(order, f, 'highpass', fs=SR, output='sos'), x)
def tt(d):
    return np.arange(int(SR * d)) / SR
def add(buf, x, t, g=1.0):
    i = int(t * SR)
    if i >= len(buf) or i + len(x) <= 0: return
    if i < 0: x = x[-i:]; i = 0
    n = min(len(x), len(buf) - i)
    buf[i:i + n] += x[:n] * g
def saw(f, t, ph=0.0):
    """saw band-limited (polyBLEP) supaya tidak aliasing"""
    p = (f * t + ph) % 1
    dt = f / SR
    y = 2 * p - 1
    a = p < dt; x = p[a] / dt; y[a] -= x + x - x * x - 1
    b = p > 1 - dt; x = (p[b] - 1) / dt; y[b] -= x * x + x + x + 1
    return y
def midi(n):
    return 440 * 2 ** ((n - 69) / 12)
def reverb(x, secs=1.2, mix=.25):
    ir = rng.standard_normal(int(SR * secs)) * np.exp(-np.linspace(0, 7, int(SR * secs)))
    ir = lp(ir, 5000); ir /= np.sqrt(np.sum(ir ** 2))
    return x * (1 - mix) + fftconvolve(x, ir)[:len(x)] * mix

BPM = 120 * SPD; BEAT = 60 / BPM; BAR = 4 * BEAT
# C – G – Am – F
CHORDS = [[48, 55, 60, 64, 67], [43, 55, 59, 62, 67], [45, 57, 60, 64, 69], [41, 53, 57, 60, 65]]
ARP = [0, 2, 3, 4, 3, 2, 3, 4]

def section_level(t):
    t = t * SPD   # bandingkan dalam detik timeline
    """intensitas per bagian (kick, clap, hat, bass, arp, pad)"""
    if t < 2.4: return dict(k=0, c=0, h=0, b=0, a=.5, p=1)
    if t < 8: return dict(k=1, c=0, h=.6, b=.8, a=.8, p=1)
    if 124 <= t < 131.5: return dict(k=0, c=0, h=.4, b=.5, a=1, p=1)
    if t >= 174: return dict(k=0, c=0, h=0, b=0, a=0, p=1)
    return dict(k=1, c=1, h=1, b=1, a=1, p=1)

kick_b = np.zeros(N); clap_b = np.zeros(N); hat_b = np.zeros(N)
bass_b = np.zeros(N); arp_b = np.zeros(N); pad_b = np.zeros(N)
duck = np.ones(N)

# drum
kt = tt(.45)
kick = np.sin(2 * np.pi * np.cumsum(45 + 110 * np.exp(-kt * 28)) / SR) * np.exp(-kt * 7.5)
kick += hp(rng.standard_normal(len(kt)), 2000) * np.exp(-kt * 120) * .25
ct = tt(.25)
cn = bp(rng.standard_normal(len(ct)), 900, 2600)
clap = cn * (np.exp(-ct * 22) + .6 * np.exp(-np.maximum(ct - .012, 0) * 60) * (ct > .012) + .5 * np.exp(-np.maximum(ct - .024, 0) * 60) * (ct > .024))
ht = tt(.06)
hat = hp(rng.standard_normal(len(ht)), 7000) * np.exp(-ht * 70)
oht = tt(.25)
ohat = hp(rng.standard_normal(len(oht)), 6500) * np.exp(-oht * 14)
dk = 1 - .55 * np.exp(-tt(BEAT) * 9)

nbeats = int(DUR / BEAT) + 1
for b in range(nbeats):
    t = b * BEAT
    if t >= DUR - .3: break
    L = section_level(t)
    if L['k']:
        add(kick_b, kick, t, .75 * L['k'])
        i = int(t * SR); n = min(len(dk), N - i); duck[i:i + n] = np.minimum(duck[i:i + n], dk[:n])
    if L['c'] and b % 4 in (1, 3): add(clap_b, clap, t, .45 * L['c'])
    if L['h']:
        add(hat_b, hat, t + BEAT / 2, .22 * L['h'])
        if b % 8 == 7 and L['c']: add(hat_b, ohat, t + BEAT / 2, .12)
        add(hat_b, hat, t + BEAT * .75, .08 * L['h'])

# harmoni
for bar in range(int(DUR / BAR) + 1):
    t0 = bar * BAR
    if t0 >= DUR - .2: break
    ch = CHORDS[bar % 4]
    L = section_level(t0 + .01)
    # pad: 3 saw ter-detune per nada
    d = BAR + .3
    t = tt(d)
    env = np.minimum(1, t / .35) * np.minimum(1, (d - t) / .3)
    pad = np.zeros(len(t))
    for n in ch[1:]:
        f = midi(n)
        for det in (-.12, 0, .11):
            pad += saw(f * 2 ** (det / 12), t, rng.random())
    pad = lp(pad, 1500) * env * .045
    add(pad_b, pad, t0, L['p'])
    # bass: not seperdelapan (offbeat), akar akor
    if L['b']:
        f = midi(ch[0] - 12 if ch[0] > 45 else ch[0])
        for k in range(8):
            if k % 2 == 0 and bar % 2 == 0 and k == 0: pass
            st = t0 + k * BEAT / 2
            if k % 2 == 0: continue
            bt = tt(BEAT / 2 * .9)
            be = np.minimum(1, bt / .005) * np.exp(-bt * 5)
            bs = lp(saw(f, bt) + .5 * np.sin(2 * np.pi * f * bt), 600) * be
            add(bass_b, bs, st, .32 * L['b'])
    # arp pluck seperenambelas
    if L['a']:
        for k in range(16):
            n = ch[ARP[k % 8]] + 12
            st = t0 + k * BEAT / 4
            pt = tt(.32)
            pe = np.minimum(1, pt / .003) * np.exp(-pt * 13)
            f = midi(n)
            pl = (saw(f, pt) + saw(f * 1.006, pt, .3)) * .5
            pl = lp(pl, 2600) * pe
            add(arp_b, pl, st, (.075 if k % 4 == 0 else .05) * L['a'])

# akord penutup
t = tt(3.0)
fin = np.zeros(len(t))
for n in CHORDS[0]:
    for det in (-.1, .1):
        fin += saw(midi(n + 12) * 2 ** (det / 12), t)
fin = lp(fin, 2200) * np.exp(-t * 1.3) * .05
add(pad_b, fin, 174.0 / SPD)
add(kick_b, kick, 174.0 / SPD, 1.0)

music = kick_b + clap_b + hat_b + (bass_b + pad_b) * duck + reverb(arp_b, .9, .3) * (.6 + .4 * duck)
music = reverb(music, .6, .08)

# ---------- SFX ----------
def whoosh(d=.6, lo=500, hi=5000, g=1):
    t = tt(d); x = rng.standard_normal(len(t))
    env = np.sin(np.pi * t / d) ** 2
    a = bp(x, lo, hi) * env
    b = bp(x, lo * 2, min(hi * 1.5, 18000)) * (np.sin(np.pi * np.clip((t - d * .2) / (d * .8), 0, 1)) ** 2)
    return (a * .7 + b * .5) * g
def pop():
    t = tt(.12)
    return np.sin(2 * np.pi * np.cumsum(320 + 500 * np.exp(-t * 40)) / SR) * np.exp(-t * 35) * .5
def slam():
    t = tt(1.4)
    boom = np.sin(2 * np.pi * np.cumsum(32 + 90 * np.exp(-t * 14)) / SR) * np.exp(-t * 3.2)
    nz = lp(rng.standard_normal(len(t)), 1800) * np.exp(-t * 6) * .6
    return reverb(boom + nz, 1.2, .25) * .9
def flip():
    t = tt(.12); x = hp(rng.standard_normal(len(t)), 2500)
    return x * (np.exp(-t * 60) + .5 * np.exp(-np.maximum(t - .05, 0) * 70) * (t > .05)) * .35
def swish():
    return whoosh(.28, 1500, 7000, .5)
def tick():
    t = tt(.03)
    return np.sin(2 * np.pi * 2200 * t) * np.exp(-t * 180) * .28
def bell(freqs, d=1.0, dec=4.0, g=.25):
    t = tt(d); x = np.zeros(len(t))
    for i, f in enumerate(freqs):
        x += np.sin(2 * np.pi * f * t) * np.exp(-t * dec * (1 + i * .3)) / (1 + i * .5)
        x += .2 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * dec * 3)
    return reverb(x * np.minimum(1, t / .002), .8, .3) * g
def coin():
    a = bell([988], .12, 20, .25); b = bell([1318], .7, 5, .28)
    out = np.zeros(int(SR * .8)); out[:len(a)] += a; out[int(SR * .08):int(SR * .08) + len(b)] += b[:len(out) - int(SR * .08)]
    return out
def stamp():
    t = tt(.4)
    th = np.sin(2 * np.pi * np.cumsum(50 + 120 * np.exp(-t * 30)) / SR) * np.exp(-t * 11)
    nz = bp(rng.standard_normal(len(t)), 200, 3000) * np.exp(-t * 30) * .5
    return (th + nz) * .8
def notif():
    a = bell([1046.5], .5, 6, .22); b = bell([1568], .9, 5, .22)
    out = np.zeros(int(SR * 1.0)); out[:len(a)] += a; s = int(SR * .13); out[s:s + len(b)] += b[:len(out) - s]
    return out
def tap():
    t = tt(.04)
    return lp(rng.standard_normal(len(t)), 3000) * np.exp(-t * 120) * .35
def spin(d=2.2):
    out = np.zeros(int(SR * (d + .1))); tk = tick()
    tcur = 0; gap = .045
    while tcur < d:
        i = int(tcur * SR); out[i:i + len(tk)] += tk[:len(out) - i] * .8
        gap = .045 + (tcur / d) ** 2 * .22; tcur += gap
    return out
def riser(d=2.4):
    t = tt(d)
    f = 180 * (8 ** (t / d))
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * .15 + hp(rng.standard_normal(len(t)), 1500) * .12 * (t / d)
    return s * (t / d) ** 2
def cheer():
    out = np.zeros(int(SR * 2.4))
    for i, n in enumerate([72, 76, 79, 84, 88]):
        b = bell([midi(n)], 1.2, 3.5, .16); s = int(SR * i * .09); out[s:s + len(b)] += b[:len(out) - s]
    t = tt(2.4)
    crowd = bp(rng.standard_normal(len(t)), 400, 2500) * (np.sin(np.pi * t / 2.4) ** 1.5) * (1 + .3 * np.sin(2 * np.pi * 7 * t)) * .12
    return out + crowd

SFX = {
    'trans': lambda: whoosh(.6, 400, 4500, .55), 'whoosh': lambda: whoosh(.5, 600, 6000, .45), 'pop': pop, 'slam': slam,
    'flip': flip, 'swish': swish, 'tick': tick, 'ding': lambda: bell([1318.5, 1975.5], 1.0, 4, .26), 'coin': coin,
    'reveal': lambda: bell([1046.5, 1318.5, 1568, 2093], 1.6, 2.5, .3), 'stamp': stamp, 'thud': lambda: stamp() * .8, 'notif': notif, 'tap': tap,
    'spin': lambda: spin(2.2), 'spin_s': lambda: spin(1.1), 'riser': lambda: riser(2.4), 'riser_s': lambda: riser(.8), 'cheer': cheer
}
cache = {}
sfx = np.zeros(N)
for e in ev['events']:
    k = e['k']
    if k not in SFX: print('sfx?', k); continue
    if k not in cache or k in ('trans', 'whoosh', 'swish', 'cheer', 'riser', 'stamp', 'flip'):
        cache[k] = SFX[k]()
    add(sfx, cache[k], e['t'], 1.0)

mix = music * .55 + sfx * .8
# stereo ringan: arp & hat sedikit melebar
L = mix + .05 * (arp_b - hat_b)
R = mix - .05 * (arp_b - hat_b)
st = np.stack([L, R], 1)
st = np.tanh(st * 1.6) / 1.6
fade = np.ones(N); fl = int(SR * 1.2); fe = int(SR * DUR)
fade[fe - fl:fe] = np.linspace(1, 0, fl); fade[fe:] = 0
st *= fade[:, None]
st /= np.max(np.abs(st)) / .89
wavfile.write(sys.argv[2], SR, (st[:int(SR * DUR)] * 32767).astype(np.int16))
print('ok', DUR, 'detik,', len(ev['events']), 'efek')
