"""Rakit reel sinematik Paddoc Host (tanpa teks, tanpa voice-over): 60 dtk, 1080x1920, 30 fps, hening.

Tiap shot punya durasi tampil `dur` (dari titik tengah transisi ke titik tengah transisi berikutnya) dan
transisi `fade` (dissolve, detik) ke shot berikutnya; 0 = potong langsung. Shot dirender dengan kepala/ekor
setengah transisi lalu dirangkai dengan xfade, sehingga total tetap tepat 1800 frame.
Video berakhir di paruh penutup logo dan mulai di paruh pembukanya (loop menyambung).
Pemakaian: python3 -I assemble_cine.py [output.mp4]
"""
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
UP = os.environ.get('REEL_FOOTAGE', os.path.join(ROOT, 'footage'))   # video asli klub (tidak disimpan di repo)
DRIVE = os.path.join(ROOT, 'drive')                              # IMG_7038/7039 dari Drive, bila terpisah
HF = os.path.join(ROOT, 'hf')
SEG = os.path.join(ROOT, 'seg_cine')
FPS, OUT_W, OUT_H = 30, 1080, 1920


def up(key):
    for d in (UP, DRIVE):
        for f in sorted(os.listdir(d)) if os.path.isdir(d) else []:
            if key in f:
                return os.path.join(d, f)
    raise SystemExit('footage tidak ditemukan: ' + key)


def hf(key):
    return os.path.join(HF, next(f for f in sorted(os.listdir(HF)) if key in f and f.endswith('.mp4')))


def zoom(z, cx=.5, cy=.5):
    """Crop 9:16 selebar z x lebar sumber, berpusat di (cx, cy) relatif, dijepit di dalam frame."""
    w, h = 'iw*%s' % z, 'iw*%s*16/9' % z
    return "crop=%s:%s:x='min(max(0,iw*%s-ow/2),iw-ow)':y='min(max(0,ih*%s-oh/2),ih-oh)'" % (w, h, cx, cy)


FULL = zoom(1)
GRADE = ('eq=contrast=1.06:saturation=0.9:gamma=0.97,'
         'colorbalance=rs=-0.03:gs=-0.01:bs=0.04:rh=0.04:gh=0.01:bh=-0.03,vignette=PI/4.5')
GRAIN = 'noise=alls=6:allf=t'


def lights(steps):
    """Kecerahan bertahap ala lampu court per baris: daftar (detik, brightness) mulai t=0 segmen tampil."""
    # langkah terakhir harus paling luar: if(T>=t_n, b_n, if(T>=t_n-1, ...)); sebelum t_0 pakai b_0
    expr = str(steps[0][1])
    for t, b in steps:
        expr = 'if(gte(T,%.3f),%s,%s)' % (t, b, expr)
    return expr


# lampu menyala: gelap -> 3 baris lampu menyala berurutan dengan sedikit kedip
ON = [(0, -0.92), (0.35, -0.55), (0.42, -0.75), (0.5, -0.5), (0.8, -0.22), (0.86, -0.4), (0.92, -0.18), (1.25, 0)]
# lampu padam di akhir shot penutup (dur 4 dtk): baris demi baris lalu gelap total
OFF = [(0, 0), (2.3, -0.22), (2.36, -0.05), (2.42, -0.25), (2.85, -0.52), (3.3, -0.8), (3.6, -1.0)]

# (id, dur, sumber, mulai_di_sumber, opsi, fade_ke_berikutnya)
TIMELINE = [
    ('logo_in', 2.5, os.path.join(ROOT, 'bumper', 'cine_start.mp4'), 0, {}, 0.8),
    ('dokter', 6.5, hf('2ab79471'), 1.6, {'grade': True}, 0.8),
    ('court_nyala', 4.0, hf('cb3b16b9'), 0.7, {'vf': zoom(.8, .5, .4), 'grade': True, 'light': ON}, 0.6),   # buang artefak lantai di bawah
    ('rally', 2.6, up('bb13c206'), 24.3, {'vf': zoom(.85, .5, .5), 'sharp': True, 'grade': True, 'speed': .85}, 0.5),
    ('rentang', 3.4, up('e6a55773'), 101.35, {'vf': zoom(.6, .78, .55), 'sharp': True, 'grade': True, 'slowmo': 2}, 0.8),
    ('meja_lebar', 4.0, os.path.join(ROOT, 'desk', 'desk_wide.mp4'), 0.4, {'grain': True}, 0.8),
    ('meja_depan', 6.0, os.path.join(ROOT, 'desk', 'desk_front.mp4'), 0.4, {'grain': True}, 0.8),
    ('morph', 4.0, os.path.join(ROOT, 'desk', 'morph.mp4'), 0.4, {}, 0),
    ('chibi', 4.0, hf('303b5450'), 0, {'grain': True}, 0.8),
    ('venue_laptop', 2.5, up('IMG_7038'), 2.4, {'vf': FULL, 'grade': True}, 0.6),
    ('venue_monitor', 2.5, up('IMG_7039'), 1.3, {'vf': FULL, 'grade': True}, 0.6),
    ('podium_asli', 5.0, up('IMG_7039'), 16.3, {'vf': FULL, 'grade': True}, 0.6),
    ('tawa_1', 2.0, up('IMG_7039'), 32.35, {'vf': FULL, 'grade': True, 'speed': .85}, 0.5),
    ('tawa_2', 2.0, up('IMG_7039'), 34.6, {'vf': FULL, 'grade': True, 'speed': .85}, 0.5),
    ('tawa_3', 2.0, up('IMG_7039'), 38.95, {'vf': FULL, 'grade': True, 'speed': .85}, 0.8),
    ('court_padam', 4.0, None, 0.6, {'grade': True, 'light': OFF}, 0),
    ('logo_out', 3.0, os.path.join(ROOT, 'bumper', 'cine_end.mp4'), 0, {}, 0),
]


def frames(sec):
    return int(round(sec * FPS))


def render(i, seg, lead, tail):
    sid, dur, src, ss, o, _ = seg
    n = frames(lead + dur + tail)
    out = os.path.join(SEG, '%02d_%s.mp4' % (i, sid))
    speed = o.get('speed', 1)
    start = ss - lead * speed / (o.get('slowmo', 1))
    if start < 0:
        raise SystemExit('%s: mulai sumber %.2f < 0, geser ss' % (sid, start))
    if os.path.exists(out) and not os.environ.get('NOCACHE'):   # segmen yang sudah jadi dipakai ulang
        got = subprocess.run(['ffprobe', '-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries',
                              'stream=nb_read_frames', '-of', 'csv=p=0', out], capture_output=True, text=True).stdout.strip()
        if got == str(n):
            return out, n
    chain = ['setpts=PTS-STARTPTS']
    if o.get('vf'):
        chain.append(o['vf'])
    if o.get('slowmo'):                      # gerak lambat dengan interpolasi gerak (sumber 30 fps)
        chain += ['minterpolate=fps=%d:mi_mode=mci:mc_mode=aobmc:vsbmc=1' % (FPS * o['slowmo']), 'setpts=%s*PTS' % o['slowmo']]
    elif speed != 1:
        chain.append('setpts=PTS/%s' % speed)
    chain += ['fps=%d' % FPS, 'scale=%d:%d:flags=lanczos' % (OUT_W, OUT_H), 'setsar=1', 'format=yuv420p']
    if o.get('sharp'):
        chain.append('unsharp=5:5:0.6:5:5:0')
    if o.get('light'):                       # T = waktu sejak awal bagian tampil (setelah kepala transisi)
        chain.append("eq=eval=frame:brightness='%s'" % lights(o['light']).replace('T', '(t-%.3f)' % lead))
    if o.get('grade'):
        chain += [GRADE, GRAIN]
    elif o.get('grain'):
        chain.append(GRAIN)
    chain += ['trim=end_frame=%d' % n, 'setpts=PTS-STARTPTS']
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', '%.3f' % start, '-i', src, '-an', '-vf', ','.join(chain),
                    '-frames:v', str(n), '-r', str(FPS), '-c:v', 'libx264', '-preset', 'slow', '-crf', '14',
                    '-pix_fmt', 'yuv420p', out], check=True)
    got = int(subprocess.run(['ffprobe', '-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries',
                              'stream=nb_read_frames', '-of', 'csv=p=0', out], capture_output=True, text=True).stdout.strip())
    if got != n:
        raise SystemExit('%s: %d frame, seharusnya %d (sumber terlalu pendek?)' % (sid, got, n))
    return out, n


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'paddoc_reel_cine.mp4')
    os.makedirs(SEG, exist_ok=True)
    tl = [list(s) for s in TIMELINE]
    tl[-2][2] = os.environ.get('COURT_OFF') or hf(os.environ.get('COURT_OFF_ID', 'd4a27492'))
    total = sum(frames(s[1]) for s in tl)
    if total != 60 * FPS:
        raise SystemExit('total %d frame, seharusnya %d' % (total, 60 * FPS))
    parts = []
    for i, s in enumerate(tl):
        lead = tl[i - 1][5] / 2 if i else 0
        tail = s[5] / 2 if i < len(tl) - 1 else 0
        parts.append(render(i, s, lead, tail))
    # rangkai: xfade untuk dissolve, concat untuk potong langsung
    args, graph, last, length = ['ffmpeg', '-v', 'error', '-y'], [], 'n0', parts[0][1]
    for i, (p, _) in enumerate(parts):
        args += ['-i', p]
        graph.append('[%d:v]fps=%d,format=yuv420p,setsar=1,settb=AVTB[n%d]' % (i, FPS, i))   # timebase seragam untuk xfade
    for i in range(1, len(parts)):
        fade, lab = tl[i - 1][5], 'x%d' % i
        if fade > 0:
            graph.append('[%s][n%d]xfade=transition=fade:duration=%.3f:offset=%.4f[%s]' % (last, i, fade, (length - frames(fade)) / FPS, lab))
            length += parts[i][1] - frames(fade)
        else:
            graph.append('[%s][n%d]concat=n=2:v=1:a=0,settb=AVTB[%s]' % (last, i, lab))
            length += parts[i][1]
        last = lab
    args += ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-filter_complex', ';'.join(graph),
             '-map', '[%s]' % last, '-map', '%d:a' % len(parts), '-shortest', '-frames:v', str(total),
             '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
             '-r', str(FPS), '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out]
    subprocess.run(args, check=True)
    print(out, length, 'frame dirangkai,', total, 'frame target')


if __name__ == '__main__':
    main()
