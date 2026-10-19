/* ============================================================
   Paddoc Host — ruang tunggu (lobi)
   Karakter pemain & host berkeliaran di panggung berperspektif sampai host menekan Mulai Sesi.
   - Layar lebar (iPad, laptop): latar gambar ilustrasi per tema, area lantai dikalibrasi ke gambar.
   - HP tegak: lapangan diputar (net melintang), digambar oleh kode sampai ada gambar versi tegak.
   Gerak karakter acak dari kode (bukan AI), hanya transform CSS supaya ringan untuk 30+ karakter.
   Dipakai app (index.html) lewat Lobby.mount(), dan Lobby.demo() untuk pratinjau dengan data dummy.
   ============================================================ */
var Lobby = (function () {
  'use strict';
  var REDUCE = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var HEADVB = '8 5 48 48';

  /* ---------- util ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function initials(n) { return String(n || '?').trim().split(/\s+/).map(function (w) { return w.charAt(0); }).join('').slice(0, 2).toUpperCase(); }
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function pick(r, a) { return a[Math.floor(r() * a.length)]; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* mode privat */ } }
  function hhmm(t) { var d = new Date(t); return ('0' + d.getHours()).slice(-2) + '.' + ('0' + d.getMinutes()).slice(-2); }
  var IC = {
    cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="m16 6-4-4-4 4"/><path d="M12 2v13"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>', chev: '<path d="m6 9 6 6 6-6"/>',
    play: '<path d="m6 4 14 8-14 8Z"/>', music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>', login: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5"/><path d="M15 12H3"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3Z"/><circle cx="12" cy="13" r="3"/>',
    back: '<path d="m15 18-6-6 6-6"/>', check: '<path d="M20 6 9 17l-5-5"/>'
  };
  function ic(n) { return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + IC[n] + '</svg>'; }

  /* ---------- karakter dummy (Tahap 3 diganti PNG chibi dari foto AI pro) ---------- */
  var SKIN = ['#f2c9a0', '#e6b48c', '#cf9668', '#ad754c', '#f6d6b7'];
  var HAIR = ['#1d1612', '#2e2018', '#4a2f1d', '#121212', '#5b3a22'];
  var HIJAB = ['#3a5a8c', '#8a3b5c', '#2f6b5a', '#c47b3a', '#5b4a8a', '#ded8cc', '#2b2f3d'];
  var SHIRT = ['#E8902F', '#ff7a59', '#34c3a0', '#f4f6f8', '#7aa7ff', '#e4572e', '#9b7bff', '#262a36', '#f15bb5'];
  var SHORTS = ['#1f2a44', '#2a2a35', '#3b3b48', '#14324f'];
  var RACKET = ['#e4572e', '#1f9dff', '#22c55e', '#f5f5f5', '#ffb703', '#141414', '#c026d3'];
  var LIGHT = { '#E8902F': 1, '#f4f6f8': 1, '#34c3a0': 1, '#7aa7ff': 1 };
  function look(seed, female, hijab) {
    var r = rng(seed * 977 + 13);
    return { skin: pick(r, SKIN), hairC: pick(r, HAIR), hijabC: pick(r, HIJAB), shirt: pick(r, SHIRT), shorts: pick(r, SHORTS), racket: pick(r, RACKET),
      capC: pick(r, ['#1d1f27', '#e4572e', '#f4f6f8', '#1f9dff']), hijab: !!hijab, hair: female ? (r() < .5 ? 4 : 2) : [0, 1, 3, 0, 1][Math.floor(r() * 5)] };
  }
  function refLook(seed) { var r = rng(seed * 31 + 7); return { skin: pick(r, SKIN), hairC: pick(r, HAIR), shorts: '#1f2a44', ref: true, hair: 3, capC: '#151515' }; }
  function chibi(l, vb) {
    var shirt = l.ref ? 'url(#lbref)' : l.shirt, sleeve = (l.hijab || l.ref) ? shirt : l.skin, legs = l.hijab ? l.shorts : l.skin, light = LIGHT[l.shirt] || l.ref;
    var s = '<svg viewBox="' + (vb || '0 0 64 96') + '" xmlns="http://www.w3.org/2000/svg">';
    if (l.ref) s += '<defs><pattern id="lbref" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="3" height="6" fill="#151515"/><rect x="3" width="3" height="6" fill="#f2f2f2"/></pattern></defs>';
    if (!l.hijab && l.hair === 4) s += '<path d="M12 30 Q12 8 32 8 Q52 8 52 30 L53 50 Q47 46 45 36 L19 36 Q17 46 11 50Z" fill="' + l.hairC + '"/>';
    if (!l.hijab && l.hair === 2) s += '<ellipse cx="50" cy="31" rx="5" ry="11" fill="' + l.hairC + '"/>';
    s += '<g class="leg-l"><rect x="23" y="68" width="7" height="17" rx="3" fill="' + legs + '"/><ellipse cx="26" cy="87" rx="5" ry="3" fill="#f4f4f6"/></g>';
    s += '<g class="leg-r"><rect x="34" y="68" width="7" height="17" rx="3" fill="' + legs + '"/><ellipse cx="38" cy="87" rx="5" ry="3" fill="#f4f4f6"/></g>';
    s += '<rect x="21" y="61" width="22" height="13" rx="4" fill="' + l.shorts + '"/>';
    s += '<rect x="13" y="46" width="7" height="16" rx="3.5" fill="' + sleeve + '"/><rect x="13" y="45" width="7" height="7" rx="3" fill="' + shirt + '"/><circle cx="16.5" cy="62" r="3.4" fill="' + l.skin + '"/>';
    s += '<rect x="19" y="43" width="26" height="23" rx="8" fill="' + shirt + '"/>';
    if (l.ref) s += '<circle cx="27" cy="52" r="2.6" fill="#c9d1db" stroke="#7b8796" stroke-width=".8"/>';
    else s += '<circle cx="37" cy="51" r="3.8" fill="' + (light ? '#0A1628' : '#ffffff') + '"/><text x="37" y="53" font-size="5.4" font-weight="900" text-anchor="middle" fill="' + (light ? '#ffffff' : '#0A1628') + '" font-family="Arial,sans-serif">P</text>';
    s += '<g class="arm"><rect x="44" y="46" width="7" height="16" rx="3.5" fill="' + sleeve + '"/><rect x="44" y="45" width="7" height="7" rx="3" fill="' + shirt + '"/>';
    if (l.ref) s += '<rect x="49" y="49" width="7" height="9" rx="1.2" fill="#ffd43b" transform="rotate(14 52 54)"/>';
    else s += '<line x1="48" y1="61" x2="53" y2="51" stroke="#22252c" stroke-width="2.6" stroke-linecap="round"/><ellipse cx="56.5" cy="42.5" rx="7" ry="9" transform="rotate(20 56.5 42.5)" fill="' + l.racket + '" stroke="rgba(0,0,0,.35)" stroke-width="1"/>';
    s += '<circle cx="47.5" cy="62" r="3.4" fill="' + l.skin + '"/></g>';
    if (l.hijab) {
      s += '<path d="M10 33 Q10 7 32 7 Q54 7 54 33 Q54 47 44 49 L20 49 Q10 47 10 33Z" fill="' + l.hijabC + '"/><path d="M17 41 Q32 55 47 41 L49 52 Q32 61 15 52Z" fill="' + l.hijabC + '"/>';
      s += '<ellipse cx="32" cy="30" rx="12" ry="13" fill="' + l.skin + '"/>';
    } else {
      s += '<circle cx="15.5" cy="30" r="3" fill="' + l.skin + '"/><circle cx="48.5" cy="30" r="3" fill="' + l.skin + '"/><circle cx="32" cy="28" r="17" fill="' + l.skin + '"/>';
      if (l.hair === 1) s += '<path d="M15 27 L16 14 L22 18 L24 8 L30 15 L34 6 L38 15 L43 8 L44 18 L49 14 L49 27 Q42 17 32 18 Q22 17 15 27Z" fill="' + l.hairC + '"/>';
      else if (l.hair === 3) s += '<path d="M14 25 Q15 9 32 9 Q49 9 50 25Z" fill="' + l.capC + '"/><path d="M30 23 Q46 20 57 25 Q46 28 30 26Z" fill="' + l.capC + '"/>';
      else s += '<path d="M15 29 Q14 9 32 9 Q50 9 49 29 Q46 17 35 17 Q30 22 21 21 Q17 23 15 29Z" fill="' + l.hairC + '"/>';
    }
    s += '<ellipse cx="27" cy="31" rx="2" ry="2.6" fill="#1a1c24"/><ellipse cx="37" cy="31" rx="2" ry="2.6" fill="#1a1c24"/><circle cx="27.7" cy="30" r=".75" fill="#fff"/><circle cx="37.7" cy="30" r=".75" fill="#fff"/>';
    s += '<ellipse cx="23" cy="36" rx="2.6" ry="1.4" fill="#ff8a8a" opacity=".45"/><ellipse cx="41" cy="36" rx="2.6" ry="1.4" fill="#ff8a8a" opacity=".45"/>';
    return s + '<path d="M29.5 37.5 Q32 40 34.5 37.5" stroke="#5a2b2b" stroke-width="1.3" fill="none" stroke-linecap="round"/></svg>';
  }
  /* belum ada foto/avatar: siluet + inisial, supaya lobi tetap rapi */
  function silhouette(name, vb, host) {
    return '<svg viewBox="' + (vb || '0 0 64 96') + '" xmlns="http://www.w3.org/2000/svg"><g fill="' + (host ? '#5b4a33' : '#4d5e75') + '">' +
      '<g class="leg-l"><rect x="23" y="68" width="7" height="18" rx="3"/></g><g class="leg-r"><rect x="34" y="68" width="7" height="18" rx="3"/></g>' +
      '<rect x="13" y="45" width="7" height="17" rx="3.5"/><rect x="19" y="43" width="26" height="30" rx="9"/><g class="arm"><rect x="44" y="45" width="7" height="17" rx="3.5"/></g></g>' +
      '<circle cx="32" cy="28" r="17" fill="' + (host ? '#8a7350' : '#6c7e96') + '"/><text x="32" y="33.5" font-size="14" font-weight="800" text-anchor="middle" fill="#0A1628" font-family="Plus Jakarta Sans,Arial,sans-serif">' + esc(initials(name)) + '</text></svg>';
  }
  /* badan penuh untuk panggung */
  function figure(p) {
    if (p.sprite) return '<img src="' + esc(p.sprite) + '" alt="" draggable="false">';
    if (p.look) return chibi(p.look);
    return silhouette(p.name, null, p.role === 'host');
  }
  /* kepala kecil untuk daftar & chat: foto profil bila ada */
  function head(p) {
    if (p && p.photo) return '<span class="lb-av"><img src="' + esc(p.photo) + '" alt="" loading="lazy"></span>';
    if (p && p.look) return '<span class="lb-av">' + chibi(p.look, HEADVB) + '</span>';
    return '<span class="lb-av">' + silhouette(p ? p.name : '?', HEADVB, p && p.role === 'host') + '</span>';
  }

  /* ---------- tema ----------
     land: gambar latar layar lebar + sudut garis lapangan di gambar (px) + zona tiap sisi (u,v) + tempat host
     zona A/B = dua sisi net; karakter tidak pernah pindah sisi selama lobi */
  var SIDES = { A: [[.04, .45, .05, .95]], B: [[.55, .96, .05, .95]] };
  var THEMES = {
    court: { name: 'Lapangan Paddoc', land: { img: 'img/lobby/court.webp', size: [1584, 993],
      floor: { tl: [385, 262], tr: [1205, 262], bl: [185, 830], br: [1395, 830] }, zones: SIDES,
      hosts: [[.44, .56, 1.11, 1.13], [.43, .57, 1.14, 1.16]] } },
    lounge: { name: 'Lounge Paddoc', land: { img: 'img/lobby/lounge.webp', size: [1584, 993],
      floor: { tl: [330, 330], tr: [1255, 330], bl: [130, 850], br: [1455, 850] },
      zones: { A: [[.04, .3, .45, .86], [.36, .47, .76, .88], [.2, .47, .02, .1]], B: [[.7, .96, .45, .86], [.53, .64, .76, .88], [.53, .8, .02, .1]] },
      hosts: [[.45, .55, 1.08, 1.1], [.44, .56, 1.11, 1.13]] } },
    beach: { name: 'Pantai', land: { img: 'img/lobby/beach.webp', size: [1584, 993],
      floor: { tl: [412, 272], tr: [1175, 272], bl: [158, 855], br: [1425, 855] }, zones: SIDES,
      hosts: [[.44, .56, 1.06, 1.08], [.43, .57, 1.09, 1.11]] } },
    // tema event: tinggal isi gambar & kalibrasi (lihat README)
    agustusan: { name: 'Agustusan', soon: true }, ramadan: { name: 'Ramadan', soon: true }, turnamen: { name: 'Panggung turnamen', soon: true }
  };
  var PORT = { zones: { A: [[.06, .94, .05, .42]], B: [[.06, .94, .58, .95]] }, hosts: [[-.05, -.025, .4, .6], [1.025, 1.05, .4, .6]] };

  function layoutFor(themeId, W, H) {
    var th = THEMES[themeId] || THEMES.court, L = th.land;
    if (L && W / H >= 1.15) {
      var iw = L.size[0], ih = L.size[1], k = Math.max(W / iw, H / ih), ox = (W - iw * k) / 2, oy = (H - ih * k) / 2, f = L.floor;
      return { mode: 'land', img: L.img, zones: L.zones, hosts: L.hosts, SH: clamp((f.br[0] - f.bl[0]) * k * .105, 40, 150),
        proj: function (u, v) {
          var y = f.tl[1] + (f.bl[1] - f.tl[1]) * v, xl = f.tl[0] + (f.bl[0] - f.tl[0]) * v, xr = f.tr[0] + (f.br[0] - f.tr[0]) * v;
          return { x: ox + (xl + (xr - xl) * u) * k, y: oy + y * k, s: .62 + .38 * v };
        } };
    }
    var y0 = .17, y1 = .86, wT = .6, wB = .88;
    return { mode: 'port', zones: PORT.zones, hosts: PORT.hosts, SH: clamp(H * .12, 44, 110),
      proj: function (u, v) { return { x: W / 2 + (u - .5) * W * (wT + (wB - wT) * v), y: H * (y0 + (y1 - y0) * v), s: .66 + .34 * v }; } };
  }

  /* ---------- lapangan versi HP tegak (digambar kode): net melintang, sisi A di atas, B di bawah ---------- */
  function drawPortrait(c, W, H, P, id) {
    var seg = function (u1, v1, u2, v2) { var a = P(u1, v1), b = P(u2, v2); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); };
    var poly = function (pts) { c.beginPath(); pts.forEach(function (q, k) { var p = P(q[0], q[1]); if (k) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); }); c.closePath(); };
    var glow = function (x1, y1, x2, y2, w, col) { c.save(); c.strokeStyle = col || '#FFB866'; c.lineWidth = w; c.shadowColor = 'rgba(255,170,80,.95)'; c.shadowBlur = 12; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); c.restore(); };
    var mark = function (x, y, h, col) {           // logo titik + PADDOC seperti di gambar tema
      c.save(); c.fillStyle = col; var d = h * .16;
      [[0, 1.1], [.9, .55], [1.8, 0], [.9, 1.65], [1.8, 1.1], [1.8, 2.2]].forEach(function (q) { c.beginPath(); c.arc(x - h * 1.9 + q[0] * d * 1.4, y - h * .35 + q[1] * d * 1.4, d * .55, 0, 7); c.fill(); });
      c.font = '800 ' + (h * .5) + 'px "Plus Jakarta Sans", sans-serif'; c.textBaseline = 'middle';
      if (c.letterSpacing !== undefined) c.letterSpacing = (h * .16) + 'px';
      c.fillText('PADDOC', x - h * 1.05, y + 1); c.restore();
    };
    var beach = id === 'beach', lounge = id === 'lounge';
    var back = P(0, -.08), wallH = H * .12 * back.s;
    // langit / taman di belakang
    if (beach) {
      var sky = c.createLinearGradient(0, 0, 0, back.y); sky.addColorStop(0, '#3a8fd4'); sky.addColorStop(.55, '#8fd0ef'); sky.addColorStop(1, '#ffd6a0'); c.fillStyle = sky; c.fillRect(0, 0, W, back.y);
      var sea = c.createLinearGradient(0, back.y - wallH * .9, 0, back.y); sea.addColorStop(0, '#1b72ad'); sea.addColorStop(1, '#46b0cf'); c.fillStyle = sea; c.fillRect(0, back.y - wallH * .9, W, wallH * .9);
      c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1.5; for (var w = 0; w < 3; w++) { var yy = back.y - wallH * (.7 - w * .22); c.beginPath(); for (var x = 0; x <= W; x += 10) c.lineTo(x, yy + Math.sin(x / 22 + w) * 2); c.stroke(); }
    } else {
      var g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, lounge ? '#1f150e' : '#0b1524'); g.addColorStop(1, lounge ? '#0f0a07' : '#070b12'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      var r = rng(11); for (var k = 0; k < 18; k++) { c.fillStyle = r() < .5 ? '#0e2a1b' : '#143823'; c.beginPath(); c.arc(r() * W, back.y - wallH * (.5 + r() * .7), H * (.025 + r() * .04), 0, 7); c.fill(); }
    }
    // lantai
    c.fillStyle = beach ? '#e9d1a0' : lounge ? '#2a2420' : '#18212d'; c.fillRect(0, back.y, W, H - back.y);
    c.strokeStyle = beach ? 'rgba(150,110,60,.12)' : 'rgba(255,255,255,.035)'; c.lineWidth = 1;
    if (!beach) { for (var u = -1; u <= 2; u += .12) seg(u, -.08, u, 1.3); for (var v = -.08; v <= 1.3; v += .1) seg(-1, v, 2, v); }
    else { var rs = rng(7); c.fillStyle = 'rgba(150,110,60,.22)'; for (var j = 0; j < 260; j++) { var q = P(-.2 + rs() * 1.4, -.08 + rs() * 1.3); c.fillRect(q.x, q.y, 2, 2); } }
    // permukaan main
    if (lounge) {
      [[.03, .97, .02, .44], [.03, .97, .56, .98]].forEach(function (z) { poly([[z[0], z[2]], [z[1], z[2]], [z[1], z[3]], [z[0], z[3]]]); c.fillStyle = '#3a3a33'; c.fill(); c.strokeStyle = '#c9a463'; c.lineWidth = 1.5; c.stroke(); });
    } else {
      var cg = c.createLinearGradient(0, back.y, 0, P(0, 1.08).y);
      if (beach) { cg.addColorStop(0, '#dcbd86'); cg.addColorStop(1, '#e7c992'); } else { cg.addColorStop(0, '#1a4fc4'); cg.addColorStop(1, '#2a6ff2'); }
      poly([[-.06, -.08], [1.06, -.08], [1.06, 1.08], [-.06, 1.08]]); c.fillStyle = cg; c.fill();
      if (!beach) { var mid = P(.5, .5), gl = c.createRadialGradient(mid.x, mid.y, 0, mid.x, mid.y, W * .6); gl.addColorStop(0, 'rgba(120,180,255,.22)'); gl.addColorStop(1, 'rgba(120,180,255,0)'); c.fillStyle = gl; c.fillRect(0, back.y, W, H); }
      c.save(); if (!beach) { c.shadowColor = 'rgba(255,255,255,.7)'; c.shadowBlur = 5; }
      c.strokeStyle = beach ? 'rgba(30,90,160,.85)' : 'rgba(255,255,255,.95)'; c.lineWidth = Math.max(1.5, W / 260);
      poly([[0, 0], [1, 0], [1, 1], [0, 1]]); c.stroke();
      var sl = 6.95 / 20; seg(0, .5 - sl, 1, .5 - sl); seg(0, .5 + sl, 1, .5 + sl); seg(.5, .5 - sl, .5, .5 + sl);   // padel 10 × 20 m
      c.restore();
    }
    // dinding belakang
    var a = P(-.06, -.08), b = P(1.06, -.08);
    if (beach) {
      c.strokeStyle = '#8a6a44'; c.lineWidth = 4; for (var t = 0; t <= 4; t++) { var px = a.x + (b.x - a.x) * t / 4; c.beginPath(); c.moveTo(px, a.y); c.lineTo(px, a.y - wallH * .45); c.stroke(); }
      c.strokeStyle = '#c9a77a'; c.lineWidth = 2; c.beginPath(); c.moveTo(a.x, a.y - wallH * .38); c.lineTo(b.x, b.y - wallH * .38); c.stroke();
      palm(c, W * .05, a.y + H * .02, H * .2, 1); palm(c, W * .95, a.y + H * .02, H * .18, -1);
      c.fillStyle = '#0A1628'; var bw = W * .5, bh = wallH * .36; c.fillRect(W / 2 - bw / 2, a.y - wallH - bh * .2, bw, bh); mark(W / 2 + bh * .2, a.y - wallH - bh * .2 + bh / 2, bh * .9, '#E8902F');
    } else if (lounge) {
      c.fillStyle = '#2c1d13'; c.fillRect(a.x, a.y - wallH * 1.1, b.x - a.x, wallH * 1.1);
      c.save(); c.shadowColor = 'rgba(255,170,80,.9)'; c.shadowBlur = 16; mark(W / 2 + wallH * .25, a.y - wallH * .62, wallH * .42, '#FFC27A'); c.restore();
      c.fillStyle = '#6b4429'; c.fillRect(a.x + (b.x - a.x) * .25, a.y - wallH * .2, (b.x - a.x) * .5, wallH * .2); glow(a.x + (b.x - a.x) * .25, a.y, a.x + (b.x - a.x) * .75, a.y, 2);
    } else {
      c.fillStyle = 'rgba(140,185,240,.10)'; c.fillRect(a.x, a.y - wallH, b.x - a.x, wallH);
      c.fillStyle = '#0a0e14'; for (var pn = 0; pn <= 4; pn++) { var xx = a.x + (b.x - a.x) * pn / 4; c.fillRect(xx - 2, a.y - wallH, 4, wallH); }
      c.fillRect(a.x, a.y - wallH - 3, b.x - a.x, 4);
      [.25, .75].forEach(function (f) { var sx = a.x + (b.x - a.x) * f; c.fillStyle = 'rgba(8,14,24,.55)'; c.fillRect(sx - (b.x - a.x) * .2, a.y - wallH * .62, (b.x - a.x) * .4, wallH * .3); mark(sx + wallH * .1, a.y - wallH * .47, wallH * .22, 'rgba(232,240,255,.92)'); });
      glow(a.x, a.y - 1, b.x, b.y - 1, 2);
    }
    // sisi kiri & kanan
    [-.06, 1.06].forEach(function (su) {
      var vs = [-.08, .16, .4, .64, .88, 1.08];
      for (var n = 0; n < vs.length - 1; n++) {
        var p1 = P(su, vs[n]), p2 = P(su, vs[n + 1]), h1 = H * .07 * p1.s, h2 = H * .07 * p2.s;
        if (beach) { c.strokeStyle = '#8a6a44'; c.lineWidth = 3; c.beginPath(); c.moveTo(p1.x, p1.y); c.lineTo(p1.x, p1.y - h1 * .6); c.stroke(); c.strokeStyle = '#c9a77a'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(p1.x, p1.y - h1 * .5); c.lineTo(p2.x, p2.y - h2 * .5); c.stroke(); continue; }
        if (lounge) continue;
        c.beginPath(); c.moveTo(p1.x, p1.y); c.lineTo(p2.x, p2.y); c.lineTo(p2.x, p2.y - h2); c.lineTo(p1.x, p1.y - h1); c.closePath(); c.fillStyle = 'rgba(14,20,30,.82)'; c.fill();
        c.fillStyle = '#0a0e14'; c.fillRect(p1.x - 2, p1.y - h1, 4, h1);
      }
      if (!beach && !lounge) { var e1 = P(su, -.08), e2 = P(su, 1.08); glow(e1.x, e1.y, e2.x, e2.y, 2); }
    });
    if (lounge) [[-.04, -.05], [1.04, -.05], [-.04, 1.1], [1.04, 1.1]].forEach(function (q) { plant(c, P(q[0], q[1]), H); });
    // net / pembatas tengah
    var n1 = P(-.06, .5), n2 = P(1.06, .5), nh = H * .045 * n1.s;
    if (lounge) {
      c.strokeStyle = '#a3243a'; c.lineWidth = 3; c.beginPath(); c.moveTo(n1.x, n1.y - nh * .8);
      for (var rp = 1; rp <= 4; rp++) { var pa = P(-.06 + 1.12 * (rp - .5) / 4, .5), pb = P(-.06 + 1.12 * rp / 4, .5); c.quadraticCurveTo(pa.x, pa.y - nh * .35, pb.x, pb.y - nh * .8); }
      c.stroke();
      for (var gp = 0; gp <= 4; gp++) { var gpp = P(-.06 + 1.12 * gp / 4, .5); c.strokeStyle = '#d9b26a'; c.lineWidth = 3; c.beginPath(); c.moveTo(gpp.x, gpp.y); c.lineTo(gpp.x, gpp.y - nh); c.stroke(); c.fillStyle = '#e8c27a'; c.beginPath(); c.arc(gpp.x, gpp.y - nh, 3.5, 0, 7); c.fill(); }
    } else {
      c.fillStyle = beach ? 'rgba(255,255,255,.22)' : 'rgba(6,10,18,.55)'; c.fillRect(n1.x, n1.y - nh, n2.x - n1.x, nh);
      c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 1; for (var m = 1; m < 30; m++) { var mx = n1.x + (n2.x - n1.x) * m / 30; c.beginPath(); c.moveTo(mx, n1.y); c.lineTo(mx, n1.y - nh); c.stroke(); }
      c.save(); c.strokeStyle = '#f7f9fc'; c.lineWidth = 3.5; c.shadowColor = 'rgba(255,255,255,.8)'; c.shadowBlur = beach ? 0 : 8; c.beginPath(); c.moveTo(n1.x, n1.y - nh); c.lineTo(n2.x, n2.y - nh); c.stroke(); c.restore();
      [n1, n2].forEach(function (p) { c.fillStyle = beach ? '#7b5530' : '#0d1219'; c.fillRect(p.x - 4, p.y - nh * 1.15, 8, nh * 1.15); });
    }
    // dinding depan
    var f1 = P(-.06, 1.12), f2 = P(1.06, 1.12), fh = H * .055;
    if (beach) { c.fillStyle = '#7b5530'; c.fillRect(0, f1.y - fh * .25, W, fh * .25); [.08, .92].forEach(function (fx) { lantern(c, W * fx, f1.y - fh * .25, fh); }); }
    else {
      c.fillStyle = '#0f141c'; c.fillRect(f1.x, f1.y - fh, f2.x - f1.x, fh); c.fillStyle = 'rgba(120,170,255,.25)'; c.fillRect(f1.x, f1.y - fh, f2.x - f1.x, 2);
      mark(W / 2 + fh * .25, f1.y - fh / 2, fh * .5, 'rgba(240,244,250,.92)'); glow(f1.x + 4, f1.y - 1, f2.x - 4, f2.y - 1, 2.5);
    }
    // vinyet
    var vg = c.createRadialGradient(W / 2, H * .5, Math.min(W, H) * .4, W / 2, H * .5, Math.max(W, H) * .75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.45)'); c.fillStyle = vg; c.fillRect(0, 0, W, H);
  }
  function palm(c, x, y, h, dir) {
    c.strokeStyle = '#7b5530'; c.lineWidth = Math.max(5, h * .06); c.lineCap = 'round';
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + dir * h * .25, y - h * .6, x + dir * h * .12, y - h); c.stroke();
    var tx = x + dir * h * .12, ty = y - h; c.fillStyle = '#2e7d4f';
    for (var k = 0; k < 6; k++) { c.save(); c.translate(tx, ty); c.rotate(-Math.PI / 2 + (k - 2.5) * .55); c.beginPath(); c.ellipse(h * .22, 0, h * .24, h * .05, 0, 0, 7); c.fill(); c.restore(); }
  }
  function plant(c, p, H) {
    var s = H * .035 * (p.s + .3); c.fillStyle = '#1b222c'; c.fillRect(p.x - s * .6, p.y - s * .7, s * 1.2, s * .7); c.fillStyle = '#2f7a45';
    for (var j = -3; j <= 3; j++) { c.save(); c.translate(p.x, p.y - s * .7); c.rotate(j * .28); c.beginPath(); c.ellipse(0, -s * .6, s * .11, s * .6, 0, 0, 7); c.fill(); c.restore(); }
  }
  function lantern(c, x, y, h) {
    c.save(); var gl = c.createRadialGradient(x, y - h * .6, 0, x, y - h * .6, h * 1.4); gl.addColorStop(0, 'rgba(255,200,120,.6)'); gl.addColorStop(1, 'rgba(255,200,120,0)');
    c.fillStyle = gl; c.fillRect(x - h * 1.5, y - h * 2, h * 3, h * 2.2); c.fillStyle = '#e6b25c'; c.beginPath(); c.ellipse(x, y - h * .55, h * .28, h * .4, 0, 0, 7); c.fill(); c.restore();
  }

  /* ---------- suara: musik lobi (marimba dari kode, tanpa file) & "ding" ---------- */
  var AC = null, music = null;
  function audio() {
    if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (AC.state === 'suspended') AC.resume();
    return AC;
  }
  function tone(f, delay, vol) {
    if (!AC || AC.state !== 'running') return;
    var t = AC.currentTime + (delay || 0), o = AC.createOscillator(), g = AC.createGain();
    o.type = 'triangle'; o.frequency.value = f;
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol || .2, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + .45);
    o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + .5);
  }
  function ding() { tone(880); tone(1320, .09); }
  var BPM = 116, STEP = 60 / BPM / 2;
  var MEL = [[72, 0, 67, 0, 69, 72, 0, 76], [74, 0, 72, 69, 67, 0, 64, 0], [65, 0, 69, 72, 0, 74, 72, 0], [71, 0, 67, 0, 74, 0, 72, 0],
    [72, 0, 67, 0, 69, 72, 0, 76], [79, 0, 76, 74, 72, 0, 69, 0], [65, 69, 72, 74, 76, 0, 74, 72], [72, 0, 0, 67, 72, 0, 0, 0]];
  var BASS = [48, 43, 41, 43, 48, 45, 41, 43];
  function midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }
  function note(t, f, vol, dur, type) {
    var o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(music.out); o.start(t); o.stop(t + dur + .02);
  }
  function beat(t, i) {
    var bar = Math.floor(i / 8) % 8, st = i % 8, n = MEL[bar][st];
    if (n) { note(t, midi(n), .15, .32, 'sine'); note(t, midi(n) * 4, .022, .08, 'sine'); }
    if (st === 0 || st === 4) note(t, midi(BASS[bar] + (st === 4 ? 7 : 0)), .13, .28, 'triangle');
    if (st % 2 === 1) {
      var len = .04, buf = AC.createBuffer(1, Math.floor(AC.sampleRate * len), AC.sampleRate), ch = buf.getChannelData(0);
      for (var k = 0; k < ch.length; k++) ch[k] = (Math.random() * 2 - 1) * (1 - k / ch.length);
      var s = AC.createBufferSource(), g = AC.createGain(), hp = AC.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6000; g.gain.value = .045;
      s.buffer = buf; s.connect(hp); hp.connect(g); g.connect(music.out); s.start(t);
    }
  }
  function musicOn(on) {
    if (on) {
      if (music || !audio()) return !!music;
      var out = AC.createGain(); out.gain.value = .6; out.connect(AC.destination);
      music = { out: out, i: 0, t: AC.currentTime + .05 };
      music.timer = setInterval(function () { while (music && music.t < AC.currentTime + .15) { beat(music.t, music.i++); music.t += STEP; } }, 30);
      return true;
    }
    if (music) { var m = music; music = null; clearInterval(m.timer); m.out.gain.setTargetAtTime(0, AC.currentTime, .15); setTimeout(function () { m.out.disconnect(); }, 800); }
    return false;
  }

  /* ---------- modal kecil & toast (lobi bisa dipakai di luar app) ---------- */
  function modal(title, html, buttons, after) {
    var s = document.createElement('div'); s.className = 'lb-scrim';
    s.innerHTML = '<div class="lb-modal" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><h3>' + esc(title) + '</h3>' + html + '<div class="acts">' +
      buttons.map(function (b, i) { return '<button class="lb-btn ' + (b.cls || '') + '" type="button" data-i="' + i + '">' + esc(b.label) + '</button>'; }).join('') + '</div></div>';
    var close = function () { s.remove(); document.removeEventListener('keydown', key); };
    var key = function (e) { if (e.key === 'Escape') close(); };
    s.addEventListener('click', function (e) {
      if (e.target === s) { close(); return; }
      var b = e.target.closest('[data-i]'); if (!b) return;
      close(); var f = buttons[+b.dataset.i].on; if (f) f();
    });
    document.addEventListener('keydown', key);
    document.body.appendChild(s);
    if (after) after(s); else { var last = s.querySelectorAll('[data-i]'); if (last.length) last[last.length - 1].focus(); }
    return { el: s, close: close };
  }
  var toastT = null;
  function toast(msg) {
    var t = document.querySelector('.lb-toast');
    if (!t) { t = document.createElement('div'); t.className = 'lb-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 2800);
  }
  function shareText(s, url) {
    var v = s.venue || {};
    return 'Yuk hadir di ' + s.name + '!\n' + (s.whenText || '') + '\n' + [v.name, v.address].filter(Boolean).join(' · ') +
      (v.maps ? '\nMaps: ' + v.maps : '') + '\n\nKonfirmasi hadir di lobi: ' + url;
  }
  function copyShare(s, url) {
    var text = shareText(s, url);
    var fallback = function () {
      modal('Salin ajakan', '<p>Salin teks ini lalu tempel di grup WhatsApp:</p><textarea class="lb-share" rows="8" style="width:100%;background:var(--bg-2,#0E1D33);color:inherit;border:1px solid var(--line-strong,rgba(242,235,221,.24));border-radius:10px;padding:10px;font:inherit">' + esc(text) + '</textarea>',
        [{ label: 'Tutup' }], function (m) { var ta = m.querySelector('textarea'); ta.focus(); ta.select(); });
    };
    try { navigator.clipboard.writeText(text).then(function () { toast('Link lobi dan ajakan bergabung sudah disalin. Tinggal tempel di WhatsApp.'); }, fallback); }
    catch (e) { fallback(); }
  }

  /* ============================================================
     mount(root, state, handlers) → { update(state), destroy() }
     state: { role:'host'|'player'|'public', meId, session:{name, kicker, whenText, startAt, venue:{name,address,maps}, url},
              theme, people:[{id,name,role:'player'|'host',sprite?,photo?,look?}], chat:[{id,pid,name,role,text,at}], started }
     handlers: join, leave, add, remove(pid), start, back, login, theme(id), chat(text), photo, share
     ============================================================ */
  function mount(root, state, handlers) {
    handlers = handlers || {};
    var S = null, ents = {}, order = 0, chatSeen = {}, unread = 0, raf = 0, lastT = 0, T = 0, W = 0, H = 0, LY = null, alive = true;
    var open = { roster: lsGet('paddoc_lb_roster') !== '0', chat: lsGet('paddoc_lb_chat') !== '0' };
    root.innerHTML =
      '<div class="lb">' +
      '<header class="lb-head"><img class="lb-logo" src="icon-192.png" alt="Logo Padel Doc">' +
      '<div class="lb-ttl"><div class="lb-kick" data-k="kick"></div><h1 data-k="name"></h1><div class="lb-meta">' +
      '<span>' + ic('cal') + '<span data-k="when"></span></span><span>' + ic('pin') + '<span data-k="venue"></span></span><span data-k="maps"></span></div></div>' +
      '<div class="lb-cd"><small>Sesi dimulai dalam</small><strong data-k="cd">--:--:--</strong></div></header>' +
      '<div class="lb-main"><div class="lb-stagecol">' +
      '<div class="lb-stage"><div class="lb-bg"></div><canvas class="lb-canvas"></canvas><div class="lb-motes"></div><div class="lb-layer"></div>' +
      '<div class="lb-chip tl"><span class="dot"></span><span class="n" data-k="cnt">0</span><span data-k="cntTxt">pemain hadir</span></div>' +
      '<div class="lb-chip tr"><label data-k="themeWrap"><span class="sr" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Tema lobi</span><select data-k="theme"></select></label>' +
      '<button type="button" class="lb-round" data-lb="music" aria-pressed="false" aria-label="Musik lobi" title="Musik lobi">' + ic('music') + '</button></div>' +
      '<div class="lb-started" data-k="started" hidden><div><h2>Sesi dimulai</h2><p data-k="startedTxt"></p>' +
      '<button class="lb-btn" type="button" data-lb="back" data-k="backBtn">' + ic('back') + 'Kembali ke Lobi</button></div></div></div>' +
      '<p class="lb-pubnote" data-k="pubnote" hidden>Kamu sedang menonton lobi. <b>Belum terdaftar?</b> Hubungi host atau admin untuk dibuatkan akun, lalu masuk untuk bergabung.</p>' +
      '<div class="lb-controls" data-k="controls"></div></div>' +
      '<aside class="lb-side">' +
      '<section class="lb-box" data-k="meBox" hidden></section>' +
      '<section class="lb-box"><button class="lb-boxh" type="button" data-lb="box" data-box="roster" aria-expanded="true">Hadir <span class="cnt" data-k="hN">0</span><span class="chev">' + ic('chev') + '</span></button>' +
      '<div class="lb-boxb" data-k="rosterBody"><div class="lb-roster" data-k="roster"></div></div></section>' +
      '<section class="lb-box"><button class="lb-boxh" type="button" data-lb="box" data-box="chat" aria-expanded="true">Chat <span class="badge" data-k="badge" hidden></span><span class="chev">' + ic('chev') + '</span></button>' +
      '<div class="lb-boxb" data-k="chatBody"><div class="lb-chat"><ul class="lb-msgs" data-k="msgs" aria-live="polite"></ul>' +
      '<form class="lb-send" data-k="send"><input data-k="input" maxlength="200" autocomplete="off" placeholder="Tulis pesan untuk semua yang hadir" aria-label="Pesan chat"><button class="lb-btn" type="submit" aria-label="Kirim">' + ic('send') + '</button></form>' +
      '<p class="lb-empty" data-k="chatNote" hidden></p></div></div></section>' +
      '</aside></div></div>';
    var el = {}; root.querySelectorAll('[data-k]').forEach(function (n) { el[n.dataset.k] = n; });
    var stage = root.querySelector('.lb-stage'), bg = root.querySelector('.lb-bg'), cv = root.querySelector('.lb-canvas'), layer = root.querySelector('.lb-layer');
    var cx = cv.getContext('2d');
    el.theme.innerHTML = Object.keys(THEMES).map(function (k) { var t = THEMES[k]; return '<option value="' + k + '"' + (t.soon ? ' disabled' : '') + '>' + esc(t.name) + (t.soon ? ' (segera)' : '') + '</option>'; }).join('');
    if (!REDUCE) {
      var motes = root.querySelector('.lb-motes');
      for (var k = 0; k < 22; k++) {
        var m = document.createElement('i');
        m.style.cssText = 'left:' + ((k % 2 ? 60 : 6) + Math.random() * 34) + '%;top:' + (10 + Math.random() * 70) + '%;animation-duration:' + (7 + Math.random() * 9) + 's;animation-delay:' + (-Math.random() * 12) + 's;opacity:' + (.3 + Math.random() * .5);
        motes.appendChild(m);
      }
    }
    syncBoxes();

    /* --- tata letak panggung --- */
    function relayout(force) {
      var w = stage.clientWidth, h = stage.clientHeight;
      if (!w || !h) return;
      var prev = LY ? LY.mode + LY.theme : '';
      W = w; H = h; LY = layoutFor(S.theme, W, H); LY.theme = S.theme;
      var SH = LY.SH, SW = SH * 64 / 96;
      stage.style.setProperty('--sh', SH + 'px'); stage.style.setProperty('--sw', SW + 'px');
      LY.SW = SW;
      if (LY.mode === 'land') { bg.style.backgroundImage = 'url("' + LY.img + '")'; cv.hidden = true; }
      else {
        bg.style.backgroundImage = ''; cv.hidden = false;
        var dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = W * dpr; cv.height = H * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawPortrait(cx, W, H, LY.proj, S.theme);
      }
      if (force || prev !== LY.mode + LY.theme) Object.keys(ents).forEach(function (id) { var e = ents[id]; if (e.el) { place(e); e.state = 'idle'; e.el.classList.remove('walking'); } });
      Object.keys(ents).forEach(function (id) { if (ents[id].el) draw(ents[id]); });
    }
    function spotOf(e) {
      if (e.role === 'host') return [LY.hosts[e.hostIdx % LY.hosts.length]];
      return LY.zones[e.side];
    }
    function randIn(zs) {
      var tot = 0; zs.forEach(function (z) { tot += (z[1] - z[0]) * (z[3] - z[2]); });
      var r = Math.random() * tot, z = zs[0];
      for (var i = 0; i < zs.length; i++) { r -= (zs[i][1] - zs[i][0]) * (zs[i][3] - zs[i][2]); if (r <= 0) { z = zs[i]; break; } }
      return [rand(z[0], z[1]), rand(z[2], z[3])];
    }
    function place(e) { var p = randIn(spotOf(e)); e.u = p[0]; e.v = p[1]; }
    function target(e) { var p = randIn(spotOf(e)); e.tu = p[0]; e.tv = p[1]; }
    function draw(e) {
      var P = LY.proj(e.u, e.v), walking = e.state === 'walk';
      var bob = REDUCE ? 0 : walking ? -Math.abs(Math.sin(T * 10 + e.ph)) * 3 : Math.sin(T * 2.6 + e.ph) * 1.2;
      e.el.style.transform = 'translate3d(' + (P.x - LY.SW / 2).toFixed(1) + 'px,' + (P.y - LY.SH + e.dropY + bob).toFixed(1) + 'px,0) scale(' + P.s.toFixed(3) + ')';
      var z = 100 + Math.round(e.v * 1000);
      if (z !== e.z) { e.z = z; e.el.style.zIndex = z; }
    }
    function dust(e) {
      var P = LY.proj(e.u, e.v), d = document.createElement('div');
      d.className = 'lb-dust'; d.style.left = P.x + 'px'; d.style.top = P.y + 'px'; d.style.zIndex = 99 + Math.round(e.v * 1000);
      layer.appendChild(d); setTimeout(function () { d.remove(); }, 700);
    }
    function say(e, text, cls, ms) {
      if (!e || !e.el) return;
      var b = e.el.querySelector('.bub'); b.textContent = text; b.className = 'bub show' + (cls ? ' ' + cls : '');
      clearTimeout(e.bt); e.bt = setTimeout(function () { b.classList.remove('show'); }, ms || 2200);
    }
    function act(e, cls) { if (REDUCE || !e.el) return; e.el.classList.remove(cls); void e.el.offsetWidth; e.el.classList.add(cls); setTimeout(function () { if (e.el) e.el.classList.remove(cls); }, 600); }
    var BUBBLES = ['Gas!', 'Siap main', 'Pemanasan dulu', 'Court berapa?', 'Bola baru?', 'Partner siapa ya?', 'Kaki sudah panas', 'Bandeja!', 'Vibora!'];
    var HOSTSAY = ['Yang belum hadir, ditunggu ya', 'Cek raket dan sepatu', 'Sebentar lagi mulai', 'Air minum di bench'];
    function makeEl(e) {
      var d = document.createElement('div');
      d.className = 'lb-sprite' + (e.role === 'host' ? ' host' : '') + (e.id === S.meId ? ' me' : '') + (e.p.sprite ? ' png' : '');
      d.innerHTML = '<div class="sh"></div><div class="fig">' + figure(e.p) + '</div><div class="tag">' + (e.role === 'host' ? 'HOST · ' : '') + esc(e.p.name) + '</div><div class="bub"></div>';
      d.addEventListener('click', function () { act(e, 'jump'); say(e, e.role === 'host' ? pick(Math.random, HOSTSAY) : pick(Math.random, BUBBLES)); });
      layer.appendChild(d); e.el = d;
    }
    function enter(p, quiet) {
      var nA = 0, nB = 0, nH = 0;
      Object.keys(ents).forEach(function (id) { var x = ents[id]; if (x.role === 'host') nH++; else if (x.side === 'A') nA++; else nB++; });
      var e = { id: p.id, p: p, role: p.role === 'host' ? 'host' : 'player', side: nA <= nB ? 'A' : 'B', hostIdx: nH, at: ++order,
        u: .5, v: .5, tu: .5, tv: .5, state: 'idle', timer: rand(.5, 3), dropY: 0, vy: 0, ph: Math.random() * 6, el: null, z: 0 };
      ents[p.id] = e; place(e); makeEl(e);
      if (quiet || REDUCE) draw(e);
      else { e.state = 'drop'; e.dropY = -(LY.proj(e.u, e.v).y + LY.SH * 1.5); e.vy = 0; draw(e); ding(); }
    }
    function exit(id) {
      var e = ents[id]; delete ents[id];
      if (e && e.el) { var d = e.el; e.el = null; d.classList.add('out'); setTimeout(function () { d.remove(); }, 480); }
    }
    function step(e, dt) {
      if (!e.el) return;
      if (e.state === 'drop') {
        e.vy += 2600 * dt; e.dropY += e.vy * dt;
        if (e.dropY >= 0) { e.dropY = 0; e.state = 'idle'; e.timer = rand(1, 2.5); act(e, 'land'); dust(e); say(e, 'Hadir!'); }
      } else if (e.state === 'walk') {
        var du = (e.tu - e.u) * 20, dv = (e.tv - e.v) * 10, d = Math.hypot(du, dv), sp = 1.7 * dt;
        if (d <= sp) { e.u = e.tu; e.v = e.tv; e.state = 'idle'; e.timer = rand(1.2, 4); e.el.classList.remove('walking'); }
        else { e.u += du / d * sp / 20; e.v += dv / d * sp / 10; if (Math.abs(du) > .05) e.el.classList.toggle('flip', du < 0); }
      } else if (!REDUCE && !S.started) {
        e.timer -= dt;
        if (e.timer <= 0) {
          e.timer = rand(1.5, 4.5);
          var r = Math.random();
          if (r < .6) { target(e); e.state = 'walk'; e.el.classList.add('walking'); }
          else if (r < .75) act(e, 'swing');
          else if (r < .85) act(e, 'jump');
          else say(e, e.role === 'host' ? pick(Math.random, HOSTSAY) : pick(Math.random, BUBBLES));
        }
      }
      draw(e);
    }
    function loop(t) {
      if (!alive) return;
      var dt = Math.min(.05, (t - lastT) / 1000); lastT = t; T += dt;
      if (LY) for (var id in ents) step(ents[id], dt);
      if (handlers.frame) handlers.frame(t);
      raf = requestAnimationFrame(loop);
    }

    /* --- panel & tombol --- */
    function syncBoxes() {
      [['roster', el.rosterBody], ['chat', el.chatBody]].forEach(function (b) {
        var btn = root.querySelector('[data-box="' + b[0] + '"]'); btn.setAttribute('aria-expanded', String(open[b[0]])); b[1].hidden = !open[b[0]];
      });
      if (open.chat) { unread = 0; el.badge.hidden = true; }
    }
    function people() { return S.people || []; }
    function renderInfo() {
      var s = S.session || {}, v = s.venue || {};
      el.kick.textContent = s.kicker || 'Ruang tunggu';
      el.name.textContent = s.name || 'Sesi Paddoc';
      el.when.textContent = s.whenText || 'Jadwal belum diisi';
      el.venue.textContent = [v.name, v.address].filter(Boolean).join(' · ') || 'Venue belum diisi';
      el.maps.innerHTML = v.maps ? '<a href="' + esc(v.maps) + '" target="_blank" rel="noopener">Buka Google Maps</a>' : '';
      el.theme.value = S.theme;
    }
    function renderCount() {
      var pl = people().filter(function (p) { return p.role !== 'host'; }).length, ho = people().length - pl;
      el.cnt.textContent = pl; el.cntTxt.textContent = 'pemain · ' + ho + ' host hadir'; el.hN.textContent = people().length;
    }
    function renderRoster() {
      var list = people().slice().sort(function (a, b) { return (a.role === 'host' ? 0 : 1) - (b.role === 'host' ? 0 : 1) || ((ents[b.id] || {}).at || 0) - ((ents[a.id] || {}).at || 0); });
      el.roster.innerHTML = list.length ? list.map(function (p) {
        return '<div class="lb-row' + (p.role === 'host' ? ' host' : '') + '">' + head(p) + '<span class="lb-nm">' + esc(p.name) + '<small>' + (p.role === 'host' ? 'Host · wasit' : p.id === S.meId ? 'Kamu' : 'Pemain') + '</small></span>' +
          (S.role === 'host' && !S.started ? '<button class="lb-x" type="button" data-lb="remove" data-pid="' + esc(p.id) + '" aria-label="Tandai ' + esc(p.name) + ' tidak hadir" title="Tandai tidak hadir">' + ic('x') + '</button>' : '<span></span>') + '</div>';
      }).join('') : '<p class="lb-empty">Belum ada yang hadir. Bagikan link lobi ke grup.</p>';
    }
    function renderControls() {
      var me = S.meId && people().some(function (p) { return p.id === S.meId; }), pl = people().filter(function (p) { return p.role !== 'host'; }).length, h = '';
      // tombol kecil: di HP tegak hanya ikon (label tetap dibaca pembaca layar)
      var small = function (act, icon, label) { return '<button class="lb-btn sm" type="button" data-lb="' + act + '" aria-label="' + label + '" title="' + label + '">' + ic(icon) + '<span class="lbl">' + label + '</span></button>'; };
      if (S.role === 'host') h = small('share', 'share', 'Bagikan lobi') + small('add', 'plus', 'Tambah yang hadir') +
        (S.meId ? (me ? small('leave', 'x', 'Saya batal hadir') : small('join', 'check', 'Saya hadir')) : '') +
        '<button class="lb-btn primary grow" type="button" data-lb="start"' + (pl < 4 || S.started ? ' disabled' : '') + '>' + ic('play') + 'Mulai Sesi</button>';
      else if (S.role === 'player') h = (me ? '<button class="lb-btn danger grow" type="button" data-lb="leave">Batal Bergabung</button>' : '<button class="lb-btn join grow" type="button" data-lb="join">' + ic('check') + 'Saya Bergabung</button>') +
        small('share', 'share', 'Bagikan lobi');
      else h = '<p class="lb-note">Kamu sedang menonton lobi. <b>Belum terdaftar?</b> Hubungi host atau admin untuk dibuatkan akun, lalu masuk untuk bergabung.</p>' +
        '<button class="lb-btn grow" type="button" data-lb="login">' + ic('login') + 'Masuk</button>' + small('share', 'share', 'Bagikan lobi');
      el.controls.innerHTML = h;
      el.pubnote.hidden = S.role !== 'public';
      el.themeWrap.hidden = S.role !== 'host';
      el.started.hidden = !S.started;
      el.startedTxt.textContent = S.role === 'host' ? 'Lobi ditutup untuk semua orang. Salah tekan? Kembali ke lobi selama belum ada match yang dimulai.' : 'Lobi ditutup. Tunggu panggilan court dari host.';
      el.backBtn.hidden = S.role !== 'host';
      var mp = S.meId && people().filter(function (p) { return p.id === S.meId; })[0];
      var meP = mp || (S.me || null);
      el.meBox.hidden = !(S.role !== 'public' && meP);
      if (!el.meBox.hidden) el.meBox.innerHTML = '<div class="lb-me"><div class="big">' + figure(meP) + '</div><div><b>Avatar kamu</b><p>Avatar dibuat dari foto profilmu. Mau tampilan baru? Ganti foto profil, admin yang membuat ulang avatarnya.</p>' +
        '<button class="lb-btn" type="button" data-lb="photo">' + ic('camera') + 'Ganti foto profil</button></div></div>';
    }
    function renderChat(quiet) {
      var canChat = S.role !== 'public';
      el.send.hidden = !canChat || S.started; el.msgs.hidden = !canChat;
      el.chatNote.hidden = canChat; el.chatNote.textContent = 'Masuk untuk melihat dan ikut chat dengan yang hadir.';
      if (!canChat) return;
      var list = S.chat || [], atBottom = el.msgs.scrollHeight - el.msgs.scrollTop - el.msgs.clientHeight < 40, added = 0;
      list.forEach(function (c) {
        if (chatSeen[c.id]) return;
        chatSeen[c.id] = 1; added++;
        var li = document.createElement('li'); li.className = 'lb-msg' + (c.pid === S.meId ? ' mine' : '');
        var p = people().filter(function (x) { return x.id === c.pid; })[0] || { name: c.name, role: c.role };
        li.innerHTML = head(p) + '<div><b class="' + (c.role === 'host' ? 'host' : '') + '">' + esc(c.name) + '</b><time>' + hhmm(c.at) + '</time><p>' + esc(c.text) + '</p></div>';
        el.msgs.appendChild(li);
        if (!quiet) { say(ents[c.pid], c.text.length > 60 ? c.text.slice(0, 58) + '…' : c.text, 'chat', 4500); if (!open.chat && c.pid !== S.meId) unread++; }
      });
      while (el.msgs.children.length > 120) el.msgs.removeChild(el.msgs.firstChild);
      if (added && (atBottom || quiet)) el.msgs.scrollTop = el.msgs.scrollHeight;
      el.badge.hidden = !unread; el.badge.textContent = unread;
    }
    function countdown() {
      var at = S && S.session && S.session.startAt;
      if (!at) { el.cd.textContent = '—'; return; }
      var ms = at - Date.now();
      if (ms <= 0) { el.cd.textContent = 'Waktunya mulai'; el.cd.classList.add('now'); return; }
      el.cd.classList.remove('now');
      var s = Math.floor(ms / 1000), d = Math.floor(s / 86400), hh = Math.floor(s % 86400 / 3600), mm = Math.floor(s % 3600 / 60), ss = s % 60;
      el.cd.textContent = (d ? d + ' hari ' : '') + [hh, mm, ss].map(function (n) { return ('0' + n).slice(-2); }).join(':');
    }
    var cdT = setInterval(countdown, 1000);

    function confirmStart() {
      var pl = people().filter(function (p) { return p.role !== 'host'; }).length, ho = people().length - pl;
      modal('Mulai sesi sekarang?', '<p><b>' + pl + ' pemain</b> dan <b>' + ho + ' host</b> hadir. Lobi ditutup untuk semua orang dan undian court pertama langsung dibuat.</p>',
        [{ label: 'Batal' }, { label: 'Ya, mulai sesi', cls: 'primary', on: function () { if (handlers.start) handlers.start(); } }]);
    }
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-lb]'); if (!b || b.disabled) return;
      var a = b.dataset.lb;
      audio();                                          // ketukan pertama membuka izin suara HP
      if (a === 'box') { var n = b.dataset.box; open[n] = !open[n]; lsSet('paddoc_lb_' + n, open[n] ? '1' : '0'); syncBoxes(); if (n === 'chat' && open.chat) el.msgs.scrollTop = el.msgs.scrollHeight; }
      else if (a === 'music') { var on = musicOn(!music); b.setAttribute('aria-pressed', String(on)); lsSet('paddoc_lb_music', on ? '1' : '0'); }
      else if (a === 'share') { if (handlers.share) handlers.share(); else copyShare(S.session || {}, (S.session && S.session.url) || location.href); }
      else if (a === 'start') confirmStart();
      else if (a === 'remove') { var p = people().filter(function (x) { return x.id === b.dataset.pid; })[0]; if (p && handlers.remove) handlers.remove(p.id); }
      else if (handlers[a]) handlers[a]();
    });
    root.addEventListener('pointerdown', function first(ev) {
      root.removeEventListener('pointerdown', first);
      if (ev.target.closest('[data-lb="music"]')) return;            // tombol musik mengatur sendiri
      if (lsGet('paddoc_lb_music') === '1' && !S.started && musicOn(true)) root.querySelector('[data-lb="music"]').setAttribute('aria-pressed', 'true');
    });
    el.theme.addEventListener('change', function () { if (handlers.theme) handlers.theme(el.theme.value); });
    el.send.addEventListener('submit', function (e) {
      e.preventDefault();
      var t = el.input.value.trim(); if (!t) return;
      el.input.value = '';
      if (handlers.chat) handlers.chat(t.slice(0, 200));
    });
    var ro = window.ResizeObserver ? new ResizeObserver(function () { relayout(false); }) : null;
    if (ro) ro.observe(stage); else window.addEventListener('resize', function () { relayout(false); });
    var vis = function () { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else if (!raf && alive) { lastT = performance.now(); raf = requestAnimationFrame(loop); } };
    document.addEventListener('visibilitychange', vis);

    function update(next, opts) {
      var first = !S, prevTheme = S && S.theme;
      S = Object.assign({}, S || {}, next);
      if (first || prevTheme !== S.theme) relayout(true);
      var now = {}; people().forEach(function (p) { now[p.id] = p; });
      Object.keys(ents).forEach(function (id) { if (!now[id]) exit(id); });
      people().forEach(function (p) {
        var e = ents[p.id];
        if (!e) { if (LY) enter(p, first || (opts && opts.quiet)); }
        else if (e.p.sprite !== p.sprite || (!p.sprite && JSON.stringify(e.p.look) !== JSON.stringify(p.look))) { e.p = p; e.el.querySelector('.fig').innerHTML = figure(p); e.el.classList.toggle('png', !!p.sprite); }
        else e.p = p;
      });
      if (S.started) { musicOn(false); var mb = root.querySelector('[data-lb="music"]'); if (mb) mb.setAttribute('aria-pressed', 'false'); }
      renderInfo(); renderCount(); renderRoster(); renderControls(); renderChat(first); countdown();
    }
    update(state);
    if (!LY) requestAnimationFrame(function () { relayout(true); people().forEach(function (p) { if (!ents[p.id]) enter(p, true); }); renderRoster(); });
    lastT = performance.now(); raf = requestAnimationFrame(loop);

    return {
      root: root,
      update: update,
      say: function (pid, text) { say(ents[pid], text, 'chat', 4500); },
      destroy: function () {
        alive = false; cancelAnimationFrame(raf); clearInterval(cdT); musicOn(false);
        if (ro) ro.disconnect(); document.removeEventListener('visibilitychange', vis); root.innerHTML = '';
      }
    };
  }

  /* ============================================================
     Pratinjau dengan data dummy: ?lobby=demo
     ============================================================ */
  function demo(root) {
    var NAMES = [['Andi', 0], ['Rizky', 0], ['Dewi', 1, 1], ['Fajar', 0], ['Sinta', 1, 1], ['Budi', 0], ['Nadia', 1], ['Hendra', 0], ['Ayu', 1, 1], ['Yoga', 0],
      ['Rina', 1, 1], ['Dimas', 0], ['Putri', 1], ['Agus', 0], ['Laila', 1, 1], ['Reza', 0], ['Wulan', 1, 1], ['Teguh', 0], ['Mega', 1], ['Iqbal', 0],
      ['Salsa', 1, 1], ['Bayu', 0], ['Indah', 1, 1], ['Gilang', 0], ['Tasya', 1], ['Arif', 0], ['Nurul', 1, 1], ['Fikri', 0], ['Citra', 1, 1]];
    var NOAV = { Yoga: 1, Mega: 1, Arif: 1, Citra: 1 };
    var pool = NAMES.map(function (n, i) { return { id: 'p' + i, name: n[0], role: 'player', look: NOAV[n[0]] ? null : look(i + 1, n[1], n[2]) }; });
    var me = { id: 'me', name: 'Kamu', role: 'player', look: look(99, 0, 0) };
    var hosts = [{ id: 'h0', name: 'Rudi', role: 'host', look: refLook(1) }, { id: 'h1', name: 'Sari', role: 'host', look: refLook(2) }];
    var present = [hosts[0]].concat(pool.slice().sort(function () { return Math.random() - .5; }).slice(0, 14));
    var SAY = ['Otw 10 menit lagi ya', 'Ada yang bawa bola baru?', 'Siap gas malam ini!', 'Parkir di mana ya?', 'Saya agak telat 5 menit', 'Mantap, ramai!', 'Jangan lupa air minum'];
    var chat = [{ id: 'c1', pid: 'h0', name: 'Rudi', role: 'host', text: 'Selamat datang di lobi! Konfirmasi hadir ya.', at: Date.now() - 600000 }];
    var cid = 2, role = 'host';
    var meOf = function () { return role === 'host' ? hosts[0] : me; };   // host pratinjau = Rudi
    var startAt = Date.now() + (2 * 3600 + 14 * 60 + 5) * 1000;
    var d = new Date(startAt);
    var whenText = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ' · ' + ('0' + d.getHours()).slice(-2) + '.' + ('0' + d.getMinutes()).slice(-2);
    root.innerHTML = '<div class="lb-demo" style="margin:12px max(16px,env(safe-area-inset-right,0px)) 0 max(16px,env(safe-area-inset-left,0px))"><b>Pratinjau</b><span>Lihat sebagai</span>' +
      '<div class="lb-seg"><button type="button" data-r="host" aria-pressed="true">Host / admin</button><button type="button" data-r="player" aria-pressed="false">Pemain</button><button type="button" data-r="public" aria-pressed="false">Publik</button></div>' +
      '<button class="lb-btn" type="button" data-s="join">+ Pemain bergabung</button><button class="lb-btn" type="button" data-s="fill">Isi sampai 30</button>' +
      '<button class="lb-btn" type="button" data-s="chat">Simulasi chat</button><button class="lb-btn" type="button" data-s="clear">Kosongkan</button>' +
      '<span class="sp"></span><span class="lb-fps" data-s="fps">– fps</span></div><div class="lb-demo-host"></div>';
    var fpsEl = root.querySelector('[data-s="fps"]'), frames = 0, fpsT = performance.now();
    var state = function () {
      return { role: role, meId: role === 'public' ? null : meOf().id, me: meOf(), theme: inst ? cur.theme : 'court', started: inst ? cur.started : false,
        session: { name: 'Paddoc Selasa Malam', kicker: 'Ruang tunggu · Americano · 3 court', whenText: whenText + ' WIB', startAt: startAt,
          venue: { name: 'Padel Doc Arena', address: 'Jl. Siliwangi No. 12, Tasikmalaya', maps: 'https://www.google.com/maps/search/?api=1&query=Padel%20Doc%20Arena%20Tasikmalaya' },
          url: location.origin + location.pathname + '?lobby=demo' },
        people: present.slice(), chat: chat.slice() };
    };
    var cur = { theme: 'court', started: false }, inst = null;
    var push = function () { inst.update(state()); };
    var waiting = function () { return pool.filter(function (p) { return present.indexOf(p) < 0; }); };
    var h = {
      join: function () { if (present.indexOf(meOf()) < 0) present.push(meOf()); push(); },
      leave: function () { var m = meOf(); present = present.filter(function (p) { return p !== m; }); push(); },
      remove: function (pid) { present = present.filter(function (p) { return p.id !== pid; }); push(); toast('Ditandai tidak hadir'); },
      add: function () {
        var w = waiting();
        var m = modal('Tambah yang hadir', w.length ? '<p>Pemain yang pasti datang bisa dimasukkan host langsung.</p><div class="lb-pick">' +
          w.map(function (p) { return '<button type="button" data-add="' + p.id + '">' + head(p) + '<span class="lb-nm">' + esc(p.name) + '</span><span style="color:#4FD18B;font-weight:800">+ Hadir</span></button>'; }).join('') + '</div>'
          : '<p>Semua pemain sudah hadir.</p>', [{ label: 'Selesai' }]);
        m.el.querySelectorAll('[data-add]').forEach(function (b) { b.addEventListener('click', function () { present.push(pool.filter(function (p) { return p.id === b.dataset.add; })[0]); b.remove(); push(); }); });
      },
      start: function () { cur.started = true; push(); },
      back: function () { cur.started = false; push(); },
      theme: function (id) { cur.theme = id; push(); },
      chat: function (text) { var m = meOf(); chat.push({ id: 'c' + cid++, pid: m.id, name: m.name, role: m.role, text: text, at: Date.now() }); push(); },
      login: function () { toast('Pratinjau: tombol ini membuka halaman masuk.'); },
      photo: function () { toast('Pratinjau: membuka pilihan foto profil.'); },
      frame: function (t) { frames++; if (t - fpsT > 1000) { fpsEl.textContent = Math.round(frames * 1000 / (t - fpsT)) + ' fps · ' + present.length + ' karakter'; frames = 0; fpsT = t; } }
    };
    inst = mount(root.querySelector('.lb-demo-host'), state(), h);
    root.querySelector('.lb-demo').addEventListener('click', function (e) {
      var r = e.target.closest('[data-r]'), s = e.target.closest('[data-s]');
      if (r) { role = r.dataset.r; root.querySelectorAll('[data-r]').forEach(function (b) { b.setAttribute('aria-pressed', String(b === r)); }); push(); }
      if (!s) return;
      if (s.dataset.s === 'join') { var w = waiting(), hs = hosts.filter(function (x) { return present.indexOf(x) < 0; }); if (hs.length && Math.random() < .3) present.push(hs[0]); else if (w.length) present.push(w[Math.floor(Math.random() * w.length)]); push(); }
      else if (s.dataset.s === 'fill') { hosts.forEach(function (x) { if (present.indexOf(x) < 0) present.push(x); }); push(); waiting().forEach(function (p, i) { setTimeout(function () { present.push(p); push(); }, 140 * (i + 1)); }); }
      else if (s.dataset.s === 'chat') { var who = present.filter(function (p) { return p !== me; }); if (!who.length) return; var p = who[Math.floor(Math.random() * who.length)]; chat.push({ id: 'c' + cid++, pid: p.id, name: p.name, role: p.role, text: pick(Math.random, SAY), at: Date.now() }); push(); }
      else if (s.dataset.s === 'clear') { present = present.filter(function (p) { return p === me && role !== 'public'; }); push(); }
    });
    return inst;
  }

  return { mount: mount, demo: demo, THEMES: THEMES, shareText: shareText, look: look, refLook: refLook, musicOn: musicOn };
})();
if (typeof module !== 'undefined') module.exports = Lobby;
