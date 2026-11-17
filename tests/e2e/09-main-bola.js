// uji browser mode main lobi: iPad host + 2 HP (satu dengan jam HP meleset) + penonton
const L = require('../lib');
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const B = 'http://127.0.0.1:8789', WSB = 'ws://127.0.0.1:8789', OUT = L.out('09-main-bola');
const api = async (fn, req) => { const r = await fetch(B + '/api', { method: 'POST', body: JSON.stringify({ fn, req }) }); const j = await r.json(); if (!j.ok) throw new Error(fn + ': ' + j.error); return j.data; };
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ GAGAL: ') + m); if (!c) process.exitCode = 1; };
const step = (t) => console.log('•', t);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const asli = 'data:image/jpeg;base64,' + fs.readFileSync(L.fixture('asli.jpg')).toString('base64');
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const peek = (pg) => pg.evaluate(() => window.Lobby && Lobby.active ? Lobby.active.peek() : null);
function wsClient(sid) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(WSB + '/play?lobby=' + sid), c = { ws, msgs: [] };
    ws.onmessage = (e) => { try { c.msgs.push(JSON.parse(e.data)); } catch (x) {} };
    ws.onopen = () => res(c); ws.onerror = () => rej(new Error('ws'));
    c.send = (o) => ws.send(JSON.stringify(o));
  });
}
(async () => {
  const adm = await api('createAdmin', { code: '2468', name: 'Lulu Admin', gender: 'P', username: 'lulu', pin: '9876' }), token = adm.token;
  const names = ['Andi', 'Budi', 'Citra', 'Dewi', 'Eko', 'Fajar', 'Gita', 'Irfan', 'Joko', 'Kiki', 'Lina', 'Mira', 'Nando', 'Oki', 'Putri', 'Rama', 'Sari', 'Tono', 'Umi', 'Vino', 'Wati', 'Yudi', 'Zaki', 'Bima', 'Hana'];
  const pl = []; for (let i = 0; i < names.length; i++) pl.push(await api('savePerson', { token, person: { name: names[i], gender: i % 3 ? 'L' : 'P' }, photoData: i < 6 ? asli : undefined }));
  const login = (u) => api('login', { username: u, pin: '123456', token: '' });
  const r = await api('createSession', { token, setup: { name: 'Lobi Main Bola', format: 'americano', courts: [{ name: 'Court 1' }, { name: 'Court 2' }], playerIds: pl.slice(0, 24).map((x) => x.id),
    plan: { when: Date.now() + 2 * 3600e3, whenText: 'Nanti malam', venue: { name: 'Padel Doc Arena' }, theme: 'court' } } });
  const sid = r.sid;
  const andi = await login(pl[0].username), budi = await login(pl[1].username), hana = await login(pl[24].username);
  const b = await chromium.launch(), errs = [];
  const watch = (p, tag) => { p.on('pageerror', (e) => errs.push(tag + ': ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|navigator\.vibrate/.test(m.text())) errs.push(tag + ' console: ' + m.text()); }); };
  const open = async (vp, auth, tag, skew) => {
    const ctx = await L.ctx(b, { viewport: vp, deviceScaleFactor: 2 }); const pg = await ctx.newPage(); watch(pg, tag);
    if (skew) await pg.addInitScript((s) => { const n = Date.now; Date.now = () => n() + s; }, skew);
    await pg.goto(B + '/'); if (auth) await pg.evaluate((a) => localStorage.setItem('paddoc_auth', JSON.stringify(a)), auth);
    await pg.goto(B + '/?lobby=' + sid); await pg.waitForSelector('.lb-stage', { timeout: 15000 }); return pg;
  };
  const ipad = await open({ width: 1180, height: 820 }, adm, 'ipad');
  const hA = await open({ width: 390, height: 844 }, andi, 'hp-andi');
  const hB = await open({ width: 390, height: 844 }, budi, 'hp-budi', 97000);
  await sleep(2500);

  step('posisi sama di semua layar');
  let [pI, pB] = await Promise.all([peek(ipad), peek(hB)]); const realNow = Date.now();
  ok(Math.abs(pB.t - realNow) < 500, 'jam HP Budi meleset 97 detik, jam lobi disamakan ke server (selisih ' + (pB.t - realNow) + ' ms)');
  const ids = Object.keys(pI.sides);
  let worst = 0; ids.forEach((id) => { if (pB.ents[id]) worst = Math.max(worst, dist(pI.ents[id], pB.ents[id])); });
  ok(ids.length === 24 && worst < 0.35, '24 pemain: posisi di iPad (lebar) & HP Budi (tegak) sama, selisih terbesar ' + worst.toFixed(2) + ' m');
  ok(ids.every((id) => (pI.ents[id][0] < 10) === (pI.sides[id] === 'A')), 'semua pemain di sisi net masing-masing');
  ok(pI.sides[pl[0].id] !== pI.sides[pl[1].id], 'Andi & Budi di sisi berbeda (' + pI.sides[pl[0].id] + ' / ' + pI.sides[pl[1].id] + ')');

  step('tombol Main hanya untuk yang sudah bergabung');
  const hH = await open({ width: 390, height: 844 }, hana, 'hp-hana'), pub = await open({ width: 390, height: 844 }, null, 'publik');
  ok(await hA.isVisible('[data-lb="play"]') && await hB.isVisible('[data-lb="play"]'), 'Andi & Budi: tombol Main bola tampil');
  ok(!(await hH.isVisible('[data-lb="play"]')) && !(await pub.isVisible('[data-lb="play"]')) && !(await ipad.isVisible('[data-lb="play"]')), 'Hana (belum bergabung), penonton, iPad admin (tidak hadir): tanpa tombol');
  await hH.close(); await pub.close();

  step('analog');
  await hA.click('[data-lb="play"]'); await hA.waitForSelector('.lb-pad:not([hidden])');
  ok(await hA.isVisible('.lb-joy') && await hA.isVisible('.lb-throw'), 'mode main: analog & tombol lempar muncul');
  const a0 = (await peek(hA)).ents[pl[0].id];
  // HP tegak: analog ke kanan = Y mengecil; pilih arah yang masih lapang (posisi awal tergantung ID pemain)
  const dirX = a0[1] > 5 ? 1 : -1;
  const jb = await hA.locator('.lb-joy').boundingBox(), cx = jb.x + jb.width / 2, cy = jb.y + jb.height / 2;
  await hA.mouse.move(cx, cy); await hA.mouse.down(); await hA.mouse.move(cx + dirX * jb.width * .4, cy, { steps: 5 }); await sleep(1300); await hA.mouse.up();
  await sleep(700);
  [pI, pB] = await Promise.all([peek(ipad), peek(hB)]); const pA = await peek(hA);
  const a1 = pA.ents[pl[0].id];
  ok(dist(a0, a1) > 1.2, 'Andi bergerak ' + dist(a0, a1).toFixed(2) + ' m (analog ke ' + (dirX > 0 ? 'kanan' : 'kiri') + ' 1,3 detik)');
  ok(dist(pI.ents[pl[0].id], a1) < 0.3 && dist(pB.ents[pl[0].id], a1) < 0.3, 'posisi Andi sama di iPad & HP Budi (selisih ' + dist(pI.ents[pl[0].id], a1).toFixed(2) + ' / ' + dist(pB.ents[pl[0].id], a1).toFixed(2) + ' m)');
  ok((a1[0] < 10) === (pA.sides[pl[0].id] === 'A'), 'tidak menyeberang net');
  await hA.screenshot({ path: OUT + '/01-hp-analog.png' });

  step('lempar bola');
  await sleep(2700);           // arah analog sudah lama → bola diarahkan ke avatar terdekat di seberang
  let thrown = null, hitSeen = null;
  for (let tries = 0; tries < 3 && !hitSeen; tries++) {
    await hA.click('.lb-throw');
    await sleep(500);
    [pI, pB] = await Promise.all([peek(ipad), peek(hB)]);
    const bid = Object.keys(pI.balls)[0];
    if (!thrown) { thrown = bid; const pa = (await peek(hA)).balls[bid]; ok(bid && pB.balls[bid] && pa && dist([pI.balls[bid].x, pI.balls[bid].y], [pa.x, pa.y]) < 0.6, 'bola muncul di iPad & HP Budi, posisi sama dengan HP Andi'); }
    for (let i = 0; i < 40 && !hitSeen; i++) { await sleep(100); const q = await peek(ipad); const bb = Object.values(q.balls).find((x) => x.n >= 1); if (bb) hitSeen = bb; }
    if (!hitSeen) await sleep(3500);
  }
  ok(!!hitSeen, 'bola kena avatar dan memantul' + (hitSeen ? ' (kena ' + (names[pl.findIndex((p) => p.id === hitSeen.by)] || hitSeen.by) + ')' : ''));
  if (hitSeen) {
    await sleep(150);
    [pI, pB] = await Promise.all([peek(ipad), peek(hB)]);
    const id = Object.keys(pI.balls).find((k) => pI.balls[k].n >= 1);
    ok(id && pB.balls[id] && dist([pI.balls[id].x, pI.balls[id].y], [pB.balls[id].x, pB.balls[id].y]) < 0.5 && pI.balls[id].n === pB.balls[id].n, 'setelah memantul, lintasan bola sama di iPad & HP Budi');
    const sx = (hitSeen.by && pI.ents[hitSeen.by]) ? pI.ents[hitSeen.by][0] : 0;
    await ipad.screenshot({ path: OUT + '/02-ipad-bola.png' });
    // tunggu bola hilang: catat pantulan terakhir
    let lastN = -1, lastHit = Date.now(), gone = 0; const seen = Date.now();
    for (let i = 0; i < 360 && !gone; i++) {
      const q = await peek(ipad), bb = q.balls[id];
      if (!bb) { gone = Date.now(); break; }
      if (bb.n !== lastN) { lastN = bb.n; lastHit = Date.now(); }
      await sleep(100);
    }
    const byTtl = gone - lastHit >= 2700 && gone - lastHit <= 3600, byAge = gone - seen <= 20500 && gone - lastHit < 3000;
    ok(gone && (byTtl || byAge), 'bola hilang ' + ((gone - lastHit) / 1000).toFixed(1) + ' detik setelah pantulan avatar terakhir (' + lastN + ' pantulan' + (byAge && !byTtl ? '; reli panjang, berhenti di batas umur 20 detik' : '') + ')');
    const pb2 = await peek(hB); ok(!pb2.balls[id], 'di HP Budi juga sudah hilang');
  }

  step('kembali jalan otomatis');
  console.log('  menunggu 8 detik tanpa analog + peralihan…'); await sleep(12500);
  [pI, pB] = await Promise.all([peek(ipad), peek(hB)]); const pA2 = await peek(hA);
  const dIA = dist(pI.ents[pl[0].id], pA2.ents[pl[0].id]), dIB = dist(pI.ents[pl[0].id], pB.ents[pl[0].id]);
  ok(dIA < 0.35 && dIB < 0.35, 'Andi kembali ke jalan otomatis bersama: posisi sama di 3 layar (' + dIA.toFixed(2) + ' / ' + dIB.toFixed(2) + ' m)');

  step('performa: 24 pemain + 6 bola di iPad');
  const others = []; for (let i = 2; i < 8; i++) { const c = await wsClient(sid); c.send({ t: 'auth', k: (await login(pl[i].username)).token, c: Date.now() }); others.push(c); }
  await sleep(600);
  others.forEach((c, i) => c.send({ t: 'b', id: 'perf' + i, x: 12 + i, y: 1 + i, vx: -7 + i, vy: 5 - i * 1.5 }));
  await sleep(300);
  const fps = await ipad.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2500) requestAnimationFrame(f); else res(Math.round(n * 1000 / (performance.now() - t0))); }; requestAnimationFrame(f); }));
  const nb = Object.keys((await peek(ipad)).balls).length;
  ok(nb === 6 && fps >= 50, 'iPad (headless): ' + fps + ' fps dengan ' + nb + ' bola & 24 avatar');
  await ipad.screenshot({ path: OUT + '/03-ipad-6bola.png' });
  await hB.screenshot({ path: OUT + '/04-hp-budi-6bola.png' });
  others.forEach((c) => c.ws.close());

  step('Mulai Sesi mematikan mode main');
  await api('act', { token, sid, type: 'startPlan', payload: {} });
  await sleep(2500);
  const padVis = await hA.evaluate(() => { const p = document.querySelector('.lb-pad'); return !!(p && !p.hidden && p.offsetParent); });
  ok(!padVis, 'analog hilang setelah sesi dimulai');

  step('pratinjau tanpa server (?lobby=demo)');
  const dm = await (await L.ctx(b, { viewport: { width: 1180, height: 820 } })).newPage(); watch(dm, 'demo');
  await dm.goto(B + '/?lobby=demo'); await dm.waitForSelector('.lb-stage'); await dm.click('[data-s="fill"]'); await sleep(5000);
  await dm.click('[data-lb="play"]'); await dm.waitForSelector('.lb-pad:not([hidden])');
  let dHit = false;
  for (let tries = 0; tries < 3 && !dHit; tries++) { await dm.click('.lb-throw'); for (let i = 0; i < 40 && !dHit; i++) { await sleep(100); dHit = Object.values((await peek(dm)).balls).some((x) => x.n >= 1); } if (!dHit) await sleep(3200); }
  ok(dHit, 'pratinjau: lempar bola & memantul tanpa server');
  await dm.screenshot({ path: OUT + '/05-demo.png' });

  ok(!errs.length, 'tanpa error JS' + (errs.length ? ': ' + errs.slice(0, 5).join(' | ') : ''));
  await b.close();
  process.exit();
})().catch((e) => { console.error(e); process.exit(1); });
