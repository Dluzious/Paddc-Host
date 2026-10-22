// Mode demo aplikasi (file://, data lokal di browser) dengan pemain dummy diganti nama & foto asli. Tidak menulis ke server.
const fs = require('fs');
const MAP = { Andi: 'Dani', Bima: 'Max', Raka: 'Aria', Dimas: 'Faritsi', Fajar: 'Toha', Yoga: 'Farid', Hendra: 'Omdok', Rizky: 'Herry',
  Sari: 'Sisil', Nadia: 'Nina', Ayu: 'Dianty', Laras: 'Wuluh', Dewi: 'Nandya', Intan: 'Yeni Nila', Rudi: 'Aziz', 'Admin Paddoc': 'Euis' };
function live() {
  const d = JSON.parse(fs.readFileSync(__dirname + '/../poll.json', 'utf8'));
  const r = (d.data || d).result || d.data || d, by = {};
  r.people.forEach(p => { by[p.name] = { photo: p.photoUrl, chibi: p.chibiUrl || p.chibiFull }; });
  return by;
}
async function openDemoApp(p, tick) {
  await p.goto('file://' + require('path').resolve(__dirname, '../../index.html'));
  await tick(3000);
  await p.evaluate(([MAP, LIVE]) => {
    const st = JSON.parse(localStorage.getItem('paddoc_demo_v2'));
    st.people.forEach(x => {
      const real = MAP[x.name]; if (!real) return;
      x.name = real; const L = LIVE[real] || {};
      if (L.photo) { st.photos['rp_' + x.id] = L.photo; x.proId = 'rp_' + x.id; }
      if (L.chibi) { st.photos['rc_' + x.id] = L.chibi; x.spriteId = 'rc_' + x.id; }
    });
    Object.values(st.sessions).forEach(s => { s.name = 'Paddoc Membara 🔥'; });
    localStorage.setItem('paddoc_demo_v2', JSON.stringify(st));
  }, [MAP, live()]);
  await p.reload(); await tick(2500);
}
async function login(p, tick, user) {
  await p.evaluate(() => document.querySelector('[data-act="login"]').click()); await tick(600);
  await p.fill('#li-user', user); await p.fill('#li-pin', '123456');
  await p.evaluate(() => document.querySelector('#li-pin').closest('form').requestSubmit()); await tick(2500);
}
module.exports = { openDemoApp, login };
