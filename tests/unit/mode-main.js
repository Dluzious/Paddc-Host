// uji logika mode main (play.js) tanpa browser
const LP = require('../../play.js');
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ GAGAL: ') + m); if (!c) process.exitCode = 1; };
const inRects = (rs, x, y) => rs.some((r) => x >= r[0] - 1e-9 && x <= r[1] + 1e-9 && y >= r[2] - 1e-9 && y <= r[3] + 1e-9);
const ids = Array.from({ length: 29 }, (_, i) => 'p_' + (i * 7919).toString(36) + 'x' + i);
const LOUNGE = { A: [[.04, .3, .45, .86], [.36, .47, .76, .88], [.2, .47, .02, .1]], B: [[.7, .96, .45, .86], [.53, .64, .76, .88], [.53, .8, .02, .1]] };

console.log('• jadwal bersama');
const a1 = LP.plan(ids, null), a2 = LP.plan(ids.slice(), null);
ok(JSON.stringify(a1) === JSON.stringify(a2), 'urutan hadir sama → sisi & jangkar sama persis (dua layar)');
const nA = ids.filter((id) => a1[id].side === 'A').length;
ok(Math.abs(nA - (ids.length - nA)) <= 1, 'sisi seimbang: ' + nA + ' vs ' + (ids.length - nA));
let minD = 1e9; ['A', 'B'].forEach((s) => { const q = ids.filter((id) => a1[id].side === s).map((id) => a1[id]); q.forEach((p, i) => q.slice(i + 1).forEach((o) => { minD = Math.min(minD, Math.hypot(p.ax - o.ax, p.ay - o.ay)); })); });
ok(minD > 0.9, 'jangkar tersebar (jarak terdekat ' + minD.toFixed(2) + ' m, 14–15 orang per sisi)');
const t0 = 1.76e12;
let inside = true, sideOk = true, maxStep = 0, walks = 0, n = 0;
['court', 'lounge'].forEach((th) => {
  const P = LP.plan(ids, th === 'lounge' ? LOUNGE : null);
  ids.forEach((id) => {
    let prev = null;
    for (let t = t0; t < t0 + 60000; t += 100) {
      const p = LP.autoAt(P[id], t); n++;
      if (!inRects(P[id].rects, p.x, p.y)) inside = false;
      if ((p.x < LP.NET) !== (P[id].side === 'A')) sideOk = false;
      if (p.walk) walks++;
      if (prev) maxStep = Math.max(maxStep, Math.hypot(p.x - prev.x, p.y - prev.y) / 0.1);
      prev = p;
    }
  });
});
ok(inside, 'gerak otomatis selalu di zona sisinya (lapangan & lounge, ' + n + ' sampel)');
ok(sideOk, 'tidak pernah menyeberang net');
ok(maxStep <= LP.WALK + 1e-3, 'tidak ada lompatan: kecepatan maks ' + maxStep.toFixed(2) + ' m/detik (jalan ' + LP.WALK + ')');
ok(walks / n > 0.1 && walks / n < 0.5, 'berjalan ' + Math.round(walks / n * 100) + '% waktu, sisanya diam/bergaya');
ok(JSON.stringify(LP.autoAt(a1[ids[3]], t0 + 12345)) === JSON.stringify(LP.autoAt(a2[ids[3]], t0 + 12345)), 'posisi pada jam yang sama identik di dua layar');
const ids2 = ids.filter((_, i) => i !== 5), a3 = LP.plan(ids2, null);
ok(ids2.slice(0, 5).every((id) => a3[id].side === a1[id].side && a3[id].ax === a1[id].ax), 'ada yang batal: pemain sebelum dia tidak pindah tempat');

console.log('• koordinat layar');
let rt = true;
['land', 'port', 'drawn'].forEach((m) => { for (let k = 0; k < 50; k++) { const x = Math.random() * 20, y = Math.random() * 10, uv = LP.toUV(m, x, y), b = LP.fromUV(m, uv[0], uv[1]); if (Math.abs(b[0] - x) + Math.abs(b[1] - y) > 1e-9) rt = false; } });
ok(rt, 'lapangan ↔ layar bolak-balik tepat (lebar & HP tegak)');
const uvA = LP.toUV('port', 5, 5), uvB = LP.toUV('port', 15, 5);
ok(uvA[1] < 0.5 && uvB[1] > 0.5, 'HP tegak: sisi A di atas net, sisi B di bawah');
const dP = LP.dirFromScreen('port', 1, 0), dL = LP.dirFromScreen('land', 1, 0);
ok(dL[0] === 1 && dP[1] === -1, 'analog ke kanan: lebar → menjauhi kiri lapangan, tegak → ke kanan layar');

console.log('• bola');
const W = LP.WALL;
let inWall = true, energy = true;
for (let k = 0; k < 200; k++) {
  const b = { x0: Math.random() * 20, y0: Math.random() * 10, vx: (Math.random() - .5) * 16, vy: (Math.random() - .5) * 16, t0: 1000, born: 1000, hitAt: 1000 };
  for (let t = 1000; t < 31000; t += 37) { const p = LP.ballAt(b, t); if (p.x < W.x0 - 1e-9 || p.x > W.x1 + 1e-9 || p.y < W.y0 - 1e-9 || p.y > W.y1 + 1e-9) inWall = false; if (Math.abs(Math.hypot(p.vx, p.vy) - Math.hypot(b.vx, b.vy)) > 1e-9) energy = false; }
}
ok(inWall, 'bola tidak pernah keluar dinding (200 lintasan acak × 30 detik)');
ok(energy, 'kecepatan tetap setelah memantul di dinding');
const bw = { x0: 20, y0: 5, vx: 2, vy: 0, t0: 0, born: 0, hitAt: 0 }, pw = LP.ballAt(bw, 500);
ok(Math.abs(LP.ballAt(bw, 250).x - 20.5) < 1e-9 && Math.abs(pw.x - 20) < 1e-9 && pw.vx < 0, 'pantul dinding: X 20 → dinding 20,5 (0,25 dtk) → kembali 20 (0,5 dtk), arah berbalik');
const bt = { born: 0, hitAt: 0 };
ok(LP.alive(bt, 2999) && !LP.alive(bt, 3000), 'tanpa pantulan avatar: hilang tepat 3 detik');
ok(LP.alive({ born: 0, hitAt: 18000 }, 19999) && !LP.alive({ born: 0, hitAt: 19000 }, 20000), 'batas umur 20 detik walau terus dipantulkan');
ok(JSON.stringify(LP.ballAt({ x0: 3, y0: 4, vx: 7, vy: -6, t0: 50 }, 4321)) === JSON.stringify(LP.ballAt({ x0: 3, y0: 4, vx: 7, vy: -6, t0: 50 }, 4321)), 'lintasan sama persis di semua layar (rumus tertutup)');

console.log('• kena avatar → balik ke seberang net');
const rnd = () => 0.5;
const hit = { id: 'B', x: 14, y: 5 }, ball = { x: 13.5, y: 5, vx: 8, vy: 0 };
const others = [{ id: 'A', x: 4, y: 2 }, { id: 'C', x: 6, y: 8 }, { id: 'D', x: 16, y: 5 }];
let v = LP.returnVel(ball, hit, 'C', others, rnd, null);
ok(v[0] < 0 && Math.abs(Math.atan2(v[1], v[0]) - Math.atan2(8 - 5, 6 - 14)) < 1e-9, 'diarahkan ke pemukul terakhir (C) di seberang net');
v = LP.returnVel(ball, hit, 'D', others, rnd, null);
ok(Math.abs(Math.atan2(v[1], v[0]) - Math.atan2(8 - 5, 6 - 14)) < 1e-9, 'pemukul terakhir satu sisi → ke avatar terdekat di seberang (C)');
v = LP.returnVel(ball, hit, 'A', [], rnd, null);
ok(v[0] < 0 && Math.abs(v[1]) < 1e-9, 'tanpa lawan: memantul biasa');
v = LP.returnVel(ball, hit, 'A', others, rnd, [0, 1]);
ok(Math.abs(v[0]) < 1e-9 && v[1] > 0, 'pemain yang memegang analog: bola mengikuti arah analog');
let spOk = true; for (let k = 0; k < 100; k++) { const s = Math.hypot(...LP.returnVel(ball, hit, 'C', others, Math.random, null)); if (s < LP.BALL_V * .85 - 1e-9 || s > LP.BALL_V * 1.15 + 1e-9) spOk = false; }
ok(spOk, 'kecepatan pantulan ' + (LP.BALL_V * .85).toFixed(1) + '–' + (LP.BALL_V * 1.15).toFixed(1) + ' m/detik');
ok(LP.hits({ x: 0, y: 0 }, { x: 0.6, y: 0 }) && !LP.hits({ x: 0, y: 0 }, { x: 0.7, y: 0 }), 'jarak kena ' + LP.R_HIT + ' m');
const aim = LP.aimAt([5, 5], others);
ok(Math.abs(Math.atan2(aim[1], aim[0])) < 1e-9, 'lempar tanpa analog: ke avatar terdekat di seberang (D)');
const bd = LP.bounds('player', a1[ids[0]]);
ok(bd[1] <= LP.NET && bd[0] >= 0, 'batas analog pemain sisi A: X ' + bd[0].toFixed(1) + '–' + bd[1].toFixed(1) + ' (tidak menyeberang net)');
