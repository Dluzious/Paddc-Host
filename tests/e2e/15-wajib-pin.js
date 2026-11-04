// Uji v2.15: akun dengan PIN 123456 wajib membuat PIN sendiri sebelum memakai aplikasi
const L = require('../lib');
const { chromium } = require('playwright');
const B = 'http://127.0.0.1:8789', OUT = L.out('15-wajib-pin');
const api = async (fn, req) => { const r = await fetch(B + '/api', { method: 'POST', body: JSON.stringify({ fn, req }) }); const j = await r.json(); if (!j.ok) throw new Error(fn + ': ' + j.error); return j.data; };
const apiErr = async (fn, req) => { const r = await fetch(B + '/api', { method: 'POST', body: JSON.stringify({ fn, req }) }); const j = await r.json(); return j.ok ? null : j.error; };
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ GAGAL: ') + m); if (!c) process.exitCode = 1; };
const step = (t) => console.log('•', t);
(async () => {
  const adm = await api('createAdmin', { code: '2468', name: 'Lulu Admin', gender: 'P', username: 'lulu', pin: '9876' }), token = adm.token;
  const andi = await api('savePerson', { token, person: { name: 'Andi', gender: 'L' } });
  const host = await api('savePerson', { token, person: { name: 'Rudi Host', gender: 'L', role: 'host' } });
  await api('createSession', { token, setup: { name: 'Rabu Malam', format: 'americano', teamMode: 'random', courts: [{ name: 'Court 1' }], playerIds: [],
    plan: { when: Date.now() + 26 * 3600e3, whenText: 'Besok', venue: { name: 'Padel Doc Arena' }, theme: 'court' } } });

  step('server: aturan PIN baru');
  const t0 = (await api('login', { username: andi.username, pin: '123456' })).token;
  ok(/123456/.test(await apiErr('changePin', { token: t0, old: '123456', pin: '123456' }) || ''), 'PIN baru 123456 ditolak');
  ok(/4–8/.test(await apiErr('changePin', { token: t0, old: '123456', pin: '12' }) || ''), 'PIN baru 2 angka ditolak');

  const b = await chromium.launch(), errs = [];
  const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' };
  const openAs = async (ctxOpts, auth, url) => {
    const c = await L.ctx(b, ctxOpts, true); await c.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { get: () => true }); });
    const p = await c.newPage(); p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(B + '/'); if (auth) await p.evaluate((a) => localStorage.setItem('paddoc_auth', JSON.stringify(a)), auth);
    await p.goto(B + (url || '/')); return p;
  };

  step('pemain login pertama kali di HP (PIN masih 123456)');
  const pg = await openAs(PHONE, null);
  await pg.waitForSelector('#loginf, [data-act="login"], [data-act="skipNotif"]', { timeout: 15000 });
  if (await pg.$('[data-act="skipNotif"]')) await pg.click('[data-act="skipNotif"]');
  if (!(await pg.$('#loginf'))) { await pg.click('[data-act="login"] >> nth=0'); await pg.waitForSelector('#loginf'); }
  await pg.fill('#li-user', andi.username); await pg.fill('#li-pin', '123456'); await pg.click('#loginf button[type=submit]');
  await pg.waitForSelector('#setpinf', { timeout: 10000 });
  ok(/PIN kamu masih/.test(await pg.textContent('#setpinf')) && !(await pg.$('.topbar')), 'langsung ke halaman Buat PIN, tanpa menu');
  await pg.screenshot({ path: OUT + '/01-buat-pin.png' });
  await pg.fill('#sp-new', '123456'); await pg.fill('#sp-again', '123456'); await pg.click('#setpinf button[type=submit]');
  await pg.waitForTimeout(400);
  ok(!!(await pg.$('#setpinf')), 'PIN 123456 tidak diterima, tetap di halaman Buat PIN');
  await pg.fill('#sp-new', '4321'); await pg.fill('#sp-again', '4322'); await pg.click('#setpinf button[type=submit]');
  await pg.waitForTimeout(400);
  ok(!!(await pg.$('#setpinf')), 'PIN ulang yang tidak sama ditolak');
  await pg.fill('#sp-new', '4321'); await pg.fill('#sp-again', '4321'); await pg.click('#setpinf button[type=submit]');
  await pg.waitForSelector('.v-home', { timeout: 10000 });
  ok(!(await pg.$('#setpinf')), 'setelah PIN disimpan: masuk ke Home');
  ok(!!(await api('login', { username: andi.username, pin: '4321' })).token && !!(await apiErr('login', { username: andi.username, pin: '123456' })), 'PIN baru dipakai, 123456 tidak bisa lagi');
  await pg.reload(); await pg.waitForSelector('.v-home', { timeout: 10000 });
  ok(!(await pg.$('#setpinf')), 'dibuka lagi: tidak diminta PIN lagi');

  step('link lobi juga tertahan sampai PIN dibuat');
  const hauth = await api('login', { username: host.username, pin: '123456' });
  const plans = (await api('poll', { token: hauth.token })).plans || [];
  const hp = await openAs({ viewport: { width: 1180, height: 820 } }, hauth, plans[0] ? '/?lobby=' + plans[0].id : '/');
  await hp.waitForSelector('#setpinf', { timeout: 10000 });
  ok(!(await hp.$('.lb-stage')), 'host dengan PIN 123456: lobi belum tampil, muncul Buat PIN');
  await hp.click('#setpinf [data-act="logout"]');
  await hp.waitForSelector('#loginf, .v-dash, [data-act="login"]', { timeout: 10000 });
  ok(!(await hp.$('#setpinf')), 'tombol Keluar di halaman Buat PIN berfungsi');

  step('PIN direset admin → wajib buat lagi');
  const people = await api('listPeople', { token }), a = people.filter((x) => x.id === andi.id)[0];
  ok(a.pinDefault === false, 'database: PIN Andi sudah bukan bawaan');
  await api('resetPin', { token, id: andi.id });
  const pg2 = await openAs(PHONE, await api('login', { username: andi.username, pin: '123456' }));
  await pg2.waitForSelector('#setpinf', { timeout: 10000 });
  ok(true, 'setelah reset admin, Andi diminta membuat PIN lagi');

  step('admin (PIN sendiri sejak awal) tidak terganggu');
  const ap = await openAs({ viewport: { width: 1180, height: 820 } }, await api('login', { username: 'lulu', pin: '9876' }));
  await ap.waitForSelector('.v-home, .v-board, .v-dash', { timeout: 10000 });
  ok(!(await ap.$('#setpinf')), 'admin langsung ke aplikasi');

  ok(errs.length === 0, 'tanpa error JS' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
