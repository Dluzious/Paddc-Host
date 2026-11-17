// Uji v2.16: siaran hemat data (match lama cukup id-nya, ketukan beruntun digabung), HP tetap benar, aplikasi tetap terbuka saat jaringan putus
const L = require('../lib');
const { chromium } = require('playwright');
const B = 'http://127.0.0.1:8789', OUT = L.out('16-hemat-data');
const api = async (fn, req) => { const r = await fetch(B + '/api', { method: 'POST', body: JSON.stringify({ fn, req }) }); const j = await r.json(); if (!j.ok) throw new Error(fn + ': ' + j.error); return j.data; };
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ GAGAL: ') + m); if (!c) process.exitCode = 1; };
const step = (t) => console.log('•', t);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const adm = await api('createAdmin', { code: '2468', name: 'Lulu Admin', gender: 'P', username: 'lulu', pin: '9876' }), token = adm.token;
  const pl = []; for (let i = 0; i < 24; i++) pl.push(await api('savePerson', { token, person: { name: 'Pemain ' + (i + 1), gender: i % 2 ? 'P' : 'L' } }));
  const r = await api('createSession', { token, setup: { name: 'Malam Ramai', format: 'americano', teamMode: 'random', courts: [1, 2, 3, 4].map((i) => ({ name: 'Court ' + i, color: 'blue' })),
    playerIds: pl.map((p) => p.id), scoring: { type: 'points', mode: 'total', n: 21 }, rules: { drawMode: 'rolling' } } });
  const sid = r.sid, act = (type, payload) => api('act', { token, sid, type, payload });
  const live = async () => (await api('poll', { token })).S.matches.filter((m) => m.status === 'live');
  const playOne = async () => { const m = (await live())[0]; await act('go', { m: m.id }); await act('score', { m: m.id, a: 12, b: 9 }); return m; };
  for (let i = 0; i < 40; i++) await playOne();

  const b = await chromium.launch(), errs = [];
  const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' };
  const c = await L.ctx(b, PHONE); await c.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { get: () => true }); });
  const pg = await c.newPage(); pg.on('pageerror', (e) => errs.push(e.message));
  const frames = []; let apiN = 0;
  pg.on('websocket', (ws) => { if (/\/ws$/.test(ws.url())) ws.on('framereceived', (f) => { const t = String(f.payload); if (t[0] === '{') frames.push(t); }); });
  pg.on('request', (q) => { if (q.url().endsWith('/api')) apiN++; });
  await pg.goto(B + '/'); await pg.evaluate((a) => localStorage.setItem('paddoc_auth', JSON.stringify(a)), await api('login', { username: pl[0].username, pin: '123456' }));
  await pg.reload();
  await pg.waitForSelector('.v-home, .v-dash', { timeout: 15000 });
  if (await pg.$('[data-act="skipNotif"]')) await pg.click('[data-act="skipNotif"]');
  await pg.evaluate(() => { const a = document.querySelector('#turn-alert'); if (a) a.remove(); });
  const dash = await pg.$('[data-act="dash"]'); if (dash) await dash.click({ force: true });
  await pg.waitForSelector('.srow[data-id]', { timeout: 10000 });
  await sleep(1500);

  step('ketukan poin beruntun (Hitung skor) dari host');
  const m = (await live())[0]; await act('go', { m: m.id });
  await sleep(800);
  frames.length = 0; apiN = 0;
  for (let i = 0; i < 12; i++) await act('tally', { m: m.id, side: i % 3 ? 'A' : 'B' });
  await sleep(1500);
  const sizes = frames.map((f) => f.length);
  ok(frames.length >= 1 && frames.length <= 8, '12 ketukan → ' + frames.length + ' kiriman ke HP (digabung, paling sering 1 per 300 ms)');
  ok(Math.max(...sizes) < 12000, 'ukuran kiriman maks ' + (Math.max(...sizes) / 1024).toFixed(1) + ' KB (sebelumnya ±25 KB untuk 40 match)');
  const last = JSON.parse(frames[frames.length - 1]).data;
  ok(!last.people && last.S && last.S.mSig && last.S.matches.filter((x) => x.z).length >= 30, 'kiriman tanpa daftar orang; ' + last.S.matches.filter((x) => x.z).length + ' match lama hanya id-nya');
  ok(apiN === 0, 'HP mengisi ulang match lama sendiri, tanpa unduhan ulang (request /api: ' + apiN + ')');

  step('match selesai: klasemen di HP ikut berubah');
  const winner = m.A[0];
  const rowBefore = await pg.textContent('.srow[data-id="' + winner + '"]');
  frames.length = 0; apiN = 0;
  await act('score', { m: m.id, a: 15, b: 6 });
  await pg.waitForFunction((args) => { const el = document.querySelector('.srow[data-id="' + args.id + '"]'); return el && el.textContent !== args.before; }, { id: winner, before: rowBefore }, { timeout: 8000 });
  ok(true, 'baris klasemen pemenang berubah di HP setelah skor masuk');
  ok(apiN === 0, 'tanpa unduhan ulang data lengkap (request /api: ' + apiN + ')');

  step('skor lama dikoreksi → HP mengambil data lengkap sekali');
  const S0 = (await api('poll', { token })).S, old = S0.matches.find((x) => x.status === 'done');
  apiN = 0;
  await act('score', { m: old.id, a: 4, b: 21 });
  await sleep(2500);
  ok(apiN >= 1 && apiN <= 3, 'sidik match lama berubah → poll lengkap (' + apiN + ' request)');
  const loc = await pg.evaluate(() => document.querySelectorAll('.srow[data-id]').length);
  ok(loc >= 20, 'klasemen tetap tampil lengkap (' + loc + ' pemain)');
  await pg.screenshot({ path: OUT + '/01-hp-dash.png' });

  step('jaringan putus: aplikasi tetap terbuka dari simpanan HP');
  await pg.evaluate(() => navigator.serviceWorker.ready);
  await pg.reload(); await pg.waitForSelector('#view', { timeout: 15000 });
  await sleep(1500);
  ok(await pg.evaluate(() => caches.keys().then((k) => k.some((x) => /^paddoc-shell-/.test(x)))), 'file aplikasi tersimpan di HP');

  step('foto pemain: diunduh sekali, berikutnya dari simpanan HP');
  await api('savePerson', { token, person: { id: pl[0].id, name: pl[0].name, gender: 'L' }, photoData: 'data:image/jpeg;base64,' + require('fs').readFileSync(L.fixture('asli.jpg')).toString('base64') });
  await sleep(1500); await pg.reload(); await pg.waitForSelector('#view', { timeout: 15000 }); await sleep(2000);
  const net = [], sw = [];
  pg.on('response', (res) => { if (/\/photo\/ph_/.test(res.url())) (res.fromServiceWorker() ? sw : net).push(res.url()); });
  const hasPhoto = await pg.evaluate(() => document.querySelectorAll('img[src*="/photo/ph_"]').length);
  await pg.reload(); await pg.waitForSelector('#view', { timeout: 15000 }); await sleep(2500);
  ok(hasPhoto > 0 && sw.length > 0, 'foto tampil (' + hasPhoto + ' gambar) dan dibuka ulang dari simpanan HP (' + sw.length + ')');
  ok(net.length === 0, 'tanpa unduh ulang foto dari server (' + net.length + ')');
  ok(await pg.evaluate(() => caches.keys().then((k) => k.includes('paddoc-photo-1'))), 'simpanan foto terpisah dari file aplikasi');
  // server dimatikan sungguhan (run.sh menyalakannya lagi untuk uji berikutnya)
  require('child_process').execSync('for p in $(ps -eo pid,args | grep -E "[w]orkerd serve|[w]rangler[^ ]* dev --port 8789" | awk \'{print $1}\'); do kill $p; done; sleep 2');
  const down = await fetch(B + '/').then(() => false, () => true);
  ok(down, 'server uji sudah mati');
  const t0 = Date.now();
  await pg.reload().catch(() => {});
  await pg.waitForSelector('#app', { timeout: 15000 });
  await sleep(1500);
  const txt = await pg.evaluate(() => document.body.innerText);
  ok(!/Tidak bisa terhubung ke Paddoc Host/.test(txt) && !!(await pg.$('#app')), 'server tidak terjangkau: aplikasi tetap terbuka dari simpanan HP (' + ((Date.now() - t0) / 1000).toFixed(1) + ' dtk)');
  await pg.screenshot({ path: OUT + '/02-server-mati.png' });

  ok(errs.length === 0, 'tanpa error JS' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
