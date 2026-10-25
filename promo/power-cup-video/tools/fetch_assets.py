"""Siapkan folder assets/ dan fonts/ untuk video.
Avatar chibi & foto pro diambil dari data publik Paddoc Host (fn poll); kartu, logo, court dari repo ini.
python3 tools/fetch_assets.py [https://paddoc-host.lulunurulula.workers.dev]"""
import json, os, re, shutil, sys, urllib.request
from io import BytesIO
from PIL import Image

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'https://paddoc-host.lulunurulula.workers.dev').rstrip('/')
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(os.path.dirname(HERE))
A = os.path.join(HERE, 'assets')
for d in ('chibi', 'photo', 'cards'):
    os.makedirs(os.path.join(A, d), exist_ok=True)
os.makedirs(os.path.join(HERE, 'fonts'), exist_ok=True)

def get(url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers={'User-Agent': 'PaddocPromo/1.0', **(headers or {})})
    return urllib.request.urlopen(req, timeout=60).read()

people = json.loads(get(BASE + '/api', json.dumps({'fn': 'poll', 'req': {}}).encode(), {'Content-Type': 'application/json'}))['data']['people']
for p in people:
    if p['archived'] or p['name'] == 'Admin':
        continue
    key = p['name'].replace(' ', '').lower()
    if p['chibiUrl']:
        Image.open(BytesIO(get(p['chibiUrl']))).convert('RGBA').save(os.path.join(A, 'chibi', key + '.png'))
    if p['photoUrl']:
        Image.open(BytesIO(get(p['photoUrl']))).convert('RGB').resize((512, 768)).save(os.path.join(A, 'photo', key + '.jpg'), quality=88)
    print('ok', key)

for f in os.listdir(os.path.join(REPO, 'img', 'cards')):
    shutil.copy(os.path.join(REPO, 'img', 'cards', f), os.path.join(A, 'cards', f))
shutil.copy(os.path.join(REPO, 'icon-512.png'), os.path.join(A, 'logo.png'))
shutil.copy(os.path.join(REPO, 'img', 'lobby', 'court.webp'), os.path.join(A, 'court.webp'))

UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36'}
css = get('https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@900&family=Plus+Jakarta+Sans:wght@700&display=swap', headers=UA).decode()
for sub, block in re.findall(r'/\* ([\w-]+) \*/\s*@font-face \{(.*?)\}', css, re.S):
    if sub != 'latin':
        continue
    fam = re.search(r"font-family: '([^']+)'", block).group(1)
    name = 'bsd.woff2' if fam.startswith('Big') else 'pjs.woff2'
    open(os.path.join(HERE, 'fonts', name), 'wb').write(get(re.search(r'url\((.*?)\)', block).group(1)))
print('aset siap')
