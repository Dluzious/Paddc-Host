const L = require('../lib');
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const B = 'http://127.0.0.1:8789', OUT = L.out('04-tema-pasangan-kudos');
const api = async (fn, req) => { const r = await fetch(B + '/api', { method: 'POST', body: JSON.stringify({ fn, req }) }); const j = await r.json(); if (!j.ok) throw new Error(fn + ': ' + j.error); return j.data; };
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ GAGAL: ') + m); if (!c) process.exitCode = 1; };
const step = (t) => console.log('•', t);
const asli = 'data:image/jpeg;base64,' + fs.readFileSync(L.fixture('asli.jpg')).toString('base64');
const OVERLAP = () => {
  const st = document.querySelector('.lb-stage').getBoundingClientRect();
  const els = [...document.querySelectorAll('.lb-sprite .tag:not(.dim), .lb-sprite .bub.show:not(.dim)')];
  const rs = els.map((e) => e.getBoundingClientRect()).filter((r) => r.right > st.left && r.left < st.right && r.bottom > st.top && r.top < st.bottom);
  const chips = [...document.querySelectorAll('.lb-stage > .lb-chip:not([hidden])')].map((c) => c.getBoundingClientRect());
  let n = 0;
  for (let i = 0; i < rs.length; i++) {
    for (let j = i + 1; j < rs.length; j++) { const a = rs[i], b = rs[j]; if (a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1) n++; }
    for (const c of chips) { const a = rs[i]; if (a.left < c.right - 1 && a.right > c.left + 1 && a.top < c.bottom - 1 && a.bottom > c.top + 1) n++; }
  }
  return { n, shown: rs.length };
};
const hit = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
(async () => {
  const adm = await api('createAdmin', { code: '2468', name: 'Lulu Admin', gender: 'P', username: 'lulu', pin: '9876' }), token = adm.token;
  const host = await api('savePerson', { token, person: { name: 'Rudi Hartono', gender: 'L', role: 'host' }, photoData: asli });
  const names = ['Andi', 'Budi', 'Citra', 'Dewi', 'Eko', 'Fajar', 'Gita', 'Hana', 'Irfan', 'Joko'];
  const pl = [];
  for (let i = 0; i < names.length; i++) pl.push(await api('savePerson', { token, person: { name: names[i], gender: [2, 3, 6, 7].includes(i) ? 'P' : 'L' }, photoData: asli }));
  const loginAs = async (u) => api('login', { username: u, pin: '123456', token: '' });
  const b = await chromium.launch(), errs = [];
  const watch = (p, tag) => { p.on('pageerror', (e) => errs.push(tag + ': ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|navigator\.vibrate/.test(m.text())) errs.push(tag + ' console: ' + m.text()); }); };
  const open = async (vp, auth, tag, url) => {
    const ctx = await L.ctx(b, { viewport: vp, deviceScaleFactor: 2 }); const pg = await ctx.newPage(); watch(pg, tag);
    await pg.goto(B + '/'); if (auth) await pg.evaluate((a) => localStorage.setItem('paddoc_auth', JSON.stringify(a)), auth);
    await pg.goto(B + (url || '/')); return pg;
  };
  // v2.9.1: yang login mendarat di Home; tes yang butuh dashboard masuk lewat logo
  const toDash = async (pg) => { await pg.waitForSelector('.v-home, .v-dash, .v-board', { timeout: 15000 }); if (await pg.$('.v-home')) { await pg.evaluate(() => document.querySelector('.topbar .brand').click()); await pg.waitForSelector('.v-dash, .v-board', { timeout: 10000 }); } };
  const ha = await open({ width: 1180, height: 820 }, adm, 'admin');

  step('Tahap 4: editor tema admin (unggah + ketuk 4 sudut)');
  await ha.waitForSelector('[data-act="menu"]', { timeout: 15000 });
  await ha.click('[data-act="menu"] >> nth=0'); await ha.click('[data-mi="themesView"]');
  await ha.waitForSelector('.th-card'); ok((await ha.$$('.th-card')).length === 3, 'daftar memuat 3 tema bawaan');
  await ha.screenshot({ path: OUT + '/01-themes.png' });
  await ha.click('[data-act="newTheme"]'); await ha.fill('#th-name', 'Agustusan');
  await ha.setInputFiles('#th-file', L.fixture('land.jpg')); await ha.waitForSelector('.cal svg');
  const tapAll = async (pts) => {
    for (const [k, fx, fy] of pts) {
      await ha.click('[data-pick="' + k + '"]');
      await ha.$eval('.cal', (e) => e.scrollIntoView({ block: 'center' }));
      const bx = await ha.$eval('.cal svg', (s) => { const r = s.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
      await ha.mouse.click(bx.x + fx * bx.w, bx.y + fy * bx.h); await ha.waitForTimeout(80);
    }
  };
  const LF = { tl: [412, 272], tr: [1175, 272], br: [1425, 855], bl: [158, 855] };
  await tapAll(Object.keys(LF).map((k) => [k, LF[k][0] / 1584, LF[k][1] / 993]));
  await ha.screenshot({ path: OUT + '/02-calib-land.png' });
  await ha.click('[data-tab="port"]'); await ha.setInputFiles('#th-file', L.fixture('port.jpg')); await ha.waitForSelector('.cal svg');
  const PF = { tl: [262, 379], tr: [830, 189], br: [830, 1399], bl: [262, 1199] };
  await tapAll(Object.keys(PF).map((k) => [k, PF[k][0] / 993, PF[k][1] / 1584]));
  ok(!(await ha.$eval('.th-warn', (e) => !e.hidden)), 'urutan sudut benar (tidak ada peringatan)');
  await ha.screenshot({ path: OUT + '/03-calib-port.png' });
  await ha.click('#th-save'); await ha.waitForTimeout(1200);
  let themes = (await api('poll', {})).themes, ev = themes.find((t) => t.name === 'Agustusan');
  const near = (a, b, tol) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol;
  ok(ev && ev.land && ev.port, 'tema event tersimpan dengan gambar layar lebar + HP tegak');
  ok(ev && Object.keys(LF).every((k) => near(ev.land.floor[k], LF[k], 8)) && Object.keys(PF).every((k) => near(ev.port.floor[k], PF[k], 8)),
    'titik sudut tersimpan sesuai ketukan (±8 px): ' + JSON.stringify(ev && ev.port.floor));
  ok(ev && ev.land.size[0] === 1584 && ev.port.size[1] === 1584, 'ukuran gambar asli dipertahankan (≤1800 px)');
  await ha.waitForSelector('.th-card >> text=Agustusan'); ok((await ha.$$('.th-card')).length === 4, 'tema baru muncul di daftar');

  step('lobi memakai tema admin: iPad (lebar) & HP (tegak)');
  const when = Date.now() + 26 * 3600e3;
  const r = await api('createSession', { token, setup: { name: 'Kamis Fixed', format: 'americano', teamMode: 'fixed', hosts: [host.id],
    courts: [{ name: 'Court 1', hostId: host.id }, { name: 'Court 2' }], playerIds: pl.slice(0, 8).map((x) => x.id),
    plan: { when, whenText: 'Jumat 19.30 WIB', venue: { name: 'Padel Doc Arena', address: 'Jl. Siliwangi No. 12, Tasikmalaya', maps: 'https://maps.app.goo.gl/x' }, theme: ev.id } } });
  await api('act', { token, sid: r.sid, type: 'rsvp', payload: { pid: host.id, on: true, as: 'host' } });
  await ha.goto(B + '/?lobby=' + r.sid); await ha.waitForSelector('.lb-sprite', { timeout: 10000 }); await ha.waitForTimeout(1500);
  const bgOf = (pg) => pg.$eval('.lb-bg', (e) => e.style.backgroundImage);
  ok((await bgOf(ha)).includes(ev.land.url), 'iPad: gambar layar lebar tema event dipakai');
  ok(await ha.$eval('.lb-logomark', (e) => !e.hidden), 'logo Paddoc tampil di tema event');
  await ha.screenshot({ path: OUT + '/04-ipad-event.png' });
  const p0 = await loginAs(pl[0].username);
  const hp = await open({ width: 390, height: 844 }, p0, 'hp-andi', '/?lobby=' + r.sid);
  await hp.waitForSelector('.lb-sprite', { timeout: 10000 }); await hp.waitForTimeout(1500);
  ok((await bgOf(hp)).includes(ev.port.url), 'HP: gambar tegak tema event dipakai');
  let worst = 0; for (let k = 0; k < 10; k++) { worst = Math.max(worst, (await hp.evaluate(OVERLAP)).n); await hp.waitForTimeout(300); }
  ok(worst === 0, 'HP tema tegak: tidak ada teks bertumpuk (10 sampel)');
  // karakter berdiri di dalam lantai yang ditandai (di sisi masing-masing)
  const inFloor = await hp.evaluate(() => {
    const st = document.querySelector('.lb-stage').getBoundingClientRect();
    return [...document.querySelectorAll('.lb-sprite')].map((e) => { const r = e.getBoundingClientRect(); return { x: (r.left + r.right) / 2 - st.left, y: r.bottom - st.top, w: st.width, h: st.height }; });
  });
  ok(inFloor.every((q) => q.x > 0 && q.x < q.w && q.y > 0 && q.y <= q.h + 2), 'semua karakter di dalam panggung HP');
  await hp.screenshot({ path: OUT + '/05-hp-event.png' });
  step('ganti tema tanpa muat ulang');
  await ha.selectOption('[data-k="theme"]', 'lounge'); const t0 = Date.now();
  await hp.waitForFunction((u) => !document.querySelector('.lb-bg').style.backgroundImage.includes(u), ev.port.url, { timeout: 5000 }).catch(() => {});
  ok(!(await bgOf(hp)).includes(ev.port.url), 'HP ikut berganti tema dalam ' + (Date.now() - t0) + ' ms tanpa reload');
  await ha.selectOption('[data-k="theme"]', ev.id); await ha.waitForTimeout(600);

  step('Tahap 5a: pilihan pasangan saat Mulai Sesi');
  for (const x of pl.slice(0, 8)) await api('act', { token, sid: r.sid, type: 'rsvp', payload: { pid: x.id, on: true } });
  await ha.waitForTimeout(800);
  await ha.click('[data-lb="start"]'); await ha.waitForSelector('.pm-modes');
  ok((await ha.$$('.pm-mode')).length === 5, '5 pilihan: acak campuran, putra, putri, best player, manual');
  const teamsNow = () => ha.$$eval('.pm-row', (rows) => rows.map((r) => [...r.querySelectorAll('select')].map((s) => s.value)));
  const G = {}; pl.forEach((x) => { G[x.id] = x.gender; });
  let t = await teamsNow();
  ok(t.length === 4 && t.every((x) => x[0] && x[1] && G[x[0]] !== G[x[1]]), 'acak campuran: 4 tim putra + putri');
  await ha.click('[data-pm="mode"][data-v="L"]'); t = await teamsNow();
  ok(t.length === 2 && t.every((x) => G[x[0]] === 'L' && G[x[1]] === 'L'), 'acak putra: hanya 4 putra yang dipasangkan (' + t.length + ' tim)');
  ok(/Belum berpasangan \(4\)/.test(await ha.textContent('.pm-free')), 'sisa (4 putri) ditampilkan sebagai belum berpasangan');
  await ha.click('[data-pm="mode"][data-v="P"]'); t = await teamsNow();
  ok(t.length === 2 && t.every((x) => G[x[0]] === 'P' && G[x[1]] === 'P'), 'acak putri: hanya putri');
  await ha.click('[data-pm="mode"][data-v="seed"]');
  await ha.click('[data-pm="seed"][data-p="' + pl[0].id + '"]'); await ha.click('[data-pm="seed"][data-p="' + pl[1].id + '"]');
  t = await teamsNow();
  const seeds = [pl[0].id, pl[1].id];
  ok(t.length === 4 && seeds.every((s) => t.some((x) => x.includes(s) && !(seeds.includes(x[0]) && seeds.includes(x[1])))), 'best player: tiap best player dapat partner acak non-unggulan');
  await ha.screenshot({ path: OUT + '/06-pairing.png' });
  await ha.click('[data-pm="mode"][data-v="manual"]'); t = await teamsNow();
  ok(t.length === 4 && t.every((x) => !x[0] && !x[1]), 'manual: 4 baris kosong');
  const sel = async (i, s, id) => ha.selectOption('.pm-row >> nth=' + i + ' >> select >> nth=' + s, id);
  await sel(0, 0, pl[0].id); await sel(0, 1, pl[4].id); await sel(1, 0, pl[1].id); await sel(1, 1, pl[5].id);
  await sel(1, 1, pl[4].id); // pemain yang sudah di tim 1 → ditukar
  t = await teamsNow();
  ok(t[0][1] === pl[5].id && t[1][1] === pl[4].id, 'manual: memilih pemain yang sudah dipakai menukar tempatnya');
  await ha.uncheck('#pm-rest');
  await ha.click('#pm-go'); await ha.waitForTimeout(2500);
  const live = (await api('poll', {})).S;
  ok(live && live.status === 'live' && live.teams.length === 2 && live.teams.some((x) => x.a === pl[0].id && x.b === pl[5].id), 'sesi dimulai dengan tim manual saja (sisa tidak dipasangkan): ' + (live && live.teams.length));

  step('Tahap 5b: foto wasit di tengah atas court (papan iPad)');
  await ha.evaluate(() => localStorage.setItem('paddoc_boardpref', 'true')); await ha.goto(B + '/'); await ha.waitForSelector('.court', { timeout: 10000 }); await ha.waitForTimeout(800);
  const refInfo = await ha.evaluate(() => [...document.querySelectorAll('.court')].map((c) => {
    const ref = c.querySelector('.court-ref'); if (!ref) return null;
    const cr = c.getBoundingClientRect(), rr = ref.querySelector('.rph').getBoundingClientRect(), img = ref.querySelector('img');
    const others = [...c.querySelectorAll('.ch-l, .ch-r, .ch-l *, .ch-r *')].filter((e) => e.children.length === 0 && e.textContent.trim()).map((e) => e.getBoundingClientRect());
    const ph = c.querySelector('.pitch').getBoundingClientRect(), refAll = ref.getBoundingClientRect();
    return { dx: Math.abs((rr.left + rr.right) / 2 - (cr.left + cr.right) / 2), top: rr.top - cr.top, img: !!(img && img.complete && img.naturalWidth), name: ref.textContent.trim(),
      overlap: others.filter((o) => o.left < refAll.right - 1 && o.right > refAll.left + 1 && o.top < refAll.bottom - 1 && o.bottom > refAll.top + 1).length, aboveP: refAll.bottom <= ph.top + 1 };
  }));
  const r1 = refInfo[0];
  ok(r1 && r1.img && r1.dx < 2 && r1.top < 20 && r1.aboveP, 'Court 1: foto wasit tampil di tengah atas (selisih ' + (r1 && r1.dx.toFixed(1)) + ' px), di atas lapangan');
  ok(r1 && r1.overlap === 0 && r1.name === 'Rudi', 'foto wasit tidak menutupi teks header; nama: ' + (r1 && r1.name));
  ok(refInfo[1] === null, 'court tanpa wasit: tidak ada foto');
  const pcOver = await ha.evaluate(() => { const c = document.querySelector('.court'), pc = [...c.querySelectorAll('.pcard')].map((e) => e.getBoundingClientRect()), ph = c.querySelector('.pitch').getBoundingClientRect();
    return pc.filter((r) => r.bottom > ph.bottom + 1 || r.top < ph.top - 1).length; });
  ok(pcOver === 0, 'kartu pemain tetap di dalam lapangan setelah header lebih tinggi');
  await ha.screenshot({ path: OUT + '/07-board-ref.png' });

  step('Tahap 5b: kudos');
  const hp2 = await open({ width: 390, height: 844 }, await loginAs(pl[5].username), 'hp-fajar', '/');
  await toDash(hp2); await hp2.waitForSelector('.dash', { timeout: 10000 });
  await hp.goto(B + '/'); await toDash(hp); await hp.waitForSelector('.dash', { timeout: 10000 });
  await api('act', { token, sid: r.sid, type: 'end' });
  // v2.8: podium (bila sudah ada match selesai) → terima kasih → kudos
  await hp.waitForSelector('.cer [data-c="next"], #thx-k', { timeout: 8000 }).catch(() => {});
  if (await hp.$('.cer')) await hp.click('.cer [data-c="next"]');
  await hp.waitForSelector('#thx-k', { timeout: 5000 }).catch(() => {});
  ok(/VAMOS/.test(await hp.textContent('.thanks').catch(() => '')), 'HP pemain: ucapan terima kasih lalu ajakan kudos saat sesi diakhiri');
  await hp.click('#thx-k'); await hp.waitForSelector('.kd-p', { timeout: 8000 });
  const ppl = await hp.$$eval('.kd-p', (e) => e.map((x) => x.dataset.kp));
  ok(ppl.length === 8 && ppl[0] === host.id && !ppl.includes(pl[0].id), 'daftar: host dulu + 7 pemain yang hadir (tanpa diri sendiri): ' + ppl.length);
  ok((await hp.$$('.kd-p.open .kd-chip')).length === 6, 'host dapat 6 pilihan kudos host');
  await hp.click('.kd-p.open .kd-chip >> text=Super Host'); await hp.click('.kd-p.open .kd-chip >> text=Game Day Hero');
  await hp.waitForTimeout(700);
  ok(await hp.$eval('.kd-p.open', (e) => e.dataset.kp) === ppl[1], 'setelah 2 kudos lanjut otomatis ke orang berikutnya');
  ok((await hp.$$('.kd-p.open .kd-chip')).length === 21, 'pemain dapat 21 pilihan kudos');
  await hp.click('.kd-p.open .kd-chip >> text=Wall Master'); await hp.click('.kd-p.open .kd-chip >> text=Dream Partner'); await hp.waitForTimeout(600);
  await hp.click('.kd-p.open .kd-chip >> text=Smash Machine');
  if ((await hp.$eval('.kd-p.open', (e) => e.dataset.kp)) !== pl[5].id) { await hp.click('[data-act="kudosToggle"][data-p="' + pl[5].id + '"]'); }
  await hp.click('.kd-p.open .kd-chip >> text=Silent Killer'); await hp.click('.kd-p.open .kd-chip >> text=Rally Machine');
  await hp.waitForTimeout(600);
  await hp.click('[data-act="kudosToggle"][data-p="' + pl[5].id + '"]'); await hp.click('.kd-p.open .kd-chip >> text=Predator');
  ok(/Maksimal 2/.test(await hp.textContent('#toasts')), 'kudos ke-3 untuk orang yang sama ditolak di layar');
  await hp.screenshot({ path: OUT + '/09-kudos.png' });
  await hp.click('[data-act="kudosSend"]'); await hp.waitForTimeout(1200);
  ok(/terkirim/.test(await hp.textContent('#toasts')), 'kudos terkirim');
  ok(!(await hp.$('.kudos-cta')), 'ajakan di dashboard hilang setelah dikirim');
  // penerima melihat pemberi
  const fajarK = await api('myKudos', { token: (await loginAs(pl[5].username)).token });
  ok(fajarK.list.length === 2 && fajarK.list.every((x) => x.from === 'Andi'), 'Fajar menerima 2 kudos dari Andi');
  const second = await api('myKudos', { token: (await loginAs(pl.find((x) => x.id === ppl[1]).username)).token });
  ok(second.totals.wall_master === 1 && second.totals.dream_partner === 1 && !second.totals.smash_machine, 'orang kedua: Wall Master + Dream Partner (kudos ke-3 tidak masuk)');
  if (await hp2.$('.cer')) await hp2.click('.cer [data-c="next"]').catch(() => {});
  await hp2.waitForSelector('.thanks', { timeout: 5000 }).catch(() => {});
  ok(await hp2.$('.thanks'), 'HP Fajar juga mendapat ucapan terima kasih + ajakan kudos saat sesi diakhiri');
  await hp2.click('#modals .modal-wrap:last-child [data-act="close"]').catch(() => {});
  await hp2.waitForSelector('.kudos-cta', { timeout: 8000 }).catch(() => {});
  ok(await hp2.$('.kudos-cta'), 'dashboard Fajar menampilkan ajakan kudos');
  await hp2.click('[data-act="menu"] >> nth=0'); await hp2.click('[data-mi="profile"]'); await hp2.waitForSelector('.kd-card .kd-from', { timeout: 8000 });
  const pt = await hp2.textContent('.kd-card');
  ok(/Silent Killer/.test(pt) && /Rally Machine/.test(pt) && /dari Andi/.test(pt), 'Profil Fajar: "Kudos untukmu" dengan nama pemberi');
  await hp2.screenshot({ path: OUT + '/10-profile-kudos.png' });
  // orang lain tidak melihat
  const hp3 = await open({ width: 390, height: 844 }, await loginAs(pl[3].username), 'hp-dewi', '/');
  await hp3.waitForSelector('[data-act="menu"]'); await hp3.click('[data-act="menu"] >> nth=0'); await hp3.click('[data-mi="profile"]'); await hp3.waitForSelector('.kd-card');
  await hp3.waitForTimeout(800);
  ok(!/Andi/.test(await hp3.textContent('.kd-card')), 'Dewi (tidak diberi kudos) tidak melihat kudos milik orang lain');
  // lewati
  await hp3.goto(B + '/'); await toDash(hp3); await hp3.waitForSelector('.dash');
  const citraIn = !!(live.parts[pl[3].id]);
  if (citraIn) { await hp3.click('.kudos-cta [data-act="kudosSkip"]'); await hp3.waitForTimeout(400); ok(!(await hp3.$('.kudos-cta')), 'Lewati: ajakan hilang'); }
  else ok(!(await hp3.$('.kudos-cta')), 'yang tidak main tidak diajak memberi kudos');
  // tautan dari notifikasi
  await hp2.goto(B + '/?kudos=' + r.sid); await hp2.waitForSelector('.kd-p', { timeout: 8000 });
  ok(await hp2.$('.kd-p'), 'link notifikasi /?kudos=… membuka halaman kudos');
  // admin
  await ha.evaluate(() => localStorage.setItem('paddoc_boardpref', 'false')); await ha.goto(B + '/');
  await ha.waitForSelector('[data-act="menu"]'); await ha.click('[data-act="menu"] >> nth=0'); await ha.click('[data-mi="playersView"]');
  await ha.waitForSelector('[data-act="ptab"][data-v="kudos"]'); await ha.click('[data-act="ptab"][data-v="kudos"]');
  await ha.waitForSelector('.kd-admin .kd-p'); await ha.click('.kd-admin .kd-ph >> nth=0'); await ha.waitForSelector('.kd-detail');
  const at = await ha.textContent('.kd-admin');
  ok(/Fajar/.test(at) && /Rudi/.test(at) && /dari Andi/.test(at), 'admin: Database → Kudos menampilkan semua penerima & pemberinya');
  await ha.screenshot({ path: OUT + '/11-admin-kudos.png' });
  const ht = await api('login', { username: host.username, pin: '123456', token: '' }).catch(() => null);
  if (ht) { let e = null; try { await api('kudosAdmin', { token: ht.token }); } catch (x) { e = x.message; } ok(/FORBIDDEN/.test(e || ''), 'host tidak bisa membuka data kudos semua orang'); }
  step('papan iPad dengan 4 court, 3 wasit');
  const hosts2 = [host]; for (const n of ['Sinta Wulandari', 'Teguh']) hosts2.push(await api('savePerson', { token, person: { name: n, gender: n === 'Teguh' ? 'L' : 'P', role: 'host' }, photoData: asli }));
  const r2 = await api('createSession', { token, setup: { name: 'Empat Court', format: 'americano', teamMode: 'random', hosts: hosts2.map((x) => x.id),
    courts: [{ name: 'Court 1', hostId: hosts2[0].id }, { name: 'Court Panjang Sekali', hostId: hosts2[1].id }, { name: 'Court 3', hostId: hosts2[2].id }, { name: 'Court 4' }],
    playerIds: pl.map((x) => x.id), plan: { when, whenText: 'x', venue: {}, theme: 'court' } } });
  const extra = []; for (let i = 0; i < 6; i++) extra.push(await api('savePerson', { token, person: { name: 'Tamu ' + (i + 1), gender: i % 2 ? 'P' : 'L' }, photoData: asli }));
  for (const x of extra) await api('act', { token, sid: r2.sid, type: 'rsvp', payload: { pid: x.id, on: true } });
  await api('act', { token, sid: r2.sid, type: 'startPlan', payload: {} });
  for (const vp of [{ width: 1180, height: 820 }, { width: 820, height: 1180 }]) {
    await ha.setViewportSize(vp); await ha.evaluate(() => localStorage.setItem('paddoc_boardpref', 'true')); await ha.goto(B + '/'); await toDash(ha); await ha.waitForSelector('.court-ref', { timeout: 10000 }); await ha.waitForTimeout(1000);
    const res = await ha.evaluate(() => [...document.querySelectorAll('.court')].map((c) => {
      const ref = c.querySelector('.court-ref'), cr = c.getBoundingClientRect();
      const txt = [...c.querySelectorAll('.court-h *')].filter((e) => !e.closest('.court-ref') && e.children.length === 0 && e.textContent.trim()).map((e) => e.getBoundingClientRect());
      const rr = ref && ref.getBoundingClientRect(), ph = c.querySelector('.pitch').getBoundingClientRect();
      const pcs = [...c.querySelectorAll('.pcard')].map((e) => e.getBoundingClientRect());
      return { ref: !!ref, dx: rr ? Math.abs((rr.left + rr.right) / 2 - (cr.left + cr.right) / 2) : 0,
        hit: rr ? txt.filter((o) => o.left < rr.right - 1 && o.right > rr.left + 1 && o.top < rr.bottom - 1 && o.bottom > rr.top + 1).length : 0,
        out: pcs.filter((q) => q.bottom > ph.bottom + 1 || q.top < ph.top - 1 || q.right > ph.right + 1 || q.left < ph.left - 1).length };
    }));
    ok(res.filter((x) => x.ref).length === 3 && res.every((x) => x.dx < 2 && x.hit === 0 && x.out === 0), vp.width + '×' + vp.height + ': 3 foto wasit di tengah, tidak menutupi teks, pemain tetap di lapangan ' + JSON.stringify(res));
    await ha.screenshot({ path: OUT + '/08-board-' + vp.width + '.png' });
  }
  ok(!errs.length, 'tanpa error JS' + (errs.length ? ': ' + errs.slice(0, 5).join(' | ') : ''));
  await b.close();
})().catch((e) => { console.error(e); process.exitCode = 1; });
