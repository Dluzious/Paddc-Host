// Uji v2.14: lapangan tersimpan, template pembayaran, ubah nama di Profil
const L = require('../lib');
const { chromium } = require('playwright');
const B = 'http://127.0.0.1:8789', OUT = L.out('14-data-tersimpan');
const api = async (fn, req) => { const r = await fetch(B + '/api', { method: 'POST', body: JSON.stringify({ fn, req }) }); const j = await r.json(); if (!j.ok) throw new Error(fn + ': ' + j.error); return j.data; };
const apiErr = async (fn, req) => { const r = await fetch(B + '/api', { method: 'POST', body: JSON.stringify({ fn, req }) }); const j = await r.json(); return j.ok ? null : j.error; };
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ GAGAL: ') + m); if (!c) process.exitCode = 1; };
const step = (t) => console.log('•', t);
(async () => {
  const adm = await api('createAdmin', { code: '2468', name: 'Lulu Admin', gender: 'P', username: 'lulu', pin: '9876' }), token = adm.token;
  const mk = (name, g, role) => api('savePerson', { token, person: { name, gender: g, role } });
  const host = await mk('Rudi Host', 'L', 'host'), host2 = await mk('Sari Kasir', 'P', 'host');
  const andi = await mk('Andi', 'L', 'user');
  const login = (u, pin) => api('login', { username: u, pin: pin || '123456', token: '' });
  const tmr = Date.now() + 26 * 3600e3;

  step('server: data tersimpan otomatis');
  const r1 = await api('createSession', { token, setup: { name: 'Rencana A', format: 'americano', teamMode: 'random', courts: [{ name: 'Court Kaca', color: 'green', gender: 'mix' }, { name: 'Court Taman', color: 'orange', gender: 'P' }, { name: 'Court 3', color: 'black', gender: 'mix' }],
    playerIds: [], plan: { when: tmr, whenText: 'Besok', venue: { name: 'Padel Doc Arena', address: 'Jl. Sutisna Senjaya, Tasikmalaya', maps: 'https://maps.app.goo.gl/abc', lat: -7.3, lng: 108.2 }, theme: 'court' },
    pay: { amount: 85000, collector: host.id, bank: { bank: 'BCA', holder: 'Rudi Hartono', number: '1234 5678 90' } } } });
  let T = await api('savedTemplates', { token });
  ok(T.venues.length === 1 && T.venues[0].name === 'Padel Doc Arena' && T.venues[0].courts.length === 3 && T.venues[0].courts[1].name === 'Court Taman', 'lapangan tersimpan dengan alamat & 3 court');
  ok(T.pays.length === 1 && T.pays[0].collector === host.id && T.pays[0].bank.bank === 'BCA' && T.pays[0].amount === 85000, 'template pembayaran tersimpan (collector, rekening, biaya)');
  const pi = await api('payInfo', { token, sid: r1.sid });
  ok(pi.collector === host.id && pi.bank && pi.bank.number === '1234 5678 90' && pi.amount === 85000, 'sesi baru langsung punya collector + rekening + biaya');
  // template kedua lewat payCollector + payBank
  await api('act', { token, sid: r1.sid, type: 'payCollector', payload: { pid: host2.id, amount: 90000 } });
  await api('act', { token, sid: r1.sid, type: 'payBank', payload: { bank: 'Mandiri', holder: 'Sari', number: '9988776655' } });
  T = await api('savedTemplates', { token });
  ok(T.pays.length === 2 && T.pays[0].collector === host2.id && T.pays[0].amount === 90000, 'collector & rekening baru tersimpan jadi template kedua (paling atas)');
  const atok = (await login(andi.username)).token;
  ok(/FORBIDDEN|AUTH/.test(await apiErr('savedTemplates', { token: atok }) || ''), 'pemain tidak bisa membaca template (rekening)');

  const b = await chromium.launch(), errs = [];
  const watch = (p, tag) => { p.on('pageerror', (e) => errs.push(tag + ': ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errs.push(tag + ' console: ' + m.text()); }); };
  const as = async (ctxOpts, user, pin, tag) => {
    const c = await L.ctx(b, ctxOpts); await c.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { get: () => true }); });
    const p = await c.newPage(); watch(p, tag);
    await p.goto(B + '/'); await p.evaluate((a) => localStorage.setItem('paddoc_auth', JSON.stringify(a)), await login(user, pin));
    await p.reload(); return p;
  };
  const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' };

  step('admin: Buat rencana sesi → pilih lapangan & template');
  const ha = await as({ viewport: { width: 1180, height: 820 } }, 'lulu', '9876', 'admin');
  await ha.waitForSelector('[data-act="newSession"]', { timeout: 15000 }); await ha.click('[data-act="newSession"] >> nth=0');
  await ha.waitForSelector('#su-vsaved', { timeout: 10000 });
  ok(true, 'pilihan "Lapangan tersimpan" muncul');
  await ha.selectOption('#su-vsaved', T.venues[0].id);
  await ha.waitForFunction(() => document.querySelector('#su-vname').value === 'Padel Doc Arena');
  ok((await ha.inputValue('#su-vaddr')).includes('Sutisna') && (await ha.inputValue('#su-vmaps')) === 'https://maps.app.goo.gl/abc', 'venue, alamat, link Maps terisi');
  const cn = await ha.$$eval('.su-cname', (e) => e.map((x) => x.value));
  ok(cn.join('|') === 'Court Kaca|Court Taman|Court 3', 'susunan court terisi: ' + cn.join(', '));
  const t2 = T.pays.filter((x) => x.collector === host.id)[0];
  await ha.selectOption('#su-ptpl', t2.id);
  await ha.waitForFunction(() => document.querySelector('#su-price').value === '85000');
  ok(/Rudi Host/.test(await ha.textContent('.setup')), 'template pembayaran: biaya 85000 & nama collector tampil');
  await ha.screenshot({ path: OUT + '/01-setup-template.png', fullPage: false });
  await ha.locator('#su-vsaved').scrollIntoViewIfNeeded(); await ha.screenshot({ path: OUT + '/01b-setup-fields.png' });
  await ha.fill('#su-name', 'Rencana B');
  await ha.click('[data-act="suStart"]');
  await ha.waitForSelector('.lb-stage', { timeout: 10000 });
  const sidB = new URL(ha.url()).searchParams.get('lobby');
  const piB = await api('payInfo', { token, sid: sidB });
  ok(piB.collector === host.id && piB.bank && piB.bank.bank === 'BCA' && piB.amount === 85000, 'rencana baru: collector Rudi + rekening BCA + Rp 85.000 langsung terpasang');

  step('panel Pembayaran: template tersimpan → Pakai');
  await ha.goto(B + '/?pay=' + sidB); await ha.waitForSelector('.pay-tpl', { timeout: 10000 });
  const rows = await ha.$$eval('.pay-tpl .li', (e) => e.map((x) => x.textContent));
  ok(rows.length === 2 && rows.some((t) => /Dipakai/.test(t) && /Rudi/.test(t)), 'daftar template, yang aktif bertanda Dipakai');
  await ha.waitForTimeout(600); await ha.screenshot({ path: OUT + '/02-pay-template.png' }); const ph = await L.ctx(b, { viewport: { width: 390, height: 844 } }); const pq = await ph.newPage(); await pq.goto(B + '/'); await pq.evaluate((a) => localStorage.setItem('paddoc_auth', JSON.stringify(a)), await login('lulu', '9876')); await pq.goto(B + '/?pay=' + sidB); await pq.waitForSelector('.pay-tpl'); await pq.waitForTimeout(600); await pq.screenshot({ path: OUT + '/02b-pay-template-hp.png' }); await ph.close();
  await ha.click('[data-ptuse]');
  await ha.waitForFunction(() => /Sari Kasir/.test((document.querySelector('.pay-col') || {}).textContent || ''), null, { timeout: 8000 });
  const piB2 = await api('payInfo', { token, sid: sidB });
  ok(piB2.collector === host2.id && piB2.bank.bank === 'Mandiri' && piB2.amount === 90000, 'Pakai: collector Sari + Mandiri + Rp 90.000');
  await ha.click('[data-ptdel] >> nth=1');
  await ha.waitForFunction(() => document.querySelectorAll('.pay-tpl .li').length === 1, null, { timeout: 8000 });
  ok((await api('savedTemplates', { token })).pays.length === 1, 'hapus template dari daftar');

  step('Ubah rencana: lapangan tersimpan juga ada');
  await ha.keyboard.press('Escape').catch(() => {});
  T = await api('savedTemplates', { token });
  ok(T.venues.length === 1, 'venue yang sama tidak tersimpan dobel');
  await api('act', { token, sid: sidB, type: 'editPlan', payload: { when: tmr, whenText: 'Besok', venue: { name: 'Padel Kota Baru', address: 'Jl. Baru' }, theme: 'court' } });
  T = await api('savedTemplates', { token });
  ok(T.venues.length === 2 && T.venues[0].name === 'Padel Kota Baru', 'venue baru dari Ubah rencana ikut tersimpan');

  step('Profil: pemain & host mengganti nama');
  const hp = await as(PHONE, andi.username, '123456', 'andi');
  await hp.waitForSelector('[data-act="menu"]', { timeout: 15000 });
  await hp.click('[data-act="menu"]'); await hp.waitForSelector('.menu-li'); await hp.click('.menu-li[data-mi="profile"]'); await hp.waitForSelector('#namef');
  ok((await hp.inputValue('#pf-name')) === 'Andi', 'Profil: kolom Nama tampil berisi nama sekarang');
  await hp.fill('#pf-name', '  Andi   Pratama '); await hp.click('#namef button[type=submit]');
  await hp.waitForFunction(() => /Andi Pratama/.test(document.querySelector('.pf-card h1').textContent), null, { timeout: 8000 });
  const ppl = await api('listPeople', { token }), A2 = ppl.filter((x) => x.id === andi.id)[0];
  ok(A2.name === 'Andi Pratama' && A2.username === andi.username, 'nama tersimpan "Andi Pratama", username tetap @' + A2.username);
  await hp.screenshot({ path: OUT + '/03-profil-nama.png' });
  ok(/minimal 2/.test(await apiErr('updateMe', { token: atok, name: ' ' }) || ''), 'nama kosong ditolak');
  const htok = (await login(host.username)).token;
  const h2 = await api('updateMe', { token: htok, name: 'Rudi Hartono' });
  ok(h2.name === 'Rudi Hartono' && h2.role === 'host', 'host juga bisa ganti nama sendiri');
  const hh = await as({ viewport: { width: 1180, height: 820 } }, host.username, '123456', 'host');
  await hh.waitForSelector('[data-act="menu"]', { timeout: 15000 });
  await hh.click('[data-act="menu"]'); await hh.waitForSelector('.menu-li'); await hh.click('.menu-li[data-mi="profile"]'); await hh.waitForSelector('#namef');
  ok((await hh.inputValue('#pf-name')) === 'Rudi Hartono', 'Profil host: kolom nama ada');

  ok(errs.length === 0, 'tanpa error JS' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
