// Home = halaman pembuka semua yang login; item Home paling atas di menu
const L = require('../lib');
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const B = 'http://127.0.0.1:8789', OUT = L.out('10-home');
const api = async (fn, req) => { const r = await fetch(B + '/api', { method: 'POST', body: JSON.stringify({ fn, req }) }); const j = await r.json(); if (!j.ok) throw new Error(fn + ': ' + j.error); return j.data; };
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ GAGAL: ') + m); if (!c) process.exitCode = 1; };
const step = (t) => console.log('•', t);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const asli = 'data:image/jpeg;base64,' + fs.readFileSync(L.fixture('asli.jpg')).toString('base64');
(async () => {
  const adm = await api('createAdmin', { code: '2468', name: 'Lulu Admin', gender: 'P', username: 'lulu', pin: '9876' }), token = adm.token;
  const host = await api('savePerson', { token, person: { name: 'Rudi Hartono', gender: 'L', role: 'host' }, photoData: asli });
  const names = ['Andi', 'Budi', 'Citra', 'Dewi', 'Eko', 'Fajar'], pl = [];
  for (let i = 0; i < names.length; i++) pl.push(await api('savePerson', { token, person: { name: names[i], gender: i % 2 ? 'P' : 'L' }, photoData: asli }));
  const login = (u, pin) => api('login', { username: u, pin: pin || '123456', token: '' });
  // sesi lama yang sudah selesai (masuk "Sesi sebelumnya")
  const old = await api('createSession', { token, setup: { name: 'Paddoc Selasa Lalu', format: 'americano', courts: [{ name: 'Court 1' }], playerIds: pl.slice(0, 4).map((x) => x.id) } });
  await api('act', { token, sid: old.sid, type: 'end', payload: {} });
  // rencana berikutnya (lobi)
  const plan = await api('createSession', { token, setup: { name: 'Paddoc Jumat Malam', format: 'americano', courts: [{ name: 'Court 1' }], playerIds: pl.map((x) => x.id),
    plan: { when: Date.now() + 3 * 3600e3, whenText: 'Jumat · 19.30 WIB', venue: { name: 'Padel Doc Arena' }, theme: 'court' } } });
  const andi = await login(pl[0].username), rudi = await login(host.username);
  const b = await chromium.launch(), errs = [];
  const watch = (p, tag) => { p.on('pageerror', (e) => errs.push(tag + ': ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|navigator\.vibrate/.test(m.text())) errs.push(tag + ' console: ' + m.text()); }); };
  const open = async (vp, auth, tag) => {
    const ctx = await L.ctx(b, { viewport: vp, deviceScaleFactor: 2 }); const pg = await ctx.newPage(); watch(pg, tag);
    await pg.goto(B + '/'); if (auth) await pg.evaluate((a) => localStorage.setItem('paddoc_auth', JSON.stringify(a)), auth);
    await pg.goto(B + '/'); await pg.addStyleTag({ content: '#turn-alert{display:none!important}' }); return pg;
  };
  const menuItems = (pg) => pg.$$eval('.menu-li b', (e) => e.map((x) => x.textContent.trim()));

  step('admin: Home saat membuka app');
  const ha = await open({ width: 1180, height: 820 }, adm, 'admin');
  await ha.waitForSelector('.v-home .hero', { timeout: 15000 });
  const at = await ha.textContent('.home');
  ok(await ha.isVisible('[data-act="newSession"]') && await ha.isVisible('.hero [data-act="playersView"]'), 'admin: Home dengan Buat rencana sesi & Database pemain');
  ok(/Sesi berikutnya/.test(at) && /Paddoc Jumat Malam/.test(at) && /Sesi sebelumnya/.test(at) && /Paddoc Selasa Lalu/.test(at), 'admin: sesi berikutnya & sesi sebelumnya tampil');
  await ha.click('[data-act="menu"]'); await ha.waitForSelector('.menu-li');
  let mi = await menuItems(ha);
  ok(mi[0] === 'Home' && mi[1] === 'Profil saya', 'admin: menu dimulai Home, lalu Profil saya (' + mi.slice(0, 3).join(' · ') + ')');
  ok(!mi.includes('Sesi & mulai baru'), 'item lama "Sesi & mulai baru" diganti Home');
  await ha.screenshot({ path: OUT + '/01-admin-menu.png' });
  await ha.click('.menu-li[data-mi="dash"]'); await ha.waitForSelector('.v-dash');
  await ha.click('[data-act="menu"]'); await ha.waitForSelector('.menu-li'); await ha.click('.menu-li[data-mi="home"]');
  await ha.waitForSelector('.v-home .hero', { timeout: 8000 });
  ok(true, 'admin: Dashboard → Menu → Home kembali ke Home');

  step('pemain: Home saat membuka app');
  const hp = await open({ width: 390, height: 844 }, andi, 'hp-andi');
  await hp.waitForSelector('.v-home .hero', { timeout: 15000 });
  await hp.waitForSelector('.home .past-card', { timeout: 8000 }).catch(() => {});
  const pt = await hp.textContent('.home');
  ok(/Halo, Andi/.test(pt) && !(await hp.$('.home [data-act="newSession"]')) && !(await hp.$('.home .hero [data-act="playersView"]')), 'pemain: Home tanpa tombol admin, sapaan "Halo, Andi"');
  ok(/Paddoc Jumat Malam/.test(pt) && await hp.isVisible('.home [data-act="openLobby"]'), 'pemain: sesi berikutnya dengan tombol Buka lobi');
  ok(/Belum ada sesi berjalan/.test(pt), 'pemain: belum ada sesi berjalan');
  ok(/Paddoc Selasa Lalu/.test(pt) && /Kamu ikut/.test(pt), 'pemain: sesi sebelumnya (yang ia ikuti ditandai)');
  await hp.screenshot({ path: OUT + '/02-hp-home.png', fullPage: true });
  await hp.click('[data-act="menu"]'); await hp.waitForSelector('.menu-li');
  mi = await menuItems(hp);
  ok(mi[0] === 'Home' && mi[1] === 'Profil saya', 'pemain: menu dimulai Home, lalu Profil saya (' + mi.slice(0, 3).join(' · ') + ')');
  await hp.screenshot({ path: OUT + '/03-hp-menu.png' });
  await hp.click('.menu-li[data-mi="profile"]'); await hp.waitForSelector('.v-profile');
  await hp.click('[data-act="menu"]'); await hp.waitForSelector('.menu-li'); await hp.click('.menu-li[data-mi="home"]');
  await hp.waitForSelector('.v-home .hero', { timeout: 8000 });
  ok(true, 'pemain: Profil → Menu → Home kembali ke Home');
  await hp.click('.home .past-card'); await hp.waitForSelector('.v-past', { timeout: 8000 });
  ok(/Paddoc Selasa Lalu/.test(await hp.textContent('.v-past')), 'pemain: ketuk sesi sebelumnya di Home → ringkasan sesi itu');
  await hp.click('[data-act="menu"]'); await hp.waitForSelector('.menu-li'); await hp.click('.menu-li[data-mi="home"]'); await hp.waitForSelector('.v-home .hero');

  step('sesi dimulai');
  await api('act', { token, sid: plan.sid, type: 'startPlan', payload: {} });
  await hp.waitForSelector('.home .sess.active', { timeout: 10000 });
  ok(await hp.isVisible('.hero [data-act="dash"]') && /kamu ikut main/.test(await hp.textContent('.home .sess.active')), 'Home pemain berubah sendiri: kartu sesi berjalan + tombol Buka dashboard court');
  await hp.click('.home .sess.active'); await hp.waitForSelector('.v-dash .mystatus', { timeout: 8000 });
  ok(true, 'ketuk kartu sesi berjalan → dashboard court (status pemain)');
  const hp2 = await open({ width: 390, height: 844 }, andi, 'hp-andi-2');
  await hp2.waitForSelector('.v-home .hero', { timeout: 15000 });
  ok(true, 'membuka app lagi saat sesi berjalan tetap mendarat di Home');
  await hp2.click('.hero [data-act="dash"]'); await hp2.waitForSelector('.v-dash .mystatus', { timeout: 8000 });
  ok(true, 'tombol Buka dashboard court → dashboard');

  step('iPad papan court');
  const ib = await open({ width: 1180, height: 820 }, adm, 'ipad-papan');
  await ib.evaluate(() => localStorage.setItem('paddoc_boardpref', 'true')); await ib.goto(B + '/');
  await ib.waitForSelector('.court', { timeout: 15000 });
  ok(!(await ib.$('.v-home')), 'iPad yang dipilih sebagai papan court: saat sesi berjalan langsung ke papan court');
  const ia = await open({ width: 1180, height: 820 }, adm, 'ipad-biasa');
  await ia.waitForSelector('.v-home .hero', { timeout: 15000 });
  ok(true, 'admin di perangkat lain (belum memilih papan court): tetap ke Home');

  step('host & penonton & login');
  const hh = await open({ width: 390, height: 844 }, rudi, 'hp-host');
  await hh.waitForSelector('.v-home .hero', { timeout: 15000 });
  ok(await hh.isVisible('[data-act="newSession"]') && /Paddoc Jumat Malam/.test(await hh.textContent('.home .sess-list')), 'host: Home dengan sesi berjalan di daftar');
  const pub = await open({ width: 390, height: 844 }, null, 'publik');
  await pub.waitForSelector('#view', { timeout: 15000 }); await sleep(800);
  ok(!(await pub.$('.v-home')) && !!(await pub.$('.v-dash')), 'penonton tanpa akun tetap ke dashboard publik');
  const lg = await (await L.ctx(b, { viewport: { width: 1180, height: 820 } })).newPage(); watch(lg, 'login');
  await lg.goto(B + '/'); await lg.waitForSelector('[data-act="login"]', { timeout: 15000 }); await lg.click('[data-act="login"]');
  await lg.waitForSelector('#li-user'); await lg.fill('#li-user', pl[1].username); await lg.fill('#li-pin', '123456'); await lg.press('#li-pin', 'Enter');
  await lg.waitForSelector('.v-home .hero', { timeout: 15000 });
  ok(/Halo, Budi/.test(await lg.textContent('.home')), 'masuk lewat form → langsung ke Home');

  ok(!errs.length, 'tanpa error JS' + (errs.length ? ': ' + errs.slice(0, 5).join(' | ') : ''));
  await b.close(); process.exit();
})().catch((e) => { console.error(e); process.exit(1); });
