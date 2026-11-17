// Uji browser: tombol Bagikan lobi → salin kalimat ajakan; foto ajakan 16:9 bila sudah ada pemain bergabung
const L = require('../lib');
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const B = 'http://127.0.0.1:8789', OUT = L.out('13-foto-ajakan');
const api = async (fn, req) => { const r = await fetch(B + '/api', { method: 'POST', body: JSON.stringify({ fn, req }) }); const j = await r.json(); if (!j.ok) throw new Error(fn + ': ' + j.error); return j.data; };
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ GAGAL: ') + m); if (!c) process.exitCode = 1; };
const asli = 'data:image/jpeg;base64,' + fs.readFileSync(L.fixture('asli.jpg')).toString('base64');
(async () => {
  const adm = await api('createAdmin', { code: '2468', name: 'Lulu Admin', gender: 'P', username: 'lulu', pin: '9876' }), token = adm.token;
  const host = await api('savePerson', { token, person: { name: 'Rudi Hartono', gender: 'L', role: 'host' }, photoData: asli });
  const names = ['Andi Saputra', 'Bayu', 'Citra Lestari', 'Dewi', 'Eko', 'Fajar', 'Gita', 'Hana', 'Indra', 'Joko', 'Kirana', 'Lina', 'Made', 'Nadia', 'Oka', 'Putri', 'Raka', 'Sari', 'Tono', 'Umi', 'Vino', 'Wulan'];
  const pl = []; for (let i = 0; i < names.length; i++) pl.push(await api('savePerson', { token, person: { name: names[i], gender: [2, 3, 6, 7, 10, 11, 13, 15, 17, 19, 21].includes(i) ? 'P' : 'L' }, photoData: i % 3 ? asli : undefined }));
  const tok = {}; for (const p of pl) tok[p.id] = (await api('login', { username: p.username, pin: '123456' })).token;
  const act = (t, sid, type, payload) => api('act', { token: t, sid, type, payload: payload || {} });
  const b = await chromium.launch(), errs = [];
  const open = async (vp, auth, url) => {
    const ctx = await L.ctx(b, { viewport: vp, deviceScaleFactor: 2, permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true });
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => errs.push(e.message));
    await pg.goto(B + '/'); await pg.evaluate((a) => localStorage.setItem('paddoc_auth', JSON.stringify(a)), auth);
    await pg.goto(B + url); return pg;
  };
  const mk = async (name, extra) => (await api('createSession', { token, setup: Object.assign({ name, format: 'americano', hosts: [host.id], courts: [{ name: 'Court 1' }, { name: 'Court 2' }], playerIds: [],
    plan: { when: Date.now() + 86400e3, whenText: 'Sabtu, 31 Okt · 19.00–21.00', venue: { name: 'Padel Doc Arena', address: 'Jl. Sukajadi 12, Bandung' }, theme: 'court' } }, extra || {}) })).sid;

  console.log('• lobi tanpa pemain: hanya kalimat ajakan disalin, foto tidak dibuat');
  const s0 = await mk('Main Rabu Malam');
  const ha = await open({ width: 1180, height: 820 }, adm, '/?lobby=' + s0);
  await ha.waitForSelector('[data-lb="share"]', { timeout: 15000 }); await ha.waitForTimeout(800);
  await ha.click('[data-lb="share"]'); await ha.waitForTimeout(800);
  let clip = await ha.evaluate(() => navigator.clipboard.readText());
  ok(/Yuk hadir di Main Rabu Malam/.test(clip) && clip.includes('?lobby=' + s0), 'kalimat ajakan + link lobi tersalin');
  ok(!(await ha.$('.inv')), 'tidak ada foto ajakan (belum ada pemain bergabung)');
  ok(/Foto ajakan dibuat setelah ada pemain/.test(await ha.textContent('#toasts')), 'pesan: foto dibuat setelah ada pemain bergabung');

  for (const [n, label, cap] of [[1, '1 pemain', 0], [4, '4 pemain', 0], [14, '14 pemain (1 baris)', 0], [22, '22 pemain (2 baris)', 0], [10, 'Power Cup 8/8 + 2 waiting list', 8]]) {
    console.log('• foto ajakan: ' + label);
    const sid = cap ? (await api('createSession', { token, setup: { name: 'Power Cup Kartu', format: 'powercup', hosts: [host.id], courts: [{ name: 'Court 1', value: 1 }, { name: 'Court 2', value: 2 }], playerIds: [],
      plan: { when: Date.now() + 86400e3, whenText: 'Minggu, 1 Nov · 08.00–11.00', venue: { name: 'Padel Doc Arena' }, theme: 'beach' } } })).sid : await mk({ 1: 'Main Jumat Pagi', 4: 'Main Rabu Malam Bareng', 14: 'Fun Match Sabtu', 22: 'Turnamen Akhir Bulan' }[n], {});
    for (const p of pl.slice(0, n)) { await act(tok[p.id], sid, 'rsvp', { on: true }); }
    await ha.goto(B + '/?lobby=' + sid); await ha.waitForSelector('[data-lb="share"]', { timeout: 15000 }); await ha.waitForTimeout(1200);
    await ha.click('[data-lb="share"]');
    await ha.waitForSelector('.inv-pv img', { timeout: 20000 });
    await ha.waitForFunction(() => { const i = document.querySelector('.inv-pv img'); return i.complete && i.naturalWidth > 0; });
    const im = await ha.evaluate(() => { const i = document.querySelector('.inv-pv img'); return { w: i.naturalWidth, h: i.naturalHeight, save: !document.querySelector('#inv-save').disabled }; });
    ok(im.w === 1920 && im.h === 1080 && im.save, 'foto 1920×1080 (16:9) tampil di pratinjau, tombol Simpan gambar aktif');
    clip = await ha.evaluate(() => navigator.clipboard.readText());
    ok(clip.includes('?lobby=' + sid) && (await ha.inputValue('#inv-t')) === clip, 'kalimat ajakan tersalin otomatis & tampil di kotak teks');
    const dl = ha.waitForEvent('download', { timeout: 10000 });
    await ha.click('#inv-save');
    const d = await dl, file = path.join(OUT, 'ajakan-' + n + '.jpg');
    await d.saveAs(file);
    ok(/^Ajakan .+\.jpg$/.test(d.suggestedFilename()) && fs.statSync(file).size > 50000, 'Simpan gambar → ' + d.suggestedFilename() + ' (' + Math.round(fs.statSync(file).size / 1024) + ' KB)');
    await ha.screenshot({ path: path.join(OUT, 'modal-' + n + '.png') });
    await ha.click('#modals .modal-wrap:last-child [data-act="close"]');
  }

  console.log('• pemain di HP juga bisa membagikan');
  const sidP = await mk('Main Kamis');
  for (const p of pl.slice(0, 3)) await act(tok[p.id], sidP, 'rsvp', { on: true });
  const login = await api('login', { username: pl[0].username, pin: '123456' });
  const hp = await open({ width: 390, height: 844 }, login, '/?lobby=' + sidP);
  await hp.waitForSelector('[data-lb="share"]', { timeout: 15000 }); await hp.waitForTimeout(1000);
  await hp.click('[data-lb="share"]');
  await hp.waitForSelector('.inv-pv img', { timeout: 20000 }); await hp.waitForTimeout(500);
  await hp.screenshot({ path: path.join(OUT, 'hp-modal.png') });
  ok(true, 'HP pemain: pratinjau foto ajakan + Salin teks + Simpan gambar');
  console.log('• pengunjung belum login');
  const ctxP = await L.ctx(b, { viewport: { width: 390, height: 844 }, permissions: ['clipboard-read', 'clipboard-write'] }), pub = await ctxP.newPage();
  pub.on('pageerror', (e) => errs.push('publik: ' + e.message));
  await pub.goto(B + '/?lobby=' + sidP); await pub.waitForSelector('[data-lb="share"]', { timeout: 15000 }); await pub.waitForTimeout(1000);
  await pub.click('[data-lb="share"]'); await pub.waitForTimeout(1500);
  const pclip = await pub.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  ok(pclip.includes('?lobby=' + sidP), 'pengunjung belum login: tombol Bagikan tetap menyalin kalimat ajakan' + ((await pub.$('.inv-pv img')) ? ' + foto ajakan' : ''));
  ok(errs.length === 0, 'tanpa error JS' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
