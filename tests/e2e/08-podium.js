const L = require('../lib');
const { chromium } = require('playwright');
const Engine = require('../../engine.js');
const fs = require('fs'), path = require('path');
const B = 'http://127.0.0.1:8789', OUT = L.out('08-podium');
const api = async (fn, req) => { const r = await fetch(B + '/api', { method: 'POST', body: JSON.stringify({ fn, req }) }); const j = await r.json(); if (!j.ok) throw new Error(fn + ': ' + j.error); return j.data; };
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ GAGAL: ') + m); if (!c) process.exitCode = 1; };
const step = (t) => console.log('•', t);
const asli = 'data:image/jpeg;base64,' + fs.readFileSync(L.fixture('asli.jpg')).toString('base64');
const BLANK = () => { const c = document.querySelector('.cer canvas'); if (!c) return -1; const x = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let s = 0, s2 = 0, n = 0; for (let i = 0; i < x.length; i += 4 * 97) { const v = x[i] + x[i + 1] + x[i + 2]; s += v; s2 += v * v; n++; } return Math.sqrt(s2 / n - (s / n) ** 2); };
(async () => {
  const adm = await api('createAdmin', { code: '2468', name: 'Lulu Admin', gender: 'P', username: 'lulu', pin: '9876' }), token = adm.token;
  const host = await api('savePerson', { token, person: { name: 'Rudi Hartono', gender: 'L', role: 'host' }, photoData: asli });
  const names = ['Andi', 'Budi', 'Citra', 'Dewi', 'Eko', 'Fajar', 'Gita', 'Hana'];
  const pl = []; for (let i = 0; i < names.length; i++) pl.push(await api('savePerson', { token, person: { name: names[i], gender: [2, 3, 6, 7].includes(i) ? 'P' : 'L' }, photoData: asli }));
  const loginAs = async (u) => api('login', { username: u, pin: '123456', token: '' });
  const r = await api('createSession', { token, setup: { name: 'Jumat Juara', format: 'americano', hosts: [host.id], courts: [{ name: 'Court 1', hostId: host.id }, { name: 'Court 2' }], playerIds: pl.map((x) => x.id),
    scoring: { type: 'points', mode: 'total', n: 10 }, plan: { when: Date.now() + 3600e3, whenText: 'Malam ini', venue: { name: 'Padel Doc Arena' }, theme: 'court' } } });
  const sid = r.sid;
  await api('act', { token, sid, type: 'startPlan', payload: {} });
  const res = [[7, 3], [6, 4], [2, 8], [9, 1], [5, 5], [4, 6], [8, 2], [3, 7], [6, 4], [7, 3]];
  for (let k = 0; k < 10; k++) {
    const S = (await api('poll', {})).S, m = S.matches.find((x) => x.status === 'live' && !(x.wait && x.wait.length));
    if (!m) break;
    await api('act', { token, sid, type: 'score', payload: { m: m.id, a: res[k][0], b: res[k][1] } });
  }
  const b = await chromium.launch(), errs = [];
  const watch = (p, tag) => { p.on('pageerror', (e) => errs.push(tag + ': ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|navigator\.vibrate/.test(m.text())) errs.push(tag + ' console: ' + m.text()); }); };
  const open = async (vp, auth, tag, url, extra) => {
    const ctx = await L.ctx(b, Object.assign({ viewport: vp, deviceScaleFactor: 2, acceptDownloads: true }, extra || {}));
    // popup "Giliran kamu main" bukan bagian uji ini
    await ctx.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '#turn-alert{display:none!important}'; document.head.appendChild(st); }); });
    const pg = await ctx.newPage(); watch(pg, tag);
    await pg.goto(B + '/'); if (auth) await pg.evaluate((a) => { localStorage.setItem('paddoc_auth', JSON.stringify(a)); localStorage.setItem('paddoc_boardpref', 'true'); }, auth);
    await pg.goto(B + (url || '/')); return pg;
  };
  // v2.9.1: yang login mendarat di Home; tes yang butuh dashboard masuk lewat logo
  const toDash = async (pg) => { await pg.waitForSelector('.v-home, .v-dash, .v-board', { timeout: 15000 }); if (await pg.$('.v-home')) { await pg.evaluate(() => document.querySelector('.topbar .brand').click()); await pg.waitForSelector('.v-dash, .v-board', { timeout: 10000 }); } };
  const ha = await open({ width: 1180, height: 820 }, adm, 'admin-ipad');
  const andi = await loginAs(pl[0].username);
  const hp = await open({ width: 390, height: 844 }, andi, 'hp-andi'); await toDash(hp);
  await ha.waitForSelector('.court', { timeout: 15000 }); await hp.waitForSelector('.srow', { timeout: 15000 });

  step('klasemen: menang, lalu selisih poin');
  const poll = await api('poll', {}), Pm = {}; poll.people.forEach((x) => { Pm[x.id] = x; });
  const exp = Engine.standings(poll.S, Pm, { sortBy: poll.S.rules.sortBy }).map((x) => x.id);
  const dom = await hp.$$eval('.stand-list .srow[data-id]', (e) => e.map((x) => x.dataset.id));
  const rows = Engine.standings(poll.S, Pm, { sortBy: 'wins' });
  ok(poll.S.rules.sortBy === 'wins' && JSON.stringify(dom.slice(0, 8)) === JSON.stringify(exp.slice(0, 8)), 'urutan di layar = menang lalu selisih');
  ok(rows.every((x, i) => i === 0 || rows[i - 1].w > x.w || (rows[i - 1].w === x.w && rows[i - 1].diff >= x.diff)), 'tidak ada pemain dengan menang/selisih lebih besar di bawah');

  step('foto pemain layar penuh');
  await hp.click('.stand-list .srow img[data-pid] >> nth=0'); await hp.waitForSelector('.lightbox img', { timeout: 3000 });
  const cap = await hp.textContent('.lightbox .lbx-cap');
  ok(!!cap && names.includes(cap.trim()), 'ketuk foto di klasemen → foto besar + nama (' + cap + ')');
  await hp.screenshot({ path: OUT + '/01-lightbox.png' });
  await hp.click('.lightbox'); ok(!(await hp.$('.lightbox')), 'ketuk lagi → tertutup');
  await ha.waitForSelector('.pcard[data-act="swap"] img[data-pid]', { timeout: 10000 });     // hasil match terakhir tampil ±4 detik dulu
  const pc = await ha.$('.pcard[data-act="swap"] img[data-pid]');
  const bx = await pc.boundingBox();
  await ha.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2); await ha.mouse.down(); await ha.waitForTimeout(700); await ha.mouse.up();
  await ha.waitForTimeout(300);
  ok(!!(await ha.$('.lightbox')) && !(await ha.$('#modals .modal-wrap')), 'papan iPad: tekan lama foto di kartu pemain → foto besar, tombol ganti pemain tidak terbuka');
  await ha.click('.lightbox');
  await pc.click(); await ha.waitForTimeout(400);
  ok(!!(await ha.$('#modals .modal-wrap')), 'ketuk biasa kartu pemain tetap membuka Ganti pemain');
  await ha.click('#modals .modal-wrap:last-child [data-act="close"]');

  const logBefore = fs.existsSync(L.openaiLog) ? fs.readFileSync(L.openaiLog, 'utf8').trim().split('\n').filter(Boolean).length : 0;
  step('sesi ditutup → podium otomatis');
  await ha.click('[data-act="menu"] >> nth=0'); await ha.click('[data-mi="end"]'); await ha.click('.modal-f .btn.primary');
  await ha.waitForSelector('.cer canvas', { timeout: 8000 }); await hp.waitForSelector('.cer canvas', { timeout: 8000 });
  ok(true, 'podium muncul di iPad admin dan HP pemain');
  await ha.waitForTimeout(2600); await hp.waitForTimeout(2600);
  ok((await ha.evaluate(BLANK)) > 20 && (await hp.evaluate(BLANK)) > 20, 'podium tergambar (bukan layar kosong)');
  await ha.screenshot({ path: OUT + '/02-podium-ipad.png' }); await hp.screenshot({ path: OUT + '/03-podium-hp.png' });
  const sr = await ha.$$eval('.cer-sr li', (e) => e.map((x) => x.textContent));
  ok(sr.length === 3 && /Juara 1: /.test(sr[0]) && new RegExp(Pm[rows[0].id].name).test(sr[0]) && /menang · selisih/.test(sr[0]), 'juara 1–3 sesuai klasemen: ' + sr.join(' | '));
  step('simpan foto & video');
  const [dl] = await Promise.all([ha.waitForEvent('download', { timeout: 8000 }), ha.click('.cer [data-c="photo"]')]);
  const pngPath = OUT + '/podium.png'; await dl.saveAs(pngPath);
  ok(/\.png$/.test(dl.suggestedFilename()) && fs.statSync(pngPath).size > 30000, 'Simpan foto: ' + dl.suggestedFilename() + ' (' + Math.round(fs.statSync(pngPath).size / 1024) + ' KB)');
  const vVisible = await ha.$eval('.cer [data-c="video"]', (e) => !e.hidden);
  ok(vVisible, 'tombol Rekam video tersedia (browser mendukung)');
  if (vVisible) {
    await ha.click('.cer [data-c="video"]'); await ha.waitForTimeout(1500);
    ok(/Merekam/.test(await ha.textContent('.cer [data-c="video"]')), 'sedang merekam (hitung mundur)');
    await ha.waitForFunction(() => /Simpan video/.test(document.querySelector('.cer [data-c="video"]').textContent), null, { timeout: 15000 });
    const [dv] = await Promise.all([ha.waitForEvent('download', { timeout: 8000 }), ha.click('.cer [data-c="video"]')]);
    const vp = OUT + '/' + dv.suggestedFilename(); await dv.saveAs(vp);
    ok(/\.(webm|mp4)$/.test(dv.suggestedFilename()) && fs.statSync(vp).size > 50000, 'video ±8 detik tersimpan: ' + dv.suggestedFilename() + ' (' + Math.round(fs.statSync(vp).size / 1024) + ' KB)');
  }
  step('podium tanpa AI');
  const LOG = L.openaiLog, nlog = () => fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).length : 0;
  ok(nlog() === logBefore, 'sesi ditutup & podium dibuka: tidak ada panggilan OpenAI (' + (nlog() - logBefore) + ')');
  ok((await api('listPeople', { token })).every((x) => x.celebUrl === undefined), 'tidak ada data pose selebrasi');
  step('HP pemain: podium → terima kasih → kudos');
  await hp.click('.cer [data-c="next"]'); await hp.waitForSelector('.thanks', { timeout: 5000 });
  ok(/VAMOS!!!/.test(await hp.textContent('.thanks')) && /Terima kasih sudah bergabung/.test(await hp.textContent('.thanks')), 'ucapan terima kasih + VAMOS!!!');
  await hp.screenshot({ path: OUT + '/05-thanks.png' });
  await hp.click('#thx-k'); await hp.waitForSelector('.kd-p', { timeout: 8000 });
  ok(true, 'lanjut ke halaman kudos');
  step('podium bisa dibuka lagi');
  await hp.goto(B + '/'); await hp.waitForSelector('[data-act="menu"]');
  for (let i = 0; i < 3 && await hp.$('.cer'); i++) await hp.click('.cer [data-c="close"]');
  for (let i = 0; i < 3 && await hp.$('#modals .modal-wrap'); i++) await hp.click('#modals .modal-wrap:last-child [data-act="close"]').catch(() => {});
  await hp.click('[data-act="menu"] >> nth=0'); await hp.click('[data-mi="pastView"]'); await hp.waitForSelector('.past-card'); await hp.click('.past-card'); await hp.waitForSelector('[data-act="pastPodium"]');
  await hp.click('[data-act="pastPodium"]'); await hp.waitForSelector('.cer canvas', { timeout: 5000 });
  ok(/Tutup/.test(await hp.textContent('.cer [data-c="next"]')), 'Riwayat sesi → Lihat podium (tombol Tutup, tanpa alur kudos)');
  await hp.click('.cer [data-c="next"]'); ok(!(await hp.$('.cer')), 'podium tertutup');
  step('WhatsApp admin untuk yang belum terdaftar');
  const r2 = await api('createSession', { token, setup: { name: 'Sabtu Ceria', format: 'americano', courts: [{ name: 'C1' }], playerIds: [], plan: { when: Date.now() + 9e7, whenText: 'Sabtu 19.00', venue: {}, theme: 'court' } } });
  const pub = await open({ width: 390, height: 844 }, null, 'publik', '/?lobby=' + r2.sid);
  await pub.waitForSelector('.lb-pubnote a.lb-walink', { timeout: 10000 });
  const wl = await pub.getAttribute('.lb-pubnote a.lb-walink', 'href'), wt = decodeURIComponent(wl.split('?text=')[1] || '');
  ok(wl.startsWith('https://wa.me/6285121300042?text=') && /dibuatkan akun Paddoc Host/.test(wt) && /Sabtu Ceria \(Sabtu 19\.00\)/.test(wt) && /Nama lengkap/.test(wt),
    'lobi (belum masuk): link WhatsApp 0851-2130-0042 dengan template akun + nama sesi');
  await pub.goto(B + '/'); await pub.waitForSelector('[data-act="login"]', { timeout: 10000 }); await pub.click('[data-act="login"] >> nth=0');
  await pub.waitForSelector('#loginf a.btn.wa');
  const lw = decodeURIComponent((await pub.getAttribute('#loginf a.btn.wa', 'href')).split('?text=')[1]);
  ok(/Saya ingin dibuatkan akun Paddoc Host/.test(lw) && /foto wajah/.test(lw) && !/ikut sesi/.test(lw), 'halaman Masuk: tombol "Chat admin di WhatsApp" dengan template akun');
  await pub.screenshot({ path: OUT + '/06-login-wa.png' });
  ok(!errs.length, 'tanpa error JS' + (errs.length ? ': ' + errs.slice(0, 5).join(' | ') : ''));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
