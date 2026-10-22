"""Rakit reel Paddoc Host 60 detik (1080x1920, 30fps) dari klip render + footage asli.

Tiap segmen dirender ke seg/NN.mp4 dengan jumlah frame pas, lalu digabung. Video berakhir di paruh
pertama animasi logo dan mulai di paruh keduanya, jadi saat Reels berulang gerakannya menyambung.
Pemakaian: python3 -I assemble.py [nama_output.mp4]
"""
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
CAP = os.path.join(ROOT, 'cap')
BUM = os.path.join(ROOT, 'bumper')
CAPS = os.path.join(BUM, 'cap')
SEG = os.path.join(ROOT, 'seg')
FPS = 30
OUT_W, OUT_H = 1080, 1920


def cap(name, t0, t1):
    return (os.path.join(CAPS, name + '.png'), t0, t1)


UP = os.environ.get('REEL_FOOTAGE', os.path.join(ROOT, 'footage'))   # folder video asli (tidak disimpan di repo)


def up(key):
    """Footage yang dilampirkan user, dicari dari potongan nama file."""
    return os.path.join(UP, next(f for f in sorted(os.listdir(UP)) if key in f))


def zoom(z, cx=.5, cy=.5):
    """Crop 9:16 selebar z x lebar sumber, berpusat di (cx, cy) relatif, dijepit di dalam frame."""
    w, h = 'iw*%s' % z, 'iw*%s*16/9' % z
    return "crop=%s:%s:x='min(max(0,iw*%s-ow/2),iw-ow)':y='min(max(0,ih*%s-oh/2),ih-oh)'" % (w, h, cx, cy)


FULL = zoom(1)   # sumber 464x832 tidak persis 9:16, jadi tetap dicrop


# (id, detik, sumber, mulai_di_sumber, opsi)
TIMELINE = [
    ('logo_in', 1.2, os.path.join(BUM, 'bumper_start.mp4'), 0, {}),
    ('hook_a', .9, up('e6a55773'), 18.7, {'vf': FULL, 'sharp': True, 'white_in': .25, 'caps': [cap('c_hook', .1, .9)]}),
    ('hook_b', 1.5, up('IMG_7037'), 1.0, {'vf': FULL, 'caps': [cap('c_hook', 0, 1.5)], 'cap_static': True}),
    ('beach', 2.4, os.path.join(CAP, 'raw_lobby_beach.mp4'), 1.2, {
        'vf': "crop=945:1660:x='80+(1760-80)*t/2.4':y=386", 'caps': [cap('c_beach', .05, 2.4)]}),
    ('join', 3.6, os.path.join(CAP, 'raw_lobby_port.mp4'), 0.6, {'speed': 1.4, 'caps': [cap('c_join', .05, 3.6)]}),
    ('chat', 2.6, os.path.join(CAP, 'raw_lobby_port.mp4'), 6.3, {'caps': [cap('c_chat', .05, 2.6)]}),
    ('ball_a', 2.2, os.path.join(CAP, 'raw_lobby_ball.mp4'), 0.7, {'caps': [cap('c_ball', .05, 2.2)]}),
    ('ball_b', 1.8, os.path.join(CAP, 'raw_lobby_ball.mp4'), 5.0, {'caps': [cap('c_ball', 0, 1.8, )], 'cap_static': True}),
    ('shuffle', 3.6, os.path.join(CAP, 'raw_shuffle.mp4'), 0.4, {'caps': [cap('c_shuffle', .05, 3.6)]}),
    ('panggil', 2.0, os.path.join(CAP, 'raw_shuffle.mp4'), 4.2, {'caps': [cap('c_panggil', .05, 2.0)]}),
    ('call', 4.2, os.path.join(BUM, 'scene_call.mp4'), 0, {'caps': [cap('c_call', .05, 4.2)]}),
    ('grid', 3.6, os.path.join(BUM, 'scene_grid.mp4'), 0, {'caps': [cap('c_pro', .05, 1.3), cap('c_chibi', 1.3, 3.6)]}),
    ('play_1', 1.2, up('e6a55773'), 19.6, {'vf': FULL, 'sharp': True, 'caps': [cap('c_play', .05, 1.2)]}),
    ('play_2', 1.2, up('91f7610b'), 0.4, {'vf': FULL, 'sharp': True, 'caps': [cap('c_play', 0, 1.2)], 'cap_static': True}),
    ('play_3', 1.4, up('bb13c206'), 24.0, {'vf': zoom(.8, .5, .5), 'sharp': True, 'speed': 1.25,
                                            'caps': [cap('c_play', 0, 1.4)], 'cap_static': True}),
    ('play_4', 1.9, up('e6a55773'), 101.0, {'vf': zoom(.6, .78, .55), 'sharp': True}),
    ('play_5', 1.2, up('73141b37'), 29.9, {'vf': zoom(.7, .3, .58), 'sharp': True}),
    ('play_6', 1.3, up('91f7610b'), 88.0, {'vf': FULL, 'sharp': True}),
    ('play_7', 1.2, up('e6a55773'), 27.9, {'vf': FULL, 'sharp': True}),
    ('podium', 9.0, os.path.join(CAP, 'podium_live.mp4'), 0.55, {'caps': [cap('c_podium', .05, 2.2)]}),
    ('kudos', 5.0, os.path.join(CAP, 'raw_kudos.mp4'), 0.05, {'caps': [cap('c_kudos', .05, 5.0)]}),
] + [
    # rekap kilat: 10 potongan 0,5 dtk, caption muncul sekali lalu menempel; ujungnya kilatan putih ke logo
    ('rekap_%d' % (k + 1), .5, src, ss, dict(o, caps=[cap('c_bareng', .05 if k == 0 else 0, .5)], cap_static=k > 0))
    for k, (src, ss, o) in enumerate([
        (up('e6a55773'), 101.7, {'vf': zoom(.6, .78, .55), 'sharp': True}),
        (os.path.join(BUM, 'scene_grid.mp4'), 2.2, {}),
        (up('IMG_7037'), 2.0, {'vf': FULL}),
        (os.path.join(CAP, 'podium_live.mp4'), 4.0, {}),
        (os.path.join(CAP, 'raw_lobby_beach.mp4'), 3.0, {'vf': 'crop=945:1660:x=900:y=386'}),
        (os.path.join(BUM, 'scene_call.mp4'), 2.9, {}),
        (os.path.join(CAP, 'raw_shuffle.mp4'), 1.0, {}),
        (os.path.join(CAP, 'raw_lobby_ball.mp4'), 6.0, {}),
        (up('e6a55773'), 19.0, {'vf': FULL, 'sharp': True}),
        (os.path.join(CAP, 'podium_live.mp4'), 7.0, {'white_out': .2}),
    ])
] + [
    ('logo_out', 2.0, os.path.join(BUM, 'bumper_end.mp4'), 0, {}),
]


def frames(sec):
    return int(round(sec * FPS))


def render(i, seg):
    sid, dur, src, ss, o = seg
    n = frames(dur)
    out = os.path.join(SEG, '%02d_%s.mp4' % (i, sid))
    args = ['ffmpeg', '-v', 'error', '-y']
    if o.get('still'):
        args += ['-loop', '1', '-framerate', str(FPS), '-t', '%.3f' % (dur + 1), '-i', src]
    else:
        args += ['-ss', '%.3f' % ss, '-i', src]
    caps = o.get('caps', [])
    for c in caps:
        args += ['-loop', '1', '-framerate', str(FPS), '-t', '%.3f' % (dur + 1), '-i', c[0]]
    speed = o.get('speed', 1)
    chain = ['setpts=(PTS-STARTPTS)/%s' % speed, 'fps=%d' % FPS]
    if o.get('vf'):
        chain.append(o['vf'])
    chain += ['scale=%d:%d:flags=lanczos' % (OUT_W, OUT_H), 'setsar=1', 'format=yuv420p']
    if o.get('sharp'):                       # footage 576p/464p diperbesar ke 1080p: pertajam sedikit
        chain.append('unsharp=5:5:0.7:5:5:0')
    if o.get('white_in'):
        chain.append('fade=in:st=0:d=%s:color=white' % o['white_in'])
    if o.get('white_out'):
        chain.append('fade=out:st=%.3f:d=%s:color=white' % (dur - o['white_out'], o['white_out']))
    graph = ['[0:v]' + ','.join(chain) + '[v0]']
    last = 'v0'
    for k, (_, t0, t1) in enumerate(caps):
        # caption muncul: fade + naik 24px dalam 0,15 dtk (kecuali lanjutan dari shot sebelumnya)
        if o.get('cap_static'):
            graph.append('[%d:v]format=rgba[c%d]' % (k + 1, k))
            y = '0'
        else:
            graph.append('[%d:v]format=rgba,fade=in:st=%.3f:d=0.15:alpha=1[c%d]' % (k + 1, t0, k))
            y = "'24*(1-min(1,max(0,(t-%.3f)/0.15)))'" % t0
        graph.append("[%s][c%d]overlay=0:%s:enable='between(t,%.3f,%.3f)':format=auto[v%d]" % (last, k, y, t0, t1, k + 1))
        last = 'v%d' % (k + 1)
    graph.append('[%s]trim=end_frame=%d,setpts=PTS-STARTPTS[o]' % (last, n))
    args += ['-filter_complex', ';'.join(graph), '-map', '[o]', '-frames:v', str(n), '-r', str(FPS),
             '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-pix_fmt', 'yuv420p', out]
    subprocess.run(args, check=True)
    got = subprocess.run(['ffprobe', '-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries',
                          'stream=nb_read_frames', '-of', 'csv=p=0', out], capture_output=True, text=True).stdout.strip()
    if int(got) != n:
        raise SystemExit('%s: %s frame, seharusnya %d' % (sid, got, n))
    return out


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'paddoc_reel.mp4')
    os.makedirs(SEG, exist_ok=True)
    total = sum(frames(s[1]) for s in TIMELINE)
    if total != 60 * FPS:
        raise SystemExit('total %d frame, seharusnya %d' % (total, 60 * FPS))
    parts = [render(i, s) for i, s in enumerate(TIMELINE)]
    lst = os.path.join(SEG, 'list.txt')
    with open(lst, 'w') as f:
        f.writelines("file '%s'\n" % p for p in parts)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst,
                    '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-shortest',
                    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
                    '-r', str(FPS), '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out], check=True)
    print(out, total, 'frame')


if __name__ == '__main__':
    main()
