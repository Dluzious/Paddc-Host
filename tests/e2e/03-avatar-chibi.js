const L = require('../lib');
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const B = 'http://127.0.0.1:8789', OUT = L.out('03-avatar-chibi'), LOG = L.openaiLog;
const api = async (fn, req) => { const r = await fetch(B + '/api', { method: 'POST', body: JSON.stringify({ fn, req }) }); const j = await r.json(); if (!j.ok) throw new Error(fn + ': ' + j.error); return j.data; };
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ GAGAL: ') + m); if (!c) process.exitCode = 1; };
const step = (t) => console.log('•', t);
const calls = () => fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
const asli = 'data:image/jpeg;base64,' + fs.readFileSync(L.fixture('asli.jpg')).toString('base64');
const OVERLAP = () => {
  const st = document.querySelector('.lb-stage').getBoundingClientRect();
  const els = [...document.querySelectorAll('.lb-sprite .tag:not(.dim), .lb-sprite .bub.show:not(.dim)')];
  const rs = els.map((e) => e.getBoundingClientRect()).filter((r) => r.right > st.left && r.left < st.right && r.bottom > st.top && r.top < st.bottom);
  const chips = [...document.querySelectorAll('.lb-stage > .lb-chip')].map((c) => c.getBoundingClientRect());
  let n = 0;
  for (let i = 0; i < rs.length; i++) {
    for (let j = i + 1; j < rs.length; j++) { const a = rs[i], b = rs[j]; if (a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1) n++; }
    for (const c of chips) { const a = rs[i]; if (a.left < c.right - 1 && a.right > c.left + 1 && a.top < c.bottom - 1 && a.bottom > c.top + 1) n++; }
  }
  return { n, shown: rs.length, total: document.querySelectorAll('.lb-sprite .tag').length };
};
(async () => {
  const adm = await api('createAdmin', { code: '2468', name: 'Lulu Admin', gender: 'P', username: 'lulu', pin: '9876' }), token = adm.token;
  const host = await api('savePerson', { token, person: { name: 'Rudi Host', gender: 'L', role: 'host' }, photoData: asli });
  const names = ['Andi', 'Budi', 'Citra', 'Dewi', 'Eko', 'Fajar', 'Gita', 'Hana', 'Irfan', 'Joko', 'Kiki', 'Lina', 'Maya', 'Nanda', 'Oki', 'Putra', 'Qori', 'Rina', 'Sari', 'Tono', 'Umar', 'Vina', 'Wawan', 'Yuni', 'Zaki', 'Ayu', 'Bayu', 'Cahya', 'Dodi', 'Euis'];
  const pl = [];
  for (let i = 0; i < names.length; i++) pl.push(await api('savePerson', { token, person: { name: names[i], gender: i % 3 === 2 ? 'P' : 'L', hijab: i % 6 === 2 }, photoData: asli }));
  const b = await chromium.launch(), errs = [];
  const watch = (p, tag) => { p.on('pageerror', (e) => errs.push(tag + ': ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errs.push(tag + ' console: ' + m.text()); }); };
  const ctxA = await L.ctx(b, { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2 }); const ha = await ctxA.newPage(); watch(ha, 'admin');
  await ha.goto(B + '/'); await ha.evaluate((a) => localStorage.setItem('paddoc_auth', JSON.stringify(a)), adm); await ha.reload();

  step('foto pro AI → avatar chibi otomatis');
  await ha.waitForSelector('[data-act="playersView"]', { timeout: 15000 }); await ha.click('[data-act="playersView"] >> nth=0');
  await ha.waitForSelector(`[data-act="editPlayer"][data-p="${pl[0].id}"]`); await ha.click(`[data-act="editPlayer"][data-p="${pl[0].id}"]`);
  await ha.waitForSelector('#ed-ai'); await ha.click('#ed-ai');
  let p0 = null; for (let i = 0; i < 60 && !(p0 && p0.chibiUrl); i++) { await ha.waitForTimeout(500); p0 = (await api('listPeople', { token })).find((x) => x.id === pl[0].id); }
  ok(p0 && p0.proUrl && p0.chibiUrl && !p0.chibiFull, 'foto pro selesai, avatar chibi dibuat sekali & versi kecil tersimpan');
  const c1 = calls();
  ok(c1.filter((c) => c.kind === 'chibi' && c.status === 200).length === 1, 'satu panggilan avatar berhasil (log: ' + c1.map((c) => c.kind + ':' + c.model + ':' + (c.bg || '-') + ':' + c.status).join(', ') + ')');
  ok(c1.some((c) => c.kind === 'chibi' && c.bg === 'transparent' && c.status === 400) && c1.some((c) => c.kind === 'chibi' && !c.bg && c.status === 200), 'model menolak latar transparan → diulang dengan latar polos');
  // versi kecil benar-benar transparan
  const spr = await fetch(p0.chibiUrl); fs.writeFileSync(OUT + '/sprite0', Buffer.from(await spr.arrayBuffer()));
  console.log('  sprite type', spr.headers.get('content-type'), fs.statSync(OUT + '/sprite0').size, 'byte');
  await ha.waitForTimeout(800); await ha.screenshot({ path: OUT + '/01-editor.png' });
  await ha.keyboard.press('Escape');

  step('buat avatar massal untuk yang belum punya');
  await ha.waitForTimeout(500); await ha.click('[data-act="ptab"][data-v="host"]').catch(() => {});
  await ha.click('[data-act="ptab"][data-v="user"]').catch(() => {});
  await ha.waitForSelector('[data-act="chibiBatch"]'); const label = await ha.textContent('[data-act="chibiBatch"]');
  await ha.click('[data-act="chibiBatch"]'); await ha.waitForSelector('.modal button.primary'); await ha.click('.modal button.primary');
  let missing = 99; for (let i = 0; i < 160 && missing; i++) { await ha.waitForTimeout(500); missing = (await api('listPeople', { token })).filter((x) => x.asliUrl && !x.chibiUrl).length; }
  ok(missing === 0, 'semua orang berfoto punya avatar kecil (' + label.trim() + ')');
  const c2 = calls().filter((c) => c.kind === 'chibi' && c.status === 200);
  ok(c2.length === 31, 'total pembuatan avatar = ' + c2.length + ' (30 pemain + 1 host)');
  ok(calls().some((c) => c.kind === 'chibi' && c.host) && calls().some((c) => c.kind === 'chibi' && c.hijab), 'prompt host berbaju wasit & pemain berhijab tertutup ikut terkirim');

  step('lobi dengan 31 avatar, dibuka berulang');
  const when = Date.now() + 26 * 3600e3;
  const r = await api('createSession', { token, setup: { name: 'Uji Avatar', format: 'americano', courts: [{ name: 'C1' }, { name: 'C2' }, { name: 'C3' }], playerIds: pl.map((x) => x.id),
    plan: { when, whenText: 'Besok 19.30 WIB', venue: { name: 'Padel Doc Arena', address: 'Jl. Siliwangi No. 12, Tasikmalaya', maps: 'https://maps.app.goo.gl/x' }, theme: 'court' } } });
  await api('act', { token, sid: r.sid, type: 'rsvp', payload: { pid: host.id, on: true } });
  const before = calls().length;
  for (let k = 0; k < 5; k++) { await ha.goto(B + '/?lobby=' + r.sid); await ha.waitForSelector('.lb-sprite', { timeout: 10000 }); await ha.waitForTimeout(700); }
  ok(calls().length === before, 'lobi dibuka 5× tanpa panggilan OpenAI baru (' + (calls().length - before) + ')');
  await ha.waitForTimeout(1500);
  ok((await ha.$$eval('.lb-sprite.png img', (e) => e.filter((i) => i.complete && i.naturalWidth > 0).length)) === 31, 'semua karakter memakai avatar asli (PNG/WebP transparan)');
  const fps = await ha.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(Math.round(n / 2)); }; requestAnimationFrame(f); }));
  console.log('  fps iPad (headless, 31 avatar):', fps);
  let worst = 0, shownMin = 99; for (let k = 0; k < 12; k++) { const o = await ha.evaluate(OVERLAP); worst = Math.max(worst, o.n); shownMin = Math.min(shownMin, o.shown); await ha.waitForTimeout(400); }
  ok(worst === 0, 'iPad: tidak ada teks bertumpuk di panggung (12 sampel; label tampil minimal ' + shownMin + '/32)');
  await ha.screenshot({ path: OUT + '/02-ipad-lobby.png' });
  for (const t of ['beach', 'lounge']) {
    await api('act', { token, sid: r.sid, type: 'theme', payload: { theme: t } }); await ha.waitForTimeout(2200);
    let w2 = 0; for (let k = 0; k < 6; k++) { w2 = Math.max(w2, (await ha.evaluate(OVERLAP)).n); await ha.waitForTimeout(300); }
    ok(w2 === 0, 'tema ' + t + ': tidak ada teks bertumpuk');
    await ha.screenshot({ path: OUT + '/03-ipad-' + t + '.png' });
  }
  await api('act', { token, sid: r.sid, type: 'theme', payload: { theme: 'court' } });

  step('HP pemain');
  const cp = await L.ctx(b, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  await cp.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { get: () => true }); });
  const pp = await cp.newPage(); watch(pp, 'hp');
  await pp.goto(B + '/'); await pp.evaluate((a) => localStorage.setItem('paddoc_auth', JSON.stringify(a)), await api('login', { username: pl[2].username, pin: '123456' }));
  await pp.goto(B + '/?lobby=' + r.sid); await pp.waitForSelector('.lb-sprite', { timeout: 10000 }); await pp.waitForTimeout(2000);
  for (let k = 0; k < 4; k++) { await api('act', { token: (await api('login', { username: pl[k + 5].username, pin: '123456' })).token, sid: r.sid, type: 'chat', payload: { text: 'Halo dari ' + names[k + 5] + ', siap main malam ini!' } }); await pp.waitForTimeout(250); }
  let w3 = 0, sh3 = 99; for (let k = 0; k < 10; k++) { const o = await pp.evaluate(OVERLAP); w3 = Math.max(w3, o.n); sh3 = Math.min(sh3, o.shown); await pp.waitForTimeout(350); }
  ok(w3 === 0, 'HP: tidak ada teks bertumpuk, termasuk gelembung chat (label tampil minimal ' + sh3 + ')');
  await pp.screenshot({ path: OUT + '/04-phone-lobby.png' });
  const HEAD = () => { const q = (sel) => [...document.querySelectorAll(sel)].map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height);
    const rs = q('.lb-head > *').concat(q('.lb-meta > span')); let n = 0;
    const kids = q('.lb-head > *'); for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) { const a = kids[i], b = kids[j]; if (a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1) n++; }
    const ex = document.querySelector('[data-lb="exit"]').getBoundingClientRect(); const hit = document.elementFromPoint(ex.left + ex.width / 2, ex.top + ex.height / 2);
    return { n, exitOk: !!hit.closest('[data-lb="exit"]') }; };
  const hd = await pp.evaluate(HEAD);
  ok(hd.n === 0 && hd.exitOk, 'HP: kepala lobi tidak bertumpuk, tombol kembali bisa ditekan');
  const hdA = await ha.evaluate(HEAD);
  ok(hdA.n === 0 && hdA.exitOk, 'iPad: kepala lobi tidak bertumpuk');
  await pp.click('[data-lb="exit"]'); await pp.waitForTimeout(500);
  await pp.click('[data-act="menu"]'); await pp.waitForSelector('[data-mi="profile"]'); await pp.click('[data-mi="profile"]');
  await pp.waitForSelector('.profile', { timeout: 5000 }); await pp.waitForTimeout(800);
  await pp.screenshot({ path: OUT + '/05-profile.png', fullPage: true });
  const prof = await pp.$('.chibi-ph img');
  ok(prof && !(await pp.$('#ed-chibi')), 'Profil pemain: avatar terlihat, tanpa tombol buat ulang');
  ok(fs.readFileSync(path.join(__dirname, '../../manifest.webmanifest'), 'utf8').includes('navigate-existing'), 'manifest: link dibuka di aplikasi yang sudah terbuka (Android)');
  console.log(errs.length ? 'ERROR:\n' + errs.join('\n') : 'tanpa error halaman');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
