const L = require('../lib');
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const B = 'http://127.0.0.1:8789', OUT = L.out('06-pembayaran-cohost');
const api = async (fn, req) => { const r = await fetch(B + '/api', { method: 'POST', body: JSON.stringify({ fn, req }) }); const j = await r.json(); if (!j.ok) throw new Error(fn + ': ' + j.error); return j.data; };
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ GAGAL: ') + m); if (!c) process.exitCode = 1; };
const step = (t) => console.log('•', t);
const ASLI = L.fixture('asli.jpg'), asli = 'data:image/jpeg;base64,' + fs.readFileSync(ASLI).toString('base64');
const HEADOVER = () => { const r = [...document.querySelectorAll('.lb-head .lb-meta > span:not([hidden]), .lb-head h1, .lb-head .lb-kick, .lb-cd, .lb-exit, .lb-logo')].map((e) => e.getBoundingClientRect()).filter((x) => x.width && x.height);
  let n = 0; for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) { const a = r[i], b = r[j]; if (a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1) n++; } return n; };
(async () => {
  const adm = await api('createAdmin', { code: '2468', name: 'Lulu Admin', gender: 'P', username: 'lulu', pin: '9876' }), token = adm.token;
  const host = await api('savePerson', { token, person: { name: 'Rudi Hartono', gender: 'L', role: 'host' }, photoData: asli });
  const names = ['Andi', 'Budi', 'Citra', 'Dewi', 'Eko', 'Fajar', 'Gita', 'Hana'];
  const pl = []; for (let i = 0; i < names.length; i++) pl.push(await api('savePerson', { token, person: { name: names[i], gender: [2, 3, 6, 7].includes(i) ? 'P' : 'L' }, photoData: asli }));
  const loginAs = async (u) => api('login', { username: u, pin: '123456', token: '' });
  const b = await chromium.launch(), errs = [];
  const watch = (p, tag) => { p.on('pageerror', (e) => errs.push(tag + ': ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|navigator\.vibrate/.test(m.text())) errs.push(tag + ' console: ' + m.text()); }); };
  const open = async (vp, auth, tag, url) => {
    const ctx = await L.ctx(b, { viewport: vp, deviceScaleFactor: 2 }); await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: B });
    const pg = await ctx.newPage(); watch(pg, tag);
    await pg.goto(B + '/'); if (auth) await pg.evaluate((a) => localStorage.setItem('paddoc_auth', JSON.stringify(a)), auth);
    await pg.goto(B + (url || '/')); return pg;
  };
  // v2.9.1: yang login mendarat di Home; tes yang butuh dashboard masuk lewat logo
  const toDash = async (pg) => { await pg.waitForSelector('.v-home, .v-dash, .v-board', { timeout: 15000 }); if (await pg.$('.v-home')) { await pg.evaluate(() => document.querySelector('.topbar .brand').click()); await pg.waitForSelector('.v-dash, .v-board', { timeout: 10000 }); } };
  const when = Date.now() + 26 * 3600e3;
  const r = await api('createSession', { token, setup: { name: 'Jumat Seru', format: 'americano', teamMode: 'random', hosts: [host.id], courts: [{ name: 'Court 1', hostId: host.id }, { name: 'Court 2' }],
    playerIds: pl.map((x) => x.id), pay: { amount: 75000 }, scoring: { type: 'points', mode: 'total', n: 21 },
    plan: { when, whenText: 'Sabtu 19.30 WIB', venue: { name: 'Padel Doc Arena', address: 'Jl. Siliwangi No. 12, Tasikmalaya', maps: 'https://maps.app.goo.gl/x' }, theme: 'court' } } });
  const sid = r.sid;

  step('biaya per orang & payment collector di lobi');
  const andi = await loginAs(pl[0].username), citra = await loginAs(pl[2].username), budi = await loginAs(pl[1].username);
  const hp = await open({ width: 390, height: 844 }, andi, 'hp-andi', '/?lobby=' + sid);
  await hp.waitForSelector('.lb-sprite', { timeout: 10000 }); await hp.waitForTimeout(800);
  ok(/Biaya Rp 75\.000 \/ orang/.test(await hp.textContent('.lb-head')), 'header lobi menampilkan biaya per orang');
  ok(await hp.evaluate(HEADOVER) === 0, 'header lobi HP: teks tidak bertumpuk setelah ditambah biaya');
  ok(/Biaya Rp 75\.000/.test(await hp.textContent('.lb-pay')) && /belum ditentukan/.test(await hp.textContent('.lb-pay')), 'kotak pembayaran lobi: biaya + collector belum ditentukan');
  const ha = await open({ width: 1180, height: 820 }, adm, 'admin', '/?lobby=' + sid);
  await ha.waitForSelector('.lb-pay', { timeout: 10000 }); await ha.click('.lb-pay [data-lb="pay"]'); await ha.waitForSelector('#pay-col');
  await ha.selectOption('#pay-col', pl[2].id); await ha.click('#pay-setsave'); await ha.waitForSelector('.pay-col', { timeout: 5000 });
  ok(/Citra/.test(await ha.textContent('.pay-col')), 'admin memilih Citra sebagai payment collector');
  await ha.keyboard.press('Escape'); await ha.click('#modals .modal-wrap:last-child [data-act="close"]').catch(() => {});
  step('collector mengisi rekening');
  const hc = await open({ width: 390, height: 844 }, citra, 'hp-citra', '/?pay=' + sid);
  await hc.waitForSelector('#pay-bankf', { timeout: 10000 });
  await hc.fill('#pb-bank', 'BCA'); await hc.fill('#pb-number', '123 456 7890'); await hc.click('#pay-bankf button[type=submit]');
  await hc.waitForSelector('.pay-bank', { timeout: 5000 });
  ok(/1234567890|123 456 7890/.test(await hc.textContent('.pay-bank')) && /Citra/.test(await hc.textContent('.pay-bank')), 'rekening tersimpan (nama pemilik otomatis terisi)');
  await hc.screenshot({ path: OUT + '/01-collector.png' });
  step('pemain: salin rekening, unggah bukti, tanda hijau');
  await hp.waitForFunction(() => /Belum bayar/.test(document.querySelector('.lb-pay') && document.querySelector('.lb-pay').textContent), null, { timeout: 5000 }).catch(() => {});
  ok(/Belum bayar · Rp 75\.000/.test(await hp.textContent('.lb-pay')) && /Collector Citra/.test(await hp.textContent('.lb-pay')), 'lobi HP pemain berubah realtime: Belum bayar + collector');
  await hp.click('.lb-pay [data-lb="pay"]'); await hp.waitForSelector('.pay-bank');
  await hp.click('.pb-row:has-text("No. rekening") [data-copy]'); await hp.waitForTimeout(300);
  ok((await hp.evaluate(() => navigator.clipboard.readText())) === '1234567890', 'tombol Salin menyalin nomor rekening (angka saja)');
  await hp.click('.pay-amt [data-copy]'); await hp.waitForTimeout(200);
  ok((await hp.evaluate(() => navigator.clipboard.readText())) === '75000', 'nominal bisa disalin');
  await hp.screenshot({ path: OUT + '/02-player-pay.png' });
  await hp.setInputFiles('#pay-file', ASLI); await hp.waitForSelector('.pay-me.ok', { timeout: 8000 });
  ok(await hp.$('.pay-me.ok'), 'unggah bukti: langsung "Kamu sudah bayar" (hijau)');
  await ha.waitForSelector('.lb-paid', { timeout: 5000 }).catch(() => {});
  ok((await ha.$$('.lb-paid')).length === 1, 'layar host: ikon hijau muncul di daftar hadir lobi (realtime)');
  await hc.waitForSelector('.pay-row.ok [data-proof]', { timeout: 6000 }).catch(() => {});
  ok(await hc.$('.pay-row.ok [data-proof]'), 'collector melihat bukti di daftar (realtime)');
  await hc.click('.pay-row.ok [data-proof]'); await hc.waitForSelector('.proof-img'); ok(await hc.$eval('.proof-img', (i) => i.complete && i.naturalWidth > 0), 'foto bukti bisa dibuka');
  await hc.click('#modals .modal-wrap:last-child [data-act="close"]');
  await hc.click('.pay-row.ok [data-mark]'); await hc.fill('#pm-note', 'Transfer belum masuk'); await hc.click('#pm-ok');
  await hp.waitForSelector('.pay-me.bad', { timeout: 6000 }).catch(() => {});
  ok(/belum diterima/.test(await hp.textContent('.pay-me')) && /Transfer belum masuk/.test(await hp.textContent('.pay-me')), 'collector membatalkan: pemain melihat alasan, tanda hijau hilang');
  await hc.click('.pay-row:has-text("Dewi") [data-mark]'); await hc.waitForTimeout(800);
  ok(/Sudah bayar\s*1/.test(await hc.textContent('.pay-h')) && await hc.$('.pay-row.ok:has-text("Dewi")'), 'collector menandai lunas manual (tunai)');
  await hc.screenshot({ path: OUT + '/03-collector-list.png' });
  const pubS = await (await fetch(B + '/api', { method: 'POST', body: JSON.stringify({ fn: 'poll', req: {} }) })).json();
  ok(!JSON.stringify(pubS).includes('1234567890') && !JSON.stringify(pubS).includes('123 456 7890'), 'data publik (tanpa login) tidak memuat nomor rekening');

  step('pemain jadi host sesi');
  await hp.click('#modals .modal-wrap:last-child [data-act="close"]').catch(() => {});
  await ha.click('[data-lb="edit"]'); await ha.waitForSelector('[data-pco]');
  await ha.click('[data-pco="' + pl[1].id + '"]'); await ha.waitForTimeout(800);
  ok(await ha.$eval('[data-pco="' + pl[1].id + '"]', (e) => e.classList.contains('on')), 'admin menunjuk Budi jadi host sesi dari Ubah rencana');
  await ha.click('#modals .modal-wrap:last-child [data-act="close"]');
  for (const x of pl) await api('act', { token, sid, type: 'rsvp', payload: { pid: x.id, on: true } }).catch(() => {});
  await api('act', { token, sid, type: 'startPlan', payload: {} });
  const hb = await open({ width: 390, height: 844 }, budi, 'hp-budi', '/'); await toDash(hb);
  await hb.waitForSelector('.cmini', { timeout: 10000 }); await hb.waitForTimeout(500);
  ok((await hb.$$('.cmini footer button')).length > 0, 'HP Budi: tombol court (Game start/skor) muncul');
  const nav = await hb.$$eval('.bottomnav button', (e) => e.map((x) => x.textContent.trim()));
  ok(nav.includes('Pemain') && nav.includes('Riwayat') && !nav.includes('Atur'), 'menu bawah host sesi: Pemain & Riwayat, tanpa Atur (' + nav.join(', ') + ')');
  await hb.screenshot({ path: OUT + '/04-cohost-dash.png' });
  // main beberapa match: host & host sesi memasukkan skor
  let S = (await api('poll', {})).S;
  const lives = S.matches.filter((m) => m.status === 'live');
  await api('act', { token: budi.token, sid, type: 'go', payload: { m: lives[0].id } });
  await new Promise((res) => setTimeout(res, 1500));
  await api('act', { token: budi.token, sid, type: 'score', payload: { m: lives[0].id, a: 13, b: 8 } });
  await api('act', { token, sid, type: 'score', payload: { m: lives[1].id, a: 11, b: 10 } });
  S = (await api('poll', {})).S;
  ok(S.matches.filter((m) => m.status === 'done').length === 2, 'skor dari host sesi (Budi) tersimpan');

  step('riwayat match: durasi & filter match saya');
  await hp.goto(B + '/'); await toDash(hp); await hp.waitForSelector('[data-act="history"]', { timeout: 10000 }); await hp.waitForTimeout(500);
  await hp.evaluate(() => { const t = document.getElementById('turn-alert'); if (t) t.remove(); });
  await hp.click('.dash-tools [data-act="history"]'); await hp.waitForSelector('.modal .hist');
  const allN = (await hp.$$('.modal .hist')).length;
  ok(/\d+ mnt/.test(await hp.textContent('.modal .list')), 'riwayat menampilkan lama match (mnt)');
  await hp.click('.modal [data-act="histMine"][data-v="mine"]'); await hp.waitForTimeout(300);
  const mineRows = await hp.$$eval('.modal .hist', (e) => e.map((x) => x.textContent));
  ok(mineRows.length > 0 && mineRows.length < allN && mineRows.every((t) => /Andi/.test(t)), 'filter "Match saya" hanya match Andi (' + mineRows.length + '/' + allN + ')');
  await hp.screenshot({ path: OUT + '/05-history.png' });

  step('koreksi skor');
  const mA = S.matches.find((m) => m.status === 'done' && m.A.concat(m.B).includes(pl[0].id));
  if (!mA) console.log('  (Andi belum main di 2 match pertama, lewati dispute UI)');
  else {
    await hp.click('.modal [data-dispute="' + mA.id + '"]'); await hp.waitForSelector('#dp-a');
    await hp.fill('#dp-a', String(mA.sB)); await hp.fill('#dp-b', String(mA.sA)); await hp.fill('#dp-note', 'Skor terbalik');
    await hp.click('#dp-send'); await hp.waitForTimeout(1000);
    ok(/Koreksi dikirim/.test(await hp.textContent('#toasts')), 'pemain mengirim koreksi skor');
    const hh = await open({ width: 390, height: 844 }, await loginAs(host.username), 'hp-host', '/'); await toDash(hh);
    await hh.waitForSelector('.dispute-bar', { timeout: 8000 }).catch(() => {});
    ok(await hh.$('.dispute-bar'), 'host melihat "koreksi skor menunggu review" di dashboard');
    await hh.click('.dispute-bar'); await hh.waitForSelector('.dp-card');
    ok(/Skor terbalik/.test(await hh.textContent('.dp-card')), 'host melihat usulan & keterangan pemain');
    await hh.screenshot({ path: OUT + '/06-review.png' });
    await hh.click('.dp-card [data-ok="1"]'); await hh.waitForTimeout(1200);
    const m2 = (await api('poll', {})).S.matches.find((m) => m.id === mA.id);
    ok(m2.sA === mA.sB && m2.sB === mA.sA, 'skor diperbaiki setelah host menyetujui');
    await hp.goto(B + '/'); await toDash(hp); await hp.waitForSelector('.dash-tools [data-act="history"]'); await hp.click('.dash-tools [data-act="history"]'); await hp.waitForSelector('.modal .hist');
    ok(/Skor dikoreksi/.test(await hp.textContent('.modal .list')), 'pemain melihat tanda "Skor dikoreksi"');
    await hp.click('#modals .modal-wrap:last-child [data-act="close"]');
  }

  step('riwayat sesi untuk pemain');
  await api('act', { token, sid, type: 'end', payload: {} });
  await hp.goto(B + '/'); await hp.waitForSelector('[data-act="menu"]');
  for (let i = 0; i < 3 && await hp.$('#modals .modal-wrap'); i++) { await hp.click('#modals .modal-wrap:last-child [data-act="close"]').catch(() => {}); await hp.waitForTimeout(200); }
  await hp.click('[data-act="menu"] >> nth=0'); await hp.click('[data-mi="pastView"]'); await hp.waitForSelector('.past-card', { timeout: 8000 });
  ok(/Kamu ikut/.test(await hp.textContent('.past-card')) && /Jumat Seru/.test(await hp.textContent('.past-card')), 'daftar sesi selesai dengan tanda "Kamu ikut"');
  await hp.click('.past-card'); await hp.waitForSelector('.past-stand');
  ok((await hp.$$('.past-stand .li')).length === 8 && await hp.$('.past-stand .li.me'), 'klasemen akhir lengkap, baris saya ditandai');
  ok(/\d+ mnt/.test(await hp.textContent('#past-matches')) && /Belum bayar|sudah bayar/i.test(await hp.textContent('.past')), 'detail: durasi match & status pembayaran');
  await hp.screenshot({ path: OUT + '/07-past.png', fullPage: true });
  ok(!errs.length, 'tanpa error JS' + (errs.length ? ': ' + errs.slice(0, 5).join(' | ') : ''));
  await b.close();
})().catch((e) => { console.error(e); process.exitCode = 1; });
