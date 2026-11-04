// Uji v2.15: PIN 123456 tidak wajib diganti; Home mengingatkan bahwa PIN bisa diganti di Profil
const L = require('../lib');
const { chromium } = require('playwright');
const B = 'http://127.0.0.1:8789', OUT = L.out('15-pengingat-pin');
const api = async (fn, req) => { const r = await fetch(B + '/api', { method: 'POST', body: JSON.stringify({ fn, req }) }); const j = await r.json(); if (!j.ok) throw new Error(fn + ': ' + j.error); return j.data; };
const apiErr = async (fn, req) => { const r = await fetch(B + '/api', { method: 'POST', body: JSON.stringify({ fn, req }) }); const j = await r.json(); return j.ok ? null : j.error; };
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ GAGAL: ') + m); if (!c) process.exitCode = 1; };
const step = (t) => console.log('•', t);
(async () => {
  const adm = await api('createAdmin', { code: '2468', name: 'Lulu Admin', gender: 'P', username: 'lulu', pin: '9876' }), token = adm.token;
  const andi = await api('savePerson', { token, person: { name: 'Andi', gender: 'L' } });
  await api('createSession', { token, setup: { name: 'Rabu Malam', format: 'americano', teamMode: 'random', courts: [{ name: 'Court 1' }], playerIds: [],
    plan: { when: Date.now() + 26 * 3600e3, whenText: 'Besok', venue: { name: 'Padel Doc Arena' }, theme: 'court' } } });

  step('server: aturan PIN baru saat diganti sendiri');
  const t0 = (await api('login', { username: andi.username, pin: '123456' })).token;
  ok(/123456/.test(await apiErr('changePin', { token: t0, old: '123456', pin: '123456' }) || ''), 'PIN baru 123456 ditolak');
  ok(/4–8/.test(await apiErr('changePin', { token: t0, old: '123456', pin: '12' }) || ''), 'PIN baru 2 angka ditolak');

  const b = await chromium.launch(), errs = [];
  const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' };
  const c = await L.ctx(b, PHONE, true); await c.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { get: () => true }); });
  const pg = await c.newPage(); pg.on('pageerror', (e) => errs.push(e.message));

  step('pemain login dengan PIN 123456: tidak dipaksa ganti');
  await pg.goto(B + '/');
  await pg.waitForSelector('#loginf, [data-act="login"], [data-act="skipNotif"]', { timeout: 15000 });
  if (await pg.$('[data-act="skipNotif"]')) await pg.click('[data-act="skipNotif"]');
  if (!(await pg.$('#loginf'))) { await pg.click('[data-act="login"] >> nth=0'); await pg.waitForSelector('#loginf'); }
  await pg.fill('#li-user', andi.username); await pg.fill('#li-pin', '123456'); await pg.click('#loginf button[type=submit]');
  await pg.waitForSelector('.v-home', { timeout: 10000 });
  ok(true, 'langsung masuk ke Home (tanpa halaman wajib ganti PIN)');
  await pg.waitForSelector('.pin-remind', { timeout: 5000 });
  const t = await pg.textContent('.pin-remind');
  ok(/PIN kamu masih 123456/.test(t) && /Profil saya/.test(t), 'Home: pengingat "PIN masih 123456, bisa diganti di Menu → Profil saya"');
  await pg.screenshot({ path: OUT + '/01-home-pengingat.png' });
  const lobbyOk = await pg.$('.plan-card'); ok(!!lobbyOk, 'kartu sesi berikutnya tetap tampil di bawah pengingat');

  step('Ganti PIN sekarang → Profil');
  await pg.click('[data-act="pinChange"]'); await pg.waitForSelector('#pinf', { timeout: 8000 });
  ok(await pg.isVisible('#pin-old'), 'tombol membuka Profil, bagian Ganti PIN');
  await pg.click('[data-act="menu"]'); await pg.waitForSelector('.menu-li'); await pg.click('.menu-li[data-mi="home"]'); await pg.waitForSelector('.v-home');

  step('Nanti saja → disembunyikan 7 hari');
  await pg.click('[data-act="pinLater"]'); await pg.waitForTimeout(400);
  ok(!(await pg.$('.pin-remind')), 'pengingat hilang setelah "Nanti saja"');
  await pg.reload(); await pg.waitForSelector('.v-home', { timeout: 10000 });
  ok(!(await pg.$('.pin-remind')), 'dibuka lagi: pengingat tetap tersembunyi');
  await pg.evaluate(() => localStorage.setItem('paddoc_pin_later', JSON.stringify(Date.now() - 8 * 864e5)));
  await pg.reload(); await pg.waitForSelector('.v-home', { timeout: 10000 });
  ok(!!(await pg.$('.pin-remind')), 'setelah 7 hari: pengingat muncul lagi');

  step('PIN diganti di Profil → pengingat hilang');
  await pg.click('[data-act="pinChange"]'); await pg.waitForSelector('#pinf');
  await pg.fill('#pin-old', '123456'); await pg.fill('#pin-new', '4321'); await pg.click('#pinf button[type=submit]');
  await pg.waitForFunction(() => !document.querySelector('.profile .demo-note'), null, { timeout: 8000 });
  await pg.click('[data-act="menu"]'); await pg.waitForSelector('.menu-li'); await pg.click('.menu-li[data-mi="home"]'); await pg.waitForSelector('.v-home');
  ok(!(await pg.$('.pin-remind')), 'PIN sudah diganti: tidak ada pengingat di Home');
  ok(!!(await api('login', { username: andi.username, pin: '4321' })).token, 'login dengan PIN baru berhasil');

  step('admin (PIN sendiri) tidak melihat pengingat');
  const ac = await L.ctx(b, { viewport: { width: 1180, height: 820 } }, true); const ap = await ac.newPage(); ap.on('pageerror', (e) => errs.push(e.message));
  await ap.goto(B + '/'); await ap.evaluate((a) => localStorage.setItem('paddoc_auth', JSON.stringify(a)), await api('login', { username: 'lulu', pin: '9876' }));
  await ap.reload(); await ap.waitForSelector('.v-home, .v-board', { timeout: 10000 });
  ok(!(await ap.$('.pin-remind')), 'admin: tanpa pengingat');

  ok(errs.length === 0, 'tanpa error JS' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
