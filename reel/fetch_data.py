"""Ambil data publik aplikasi (nama, foto pro AI, avatar chibi) untuk render reel.

Menulis poll.json, photos/<id>_photo.*, photos/<id>_chibi.*, photos/people.json di folder ini.
Hanya membaca endpoint publik (sama seperti dashboard tanpa login); semua hasil di-.gitignore.
Pakai curl karena Cloudflare menolak user agent bawaan Python.
"""
import json
import os
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.environ.get('PADDOC_URL', 'https://paddoc-host.lulunurulula.workers.dev')
UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/141 Mobile Safari/537.36'


def curl(url, out, data=None):
    args = ['curl', '-sS', '-f', '-A', UA, '-o', out, '-w', '%{content_type}', url]
    if data is not None:
        args[1:1] = ['-X', 'POST', '-H', 'Content-Type: text/plain;charset=utf-8', '--data', data]
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout


def main():
    poll = os.path.join(HERE, 'poll.json')
    curl(APP + '/api', poll, json.dumps({'fn': 'poll', 'req': {'token': ''}}))
    d = json.load(open(poll))
    r = d.get('data', d)
    r = r.get('result', r)
    ph = os.path.join(HERE, 'photos')
    os.makedirs(ph, exist_ok=True)
    people = [p for p in r['people'] if not p.get('archived')]
    for p in people:
        for kind, url in (('photo', p['photoUrl']), ('chibi', p['chibiUrl'] or p['chibiFull'])):
            if not url:
                continue
            tmp = os.path.join(ph, p['id'] + '_' + kind + '.bin')
            ct = curl(url, tmp)
            ext = 'png' if 'png' in ct else 'webp' if 'webp' in ct else 'jpg'
            os.replace(tmp, tmp[:-3] + ext)
    with open(os.path.join(ph, 'people.json'), 'w') as f:
        json.dump([{k: p[k] for k in ('id', 'name', 'role', 'gender', 'hijab')} for p in people], f, indent=1)
    print(len(people), 'orang')


if __name__ == '__main__':
    main()
