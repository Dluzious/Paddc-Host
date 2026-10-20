/* ============================================================
   Paddoc Host — mode main di lobi: hitungan yang sama di semua layar (tanpa DOM)
   - Gerak otomatis dihitung dari jam server + ID pemain, jadi iPad dan semua HP melihat posisi yang sama
     tanpa mengirim apa pun lewat internet.
   - Bola: lintasan lurus memantul di dinding (rumus tertutup, tidak menumpuk selisih antar layar);
     yang dikirim hanya lemparan dan pantulan dari avatar.
   Koordinat lapangan dalam meter: X 0–20 melintang net (net di X = 10, sisi A di X < 10), Y 0–10 menyamping.
   Layar lebar: u = X/20, v = Y/10. HP tegak (lapangan diputar): u = 1 − Y/10, v = X/20.
   Dipakai lobby.js (browser) dan worker/index.js (batas & validasi server).
   ============================================================ */
var LobbyPlay = (function () {
  'use strict';
  var CW = 20, CH = 10, NET = 10;
  var WALL = { x0: -0.5, x1: 20.5, y0: -0.3, y1: 10.3 };   // bola memantul sedikit di luar garis lapangan
  var R_HIT = 0.67;          // jari-jari avatar + bola (m)
  var SPEED = 3.2;           // jalan pakai analog (m/detik)
  var WALK = 1.5;            // jalan otomatis (m/detik)
  var BALL_V = 8;            // kecepatan bola (m/detik)
  var TTL = 3000;            // bola hilang 3 detik setelah pantulan avatar terakhir (dinding tidak menambah umur)
  var MAX_AGE = 20000;       // batas umur bola walau terus dipantulkan (bergantian dengan lemparan lain, maks 6 bola)
  var MAX_BALLS = 6;         // bola sekaligus di satu lobi; tiap orang maksimal 1
  var COOLDOWN = 1500;       // jeda lempar per orang (ms)
  var IDLE = 8000;           // analog dilepas selama ini → avatar kembali jalan otomatis
  var SEND_MS = 250;         // posisi analog dikirim maksimal 4× per detik
  var SIDES = { A: [[.04, .45, .05, .95]], B: [[.55, .96, .05, .95]] };

  function hash(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  /* zona tema (u,v layar lebar) → persegi dalam meter [x0, x1, y0, y1] */
  function zonesM(zones) {
    var z = zones || SIDES, m = function (r) { return [r[0] * CW, r[1] * CW, r[2] * CH, r[3] * CH]; };
    return { A: (z.A || SIDES.A).map(m), B: (z.B || SIDES.B).map(m) };
  }
  function bbox(rs) {
    var b = [1e9, -1e9, 1e9, -1e9];
    rs.forEach(function (r) { b[0] = Math.min(b[0], r[0]); b[1] = Math.max(b[1], r[1]); b[2] = Math.min(b[2], r[2]); b[3] = Math.max(b[3], r[3]); });
    return b;
  }
  /* titik terdekat yang berada di dalam salah satu persegi */
  function nearestIn(rs, x, y) {
    var best = null, bd = 1e18;
    rs.forEach(function (r) {
      var px = clamp(x, r[0], r[1]), py = clamp(y, r[2], r[3]), d = (px - x) * (px - x) + (py - y) * (py - y);
      if (d < bd) { bd = d; best = [px, py]; }
    });
    return best;
  }
  function randIn(rs, r) {
    var tot = 0; rs.forEach(function (z) { tot += (z[1] - z[0]) * (z[3] - z[2]); });
    var a = r() * tot, z = rs[0];
    for (var i = 0; i < rs.length; i++) { a -= (rs[i][1] - rs[i][0]) * (rs[i][3] - rs[i][2]); if (a <= 0) { z = rs[i]; break; } }
    return [z[0] + r() * (z[1] - z[0]), z[2] + r() * (z[3] - z[2])];
  }

  /* sisi net & titik jangkar tiap pemain, dari urutan daftar hadir (sama di semua layar).
     Sisi diisi bergantian supaya seimbang; jangkar dipilih yang paling jauh dari pemain lain di sisi itu. */
  function plan(ids, zones) {
    var Z = zonesM(zones), out = {}, n = { A: 0, B: 0 }, placed = { A: [], B: [] };
    ids.forEach(function (id) {
      var side = n.A <= n.B ? 'A' : 'B', seed = hash(id), r = rng(seed ^ 0x2545F491), best = null, bestD = -1;
      n[side]++;
      for (var k = 0; k < 10; k++) {
        var c = randIn(Z[side], r), d = 1e9;
        placed[side].forEach(function (q) { d = Math.min(d, Math.hypot(c[0] - q[0], c[1] - q[1])); });
        if (d > bestD) { bestD = d; best = c; }
      }
      placed[side].push(best);
      var home = Z[side].filter(function (z) { return best[0] >= z[0] && best[0] <= z[1] && best[1] >= z[2] && best[1] <= z[3]; })[0] || Z[side][0];
      out[id] = { id: id, side: side, ax: best[0], ay: best[1], seed: seed, C: 5 + (seed % 1000) / 400, ph: ((seed >>> 10) % 7000) / 1000, rects: Z[side], home: home };
    });
    return out;
  }
  /* titik tujuan ke-k: acak dalam radius 1,6 m dari jangkar, di persegi zona tempat jangkarnya
     (zona tema bisa terpisah-pisah, mis. lounge: berjalan di dalam satu persegi tidak pernah melewati sofa) */
  function waypoint(pl, k) {
    var r = rng(pl.seed + k * 7919), a = r() * Math.PI * 2, d = Math.sqrt(r()) * 1.6;
    return nearestIn([pl.home], pl.ax + Math.cos(a) * d, pl.ay + Math.sin(a) * d);
  }
  /* posisi gerak otomatis pada waktu t (ms, jam server): diam di titik k, lalu berjalan ke titik k+1 di akhir siklus */
  function autoAt(pl, t) {
    var s = t / 1000 + pl.ph, k = Math.floor(s / pl.C), tau = s - k * pl.C;
    var p0 = waypoint(pl, k), p1 = waypoint(pl, k + 1), dist = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), D = Math.min(pl.C - 0.5, dist / WALK);
    if (D <= 0 || tau < pl.C - D) return { x: p0[0], y: p0[1], walk: false };
    var f = (tau - (pl.C - D)) / D;
    return { x: p0[0] + (p1[0] - p0[0]) * f, y: p0[1] + (p1[1] - p0[1]) * f, walk: true };
  }
  /* batas jalan pakai analog: pemain di sisinya sendiri (tidak menyeberang net), host boleh ke mana saja */
  function bounds(role, pl) {
    if (role === 'host' || !pl) return [0.5, 19.5, 0.5, 11.2];
    return bbox(pl.rects);
  }

  /* lapangan (meter) ↔ titik lantai layar (u,v) */
  function toUV(mode, x, y) { return mode === 'land' ? [x / CW, y / CH] : [1 - y / CH, x / CW]; }
  function fromUV(mode, u, v) { return mode === 'land' ? [u * CW, v * CH] : [v * CW, (1 - u) * CH]; }
  /* arah analog di layar → arah di lapangan */
  function dirFromScreen(mode, jx, jy) { return mode === 'land' ? [jx, jy] : [jy, -jx]; }

  /* ---------- bola ---------- */
  function fold(p, a, b) { var L = b - a, q = ((p - a) % (2 * L) + 2 * L) % (2 * L); return q <= L ? [a + q, 1] : [a + 2 * L - q, -1]; }
  /* posisi & arah bola pada waktu t: lurus dari pantulan terakhir, memantul di dinding */
  function ballAt(b, t) {
    var dt = Math.max(0, t - b.t0) / 1000, fx = fold(b.x0 + b.vx * dt, WALL.x0, WALL.x1), fy = fold(b.y0 + b.vy * dt, WALL.y0, WALL.y1);
    return { x: fx[0], y: fy[0], vx: b.vx * fx[1], vy: b.vy * fy[1] };
  }
  function alive(b, t) { return t < b.hitAt + TTL && t < b.born + MAX_AGE; }
  function hits(p, a) { return Math.hypot(p.x - a.x, p.y - a.y) < R_HIT; }
  function rot(v, ang) { var c = Math.cos(ang), s = Math.sin(ang); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c]; }
  function unit(v) { var d = Math.hypot(v[0], v[1]) || 1; return [v[0] / d, v[1] / d]; }
  /* bola kena avatar `hit`: dikembalikan ke seberang net seperti reli.
     aim (arah analog pemain yang sedang mengendalikan avatarnya) dipakai bila ada, hampir tepat; kalau tidak, diarahkan ke pemukul
     terakhir bila ia di seberang, atau ke avatar terdekat di seberang; tanpa lawan di seberang bola memantul biasa. */
  function returnVel(ball, hit, lastBy, others, rnd, aim) {
    var dir = null, sideOf = function (x) { return x < NET; };
    if (aim && (aim[0] || aim[1])) dir = rot(unit(aim), (rnd() - 0.5) * 0.2);
    else {
      var opp = others.filter(function (o) { return o.id !== hit.id && sideOf(o.x) !== sideOf(hit.x); }), tg = null;
      opp.forEach(function (o) { if (o.id === lastBy) tg = o; });
      if (!tg) opp.forEach(function (o) { if (!tg || Math.hypot(o.x - hit.x, o.y - hit.y) < Math.hypot(tg.x - hit.x, tg.y - hit.y)) tg = o; });
      if (tg) dir = rot(unit([tg.x - hit.x, tg.y - hit.y]), (rnd() - 0.5) * 1.1);   // avatar otomatis membalas ±31°, analog ±6°
    }
    if (!dir) {
      var nrm = unit([ball.x - hit.x, ball.y - hit.y]), dot = ball.vx * nrm[0] + ball.vy * nrm[1];
      dir = unit(dot < 0 ? [ball.vx - 2 * dot * nrm[0], ball.vy - 2 * dot * nrm[1]] : [ball.vx, ball.vy]);
    }
    var sp = BALL_V * (0.85 + rnd() * 0.3);
    return [dir[0] * sp, dir[1] * sp];
  }
  /* arah lempar tanpa analog: ke avatar terdekat di seberang net, kalau tidak ada ke tengah seberang */
  function aimAt(me, others) {
    var tg = null, mine = me[0] < NET;
    others.forEach(function (o) { if ((o.x < NET) !== mine && (!tg || Math.hypot(o.x - me[0], o.y - me[1]) < Math.hypot(tg.x - me[0], tg.y - me[1]))) tg = o; });
    return unit(tg ? [tg.x - me[0], tg.y - me[1]] : [(mine ? 15 : 5) - me[0], 5 - me[1]]);
  }

  var api = {
    CW: CW, CH: CH, NET: NET, WALL: WALL, R_HIT: R_HIT, SPEED: SPEED, WALK: WALK, BALL_V: BALL_V, TTL: TTL, MAX_AGE: MAX_AGE,
    MAX_BALLS: MAX_BALLS, COOLDOWN: COOLDOWN, IDLE: IDLE, SEND_MS: SEND_MS,
    hash: hash, plan: plan, autoAt: autoAt, bounds: bounds, toUV: toUV, fromUV: fromUV, dirFromScreen: dirFromScreen,
    ballAt: ballAt, alive: alive, hits: hits, returnVel: returnVel, aimAt: aimAt, clamp: clamp
  };
  return api;
})();
if (typeof module !== 'undefined' && module.exports) module.exports = LobbyPlay;
