/* Paddoc Host · Power Cup — motion graphic 1080×1920, digambar deterministik: draw(t) */
'use strict';
const W = 1080, H = 1920, FPS = 30;
const SPEED = 1.15;   // >1 = semua gerak lebih cepat (durasi video = timeline / SPEED)
const cv = document.getElementById('c');
const X = cv.getContext('2d');

const C = {
  bg: '#0A1628', bg2: '#0E1D33', surf: '#13263F', surf2: '#1A3253', acc: '#E8902F', acc2: '#CF7419',
  gold: '#F2C14E', cream: '#F2EBDD', muted: '#9CAEC4', red: '#EE6F5F', plus: '#5DD39E', ink: '#1E1206',
  silver: '#C9D3DE', bronze: '#D49163', blue: '#5BA8E8', wa: '#25D366'
};
const COURTS = [
  { c: '#2E7D4F', d: '#1D5636', v: 1 },
  { c: '#D9732B', d: '#9C4A12', v: 2 },
  { c: '#2A6AAE', d: '#184B82', v: 3 }
];
const NM = {
  lulu: 'Lulu', rezaerlangga: 'Reza', herry: 'Herry', nina: 'Nina', farid: 'Farid', wuluh: 'Wuluh', max: 'Max',
  yeninila: 'Yeni', sisil: 'Sisil', aria: 'Aria', dianty: 'Dianty', dani: 'Dani', toha: 'Toha', nandya: 'Nandya',
  adya: 'Adya', pandjispa: 'Pandji', pandjispb: 'Pandji B', cindera: 'Cindera', faritsi: 'Faritsi', omdok: 'Omdok',
  aziz: 'Aziz', euis: 'Euis'
};
const TEAM = {
  LR: ['lulu', 'rezaerlangga'], HN: ['herry', 'nina'], FW: ['farid', 'wuluh'],
  MY: ['max', 'yeninila'], SA: ['sisil', 'aria'], DD: ['dianty', 'dani']
};
const tname = (k) => NM[TEAM[k][0]] + ' & ' + NM[TEAM[k][1]];
const PLAYER_COUNT = 23;   // pemain aktif (peran pemain) di database Paddoc Host

/* ---------- util ---------- */
const cl = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const P = (t, a, d) => cl((t - a) / d);
const E = {
  out: (t) => 1 - Math.pow(1 - t, 3),
  out5: (t) => 1 - Math.pow(1 - t, 5),
  in: (t) => t * t * t,
  io: (t) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  back: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  el: (t) => t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - .75) * (2 * Math.PI / 3)) + 1
};
function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; }
function mixHex(h1, h2, t) {
  const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
  const r = Math.round(lerp(a >> 16 & 255, b >> 16 & 255, t)), g = Math.round(lerp(a >> 8 & 255, b >> 8 & 255, t)), bl = Math.round(lerp(a & 255, b & 255, t));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}

/* ---------- aset ---------- */
const IMG = {};
function load(k, src) {
  return new Promise((r) => { const i = new Image(); i.onload = () => { IMG[k] = i; r(); }; i.onerror = () => { console.error('gagal muat', src); r(); }; i.src = src; });
}
const CARD_KEYS = ['back', 'block', 'double', 'free15', 'free30', 'golden', 'noglass', 'nosmash', 'pick', 'reverse', 'steal', 'swap', 'swh', 'zonk'];
const PHOTO_KEYS = ['herry', 'sisil', 'max'];

/* ---------- gambar dasar ---------- */
function rr(x, y, w, h, r) { X.beginPath(); X.roundRect(x, y, w, h, r); }
function font(sz, fam, w) { X.font = `${w || (fam === 'BSD' ? 900 : 700)} ${sz}px ${fam === 'BSD' ? 'BSD' : 'PJS'}, "Noto Color Emoji"`; }
function txt(s, x, y, o = {}) {
  const sz = o.sz || 48, fam = o.fam || 'PJS';
  X.save();
  X.globalAlpha *= (o.a ?? 1);
  font(sz, fam, o.w);
  X.textAlign = o.al || 'center';
  X.textBaseline = o.bl || 'middle';
  X.letterSpacing = (o.ls || 0) + 'px';
  if (o.shadow !== false) { X.shadowColor = 'rgba(0,0,0,.45)'; X.shadowBlur = o.blur ?? 18; X.shadowOffsetY = 4; }
  if (o.glow) { X.shadowColor = o.glow; X.shadowBlur = o.glowB || 40; X.shadowOffsetY = 0; }
  if (o.stroke) { X.lineJoin = 'round'; X.lineWidth = o.sw || 10; X.strokeStyle = o.stroke; X.strokeText(s, x, y); X.shadowColor = 'transparent'; }
  X.fillStyle = o.col || C.cream;
  X.fillText(s, x, y);
  X.restore();
}
function tw(s, sz, fam, w, ls) { X.save(); font(sz, fam, w); X.letterSpacing = (ls || 0) + 'px'; const m = X.measureText(s).width; X.restore(); return m; }

/* teks kaya: [[...]] disorot, dibungkus otomatis */
function rich(s, x, y, maxW, o = {}) {
  const sz = o.sz || 44, lh = o.lh || sz * 1.38, fam = o.fam || 'PJS', wgt = o.w || 700;
  const col = o.col || C.cream, hl = o.hl || C.gold;
  const words = [];
  s.split(/(\[\[.*?\]\])/).forEach((seg) => {
    if (!seg) return;
    const h = seg.startsWith('[[');
    const body = h ? seg.slice(2, -2) : seg;
    body.split(/(\s+)/).forEach((w) => { if (w) words.push({ w, c: h ? hl : col, sp: /^\s+$/.test(w) }); });
  });
  X.save();
  font(sz, fam, wgt);
  const lines = [[]]; let cur = 0;
  words.forEach((wd) => {
    const m = X.measureText(wd.w).width;
    if (!wd.sp && cur + m > maxW && lines[lines.length - 1].length) { lines.push([]); cur = 0; }
    if (wd.sp && !lines[lines.length - 1].length) return;
    lines[lines.length - 1].push({ ...wd, m }); cur += m;
  });
  lines.forEach((ln) => { while (ln.length && ln[ln.length - 1].sp) ln.pop(); });
  X.globalAlpha *= (o.a ?? 1);
  X.textBaseline = 'middle';
  X.shadowColor = 'rgba(0,0,0,.5)'; X.shadowBlur = 14; X.shadowOffsetY = 3;
  const al = o.al || 'center';
  const y0 = o.vc ? y - (lines.length - 1) * lh / 2 : y;
  lines.forEach((ln, i) => {
    const total = ln.reduce((a, b) => a + b.m, 0);
    let cx = al === 'center' ? x - total / 2 : al === 'right' ? x - total : x;
    ln.forEach((wd) => { X.fillStyle = wd.c; X.textAlign = 'left'; X.fillText(wd.w, cx, y0 + i * lh); cx += wd.m; });
  });
  X.restore();
  return lines.length * lh;
}

function pill(s, x, y, o = {}) {
  const sz = o.sz || 28, padX = o.px || sz * .7, h = o.h || sz * 1.8;
  const w = tw(s, sz, o.fam || 'PJS', o.w || 800, o.ls || 0) + padX * 2;
  const ax = o.al === 'left' ? x : o.al === 'right' ? x - w : x - w / 2;
  X.save();
  X.globalAlpha *= (o.a ?? 1);
  if (o.shadow !== false) { X.shadowColor = 'rgba(0,0,0,.35)'; X.shadowBlur = 16; X.shadowOffsetY = 4; }
  rr(ax, y - h / 2, w, h, h / 2);
  X.fillStyle = o.bg || 'rgba(10,22,40,.88)'; X.fill();
  X.shadowColor = 'transparent';
  if (o.border) { X.lineWidth = 3; X.strokeStyle = o.border; X.stroke(); }
  X.restore();
  txt(s, ax + w / 2, y + 1, { sz, fam: o.fam || 'PJS', w: o.w || 800, col: o.col || C.cream, a: o.a ?? 1, shadow: false, ls: o.ls || 0 });
  return w;
}

function panel(x, y, w, h, o = {}) {
  X.save();
  X.globalAlpha *= (o.a ?? 1);
  X.shadowColor = 'rgba(0,0,0,.4)'; X.shadowBlur = 30; X.shadowOffsetY = 10;
  rr(x, y, w, h, o.r ?? 28);
  const g = X.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, o.c1 || 'rgba(26,50,83,.92)'); g.addColorStop(1, o.c2 || 'rgba(19,38,63,.92)');
  X.fillStyle = g; X.fill();
  X.shadowColor = 'transparent';
  X.lineWidth = o.bw || 2; X.strokeStyle = o.border || 'rgba(242,235,221,.12)'; X.stroke();
  X.restore();
}

/* transform helper: gambar fn di (x,y) dengan skala, rotasi, alpha */
function tf(x, y, s, r, a, fn) {
  X.save(); X.globalAlpha *= a; X.translate(x, y); X.rotate(r || 0); X.scale(s, s); fn(); X.restore();
}

/* chibi: x = tengah, y = kaki */
function chibi(k, x, y, h, o = {}) {
  const im = IMG['c_' + k]; if (!im) return;
  const w = h * im.width / im.height;
  X.save();
  X.globalAlpha *= (o.a ?? 1);
  if (o.shadow !== false) {
    X.fillStyle = 'rgba(0,0,0,.38)';
    X.beginPath(); X.ellipse(x, y - h * .02, w * .3 * (o.sh ?? 1), h * .03 * (o.sh ?? 1), 0, 0, 7); X.fill();
  }
  X.translate(x, y + (o.dy || 0));
  X.rotate(o.rot || 0);
  X.scale((o.sx || 1) * (o.flipX ? -1 : 1), o.sy || 1);
  X.drawImage(im, -w / 2, -h * .985, w, h);
  X.restore();
  if (o.label) pill(o.label, x, y + (o.ly ?? 30), { sz: o.lsz || 26, a: (o.a ?? 1) * (o.la ?? 1), bg: o.lbg, col: o.lcol });
}

/* kepala chibi dalam lingkaran */
function head(k, x, y, r, o = {}) {
  const im = IMG['c_' + k]; if (!im) return;
  X.save();
  X.globalAlpha *= (o.a ?? 1);
  X.shadowColor = 'rgba(0,0,0,.35)'; X.shadowBlur = 14; X.shadowOffsetY = 4;
  X.beginPath(); X.arc(x, y, r, 0, 7);
  X.fillStyle = o.bg || C.surf2; X.fill();
  X.shadowColor = 'transparent';
  X.save(); X.clip();
  const s = (r * 2) / 175;
  X.drawImage(im, 72, 4, 176, 176, x - r - 2 * s, y - r + 6 * s, 176 * s, 176 * s);
  X.restore();
  X.lineWidth = o.ring ? 6 : 3; X.strokeStyle = o.ring || 'rgba(242,235,221,.5)';
  X.beginPath(); X.arc(x, y, r, 0, 7); X.stroke();
  X.restore();
}
function headPair(team, x, y, r, o = {}) {
  head(TEAM[team][0], x - r * .62, y, r, o);
  head(TEAM[team][1], x + r * .62, y, r, o);
}

/* kartu: flip 0 = belakang, 1 = depan */
function card(k, cx, cy, w, o = {}) {
  const h = w * 1.4;
  const f = o.flip ?? 1;
  const ang = Math.PI * (1 - f);
  const sx = Math.max(.001, Math.abs(Math.cos(ang)));
  const front = f >= .5;
  const pop = 1 + .1 * Math.sin(Math.PI * f) * (o.flip != null ? 1 : 0);
  X.save();
  X.globalAlpha *= (o.a ?? 1);
  X.translate(cx, cy);
  X.rotate(o.rot || 0);
  X.scale(sx * pop * (o.s ?? 1), pop * (o.s ?? 1));
  if (o.glow) { X.shadowColor = o.glow; X.shadowBlur = o.glowB || 60; } else { X.shadowColor = 'rgba(0,0,0,.5)'; X.shadowBlur = 30; X.shadowOffsetY = 12; }
  rr(-w / 2, -h / 2, w, h, w * .06); X.fillStyle = '#fff'; X.fill();
  X.shadowColor = 'transparent';
  X.save(); X.clip();
  const im = IMG['k_' + (front ? k : 'back')];
  if (im) X.drawImage(im, -w / 2, -h / 2, w, h);
  if (o.dim) { X.fillStyle = `rgba(10,22,40,${o.dim})`; X.fillRect(-w / 2, -h / 2, w, h); }
  X.restore();
  X.restore();
  if (o.count && front && o.flip == null || (o.count && f > .98)) {
    const bx = cx + w / 2 - w * .02, by = cy - h / 2 + w * .02;
    X.save(); X.globalAlpha *= (o.a ?? 1) * (o.ca ?? 1);
    X.beginPath(); X.arc(bx, by, w * .13, 0, 7); X.fillStyle = C.bg; X.fill();
    X.lineWidth = 4; X.strokeStyle = C.gold; X.stroke(); X.restore();
    txt('×' + o.count, bx, by + 2, { sz: w * .13, fam: 'BSD', col: C.gold, shadow: false, a: (o.a ?? 1) * (o.ca ?? 1) });
  }
}

function stamp(s, x, y, p, col, rot, sz) {
  if (p <= 0) return;
  const sc = lerp(2.2, 1, E.out5(cl(p / .5)));
  const a = cl(p / .25);
  sz = sz || 84;
  X.save();
  X.globalAlpha *= a * .96;
  X.translate(x, y); X.rotate(rot ?? -.18); X.scale(sc, sc);
  font(sz, 'BSD');
  X.letterSpacing = '4px';
  const w = X.measureText(s).width + sz * .7, h = sz * 1.25;
  rr(-w / 2, -h / 2, w, h, 14);
  X.fillStyle = 'rgba(10,22,40,.55)'; X.fill();
  X.lineWidth = 9; X.strokeStyle = col; X.stroke();
  X.fillStyle = col; X.textAlign = 'center'; X.textBaseline = 'middle';
  X.fillText(s, 0, 4);
  X.restore();
}

/* court tampak atas (tegak: net melintang) */
function courtTile(x, y, w, h, ci, o = {}) {
  const c = COURTS[ci];
  X.save();
  X.globalAlpha *= (o.a ?? 1);
  if (o.lit) { X.shadowColor = c.c; X.shadowBlur = 70 * o.lit; }
  else { X.shadowColor = 'rgba(0,0,0,.45)'; X.shadowBlur = 24; X.shadowOffsetY = 8; }
  rr(x, y, w, h, 22);
  const g = X.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, c.c); g.addColorStop(1, c.d);
  X.fillStyle = g; X.fill();
  X.shadowColor = 'transparent';
  if (o.lit) { X.lineWidth = 6; X.strokeStyle = hexA('#FFFFFF', .7 * o.lit); X.stroke(); }
  const m = Math.min(w, h) * .09;
  X.strokeStyle = 'rgba(255,255,255,.85)'; X.lineWidth = Math.max(3, w * .012);
  const ix = x + m, iy = y + m, iw = w - 2 * m, ih = h - 2 * m;
  X.strokeRect(ix, iy, iw, ih);
  if (o.horiz) {
    const mx = ix + iw / 2, sl = iw * .2;
    X.beginPath(); X.moveTo(mx - sl, iy); X.lineTo(mx - sl, iy + ih); X.moveTo(mx + sl, iy); X.lineTo(mx + sl, iy + ih);
    X.moveTo(mx - sl, iy + ih / 2); X.lineTo(mx + sl, iy + ih / 2); X.stroke();
    X.lineWidth = Math.max(5, w * .008); X.strokeStyle = 'rgba(255,255,255,.95)';
    X.beginPath(); X.moveTo(mx, y + m * .4); X.lineTo(mx, y + h - m * .4); X.stroke();
  } else {
    const my = iy + ih / 2, sl = ih * .2;
    X.beginPath(); X.moveTo(ix, my - sl); X.lineTo(ix + iw, my - sl); X.moveTo(ix, my + sl); X.lineTo(ix + iw, my + sl);
    X.moveTo(ix + iw / 2, my - sl); X.lineTo(ix + iw / 2, my + sl); X.stroke();
    X.lineWidth = Math.max(5, w * .02); X.strokeStyle = 'rgba(255,255,255,.95)';
    X.beginPath(); X.moveTo(x + m * .4, my); X.lineTo(x + w - m * .4, my); X.stroke();
  }
  X.restore();
}

function phone(x, y, w, h, a, fn) {
  X.save();
  X.globalAlpha *= a;
  X.shadowColor = 'rgba(0,0,0,.55)'; X.shadowBlur = 50; X.shadowOffsetY = 20;
  rr(x, y, w, h, 64); X.fillStyle = '#05080F'; X.fill();
  X.shadowColor = 'transparent';
  X.lineWidth = 4; X.strokeStyle = 'rgba(255,255,255,.18)'; X.stroke();
  rr(x + 16, y + 16, w - 32, h - 32, 50); X.fillStyle = C.bg; X.fill();
  X.save(); X.clip(); fn(x + 16, y + 16, w - 32, h - 32); X.restore();
  rr(x + w / 2 - 70, y + 28, 140, 30, 15); X.fillStyle = '#05080F'; X.fill();
  X.restore();
}

function imgCover(im, x, y, w, h, zoom = 1, fx = .5, fy = .5) {
  if (!im) return;
  const s = Math.max(w / im.width, h / im.height) * zoom;
  const dw = im.width * s, dh = im.height * s;
  X.drawImage(im, x + (w - dw) * fx, y + (h - dh) * fy, dw, dh);
}

function confetti(t, t0, n, ox, oy, seed, spread = 1) {
  const lt = t - t0; if (lt < 0 || lt > 4) return;
  const R = rng(seed);
  const cols = [C.gold, C.acc, C.plus, C.blue, '#EC8DB4', C.cream];
  for (let i = 0; i < n; i++) {
    const ang = -Math.PI / 2 + (R() - .5) * 2.2 * spread, sp = 700 + R() * 900;
    const vx = Math.cos(ang) * sp, vy = Math.sin(ang) * sp;
    const x = ox + vx * lt * .55 + Math.sin(lt * 3 + i) * 30, y = oy + vy * lt * .55 + 900 * lt * lt * .5;
    const a = cl(1 - (lt - 2.6) / 1.4);
    X.save(); X.globalAlpha *= a; X.translate(x, y); X.rotate(lt * (4 + R() * 6) + i);
    X.fillStyle = cols[i % cols.length]; X.fillRect(-9, -5, 18, 10); X.restore();
  }
}
function rays(x, y, r, a, rot, col) {
  X.save(); X.globalAlpha *= a; X.translate(x, y); X.rotate(rot);
  const g = X.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, hexA(col, .55)); g.addColorStop(1, hexA(col, 0));
  X.fillStyle = g;
  for (let i = 0; i < 12; i++) {
    X.rotate(Math.PI / 6);
    X.beginPath(); X.moveTo(0, 0); X.lineTo(r, -r * .12); X.lineTo(r, r * .12); X.closePath(); X.fill();
  }
  X.restore();
}

/* judul adegan + sub */
function title(lt, s, y, o = {}) {
  const k = E.out(P(lt, o.t0 ?? .15, .6));
  txt(s, W / 2, (y ?? 250) + (1 - k) * 50, { sz: o.sz || 120, fam: 'BSD', col: o.col || C.gold, a: k, ls: 2, stroke: 'rgba(10,22,40,.6)', sw: 12 });
}
function sub(lt, s, y, o = {}) {
  const k = E.out(P(lt, o.t0 ?? .45, .6));
  rich(s, W / 2, (y ?? 350) + (1 - k) * 30, o.maxW || 940, { sz: o.sz || 40, a: k, col: o.col || C.cream, hl: o.hl, vc: o.vc });
}
const enter = (lt, t0, d = .6) => E.out(P(lt, t0, d));

/* =================== ADEGAN =================== */

/* 1. Pembuka */
function s1(lt) {
  // garis court
  const p = E.io(P(lt, 0, 2));
  X.save();
  X.globalAlpha *= .22 * (1 - .4 * P(lt, 5, 3));
  X.strokeStyle = C.cream; X.lineWidth = 6; X.shadowColor = C.acc; X.shadowBlur = 20;
  const cw = 800, ch = 1600, cx = (W - cw) / 2, cy = (H - ch) / 2;
  const L = 2 * (cw + ch);
  X.setLineDash([L * p, L]); X.strokeRect(cx, cy, cw, ch);
  X.setLineDash([cw * p, cw]);
  X.beginPath(); X.moveTo(cx, H / 2); X.lineTo(cx + cw, H / 2); X.stroke();
  X.beginPath(); X.moveTo(cx, H / 2 - 460); X.lineTo(cx + cw, H / 2 - 460); X.stroke();
  X.beginPath(); X.moveTo(cx, H / 2 + 460); X.lineTo(cx + cw, H / 2 + 460); X.stroke();
  X.setLineDash([460 * p, 460]);
  X.beginPath(); X.moveTo(W / 2, H / 2 - 460); X.lineTo(W / 2, H / 2); X.moveTo(W / 2, H / 2 + 460); X.lineTo(W / 2, H / 2); X.stroke();
  X.restore();

  // logo
  const lk = P(lt, .5, .9);
  if (lk > 0) {
    rays(W / 2, 400, 420, .5 * lk, lt * .15, C.acc);
    tf(W / 2, 400, E.back(lk) * 1, 0, cl(lk * 3), () => {
      X.shadowColor = 'rgba(232,144,47,.6)'; X.shadowBlur = 60;
      X.drawImage(IMG.logo, -150, -150, 300, 300);
    });
  }
  txt('MEMPERSEMBAHKAN', W / 2, 610, { sz: 38, ls: 12, col: C.muted, a: enter(lt, 1.6, .7), w: 800 });

  // POWER CUP
  const sp = P(lt, 2.4, .5);
  if (sp > 0) {
    const sc = lerp(2.4, 1, E.out5(sp));
    const shake = (1 - P(lt, 2.85, .5)) * (sp >= 1 ? 1 : 0);
    const sx = Math.sin(lt * 90) * 14 * shake, sy = Math.cos(lt * 77) * 10 * shake;
    const breathe = 1 + .015 * Math.sin((lt - 3) * 2.2) * P(lt, 3, 1);
    tf(W / 2 + sx, 1010 + sy, sc * breathe, 0, cl(sp * 4), () => {
      const g = X.createLinearGradient(0, -230, 0, 230);
      g.addColorStop(0, '#FFE39A'); g.addColorStop(.5, C.gold); g.addColorStop(1, C.acc);
      font(300, 'BSD'); X.textAlign = 'center'; X.textBaseline = 'middle'; X.letterSpacing = '6px';
      X.lineJoin = 'round';
      X.shadowColor = 'rgba(232,144,47,.8)'; X.shadowBlur = 60;
      X.lineWidth = 22; X.strokeStyle = C.bg;
      X.strokeText('POWER', 0, -125); X.strokeText('CUP', 0, 135);
      X.shadowBlur = 0; X.fillStyle = g;
      X.fillText('POWER', 0, -125); X.fillText('CUP', 0, 135);
    });
    // kilat putih
    X.save(); X.globalAlpha = .55 * (1 - P(lt, 2.75, .45)) * (lt > 2.75 ? 1 : 0); X.fillStyle = '#fff'; X.fillRect(0, 0, W, H); X.restore();
  }

  // kartu kipas
  const keys = ['golden', 'double', 'steal', 'block', 'reverse'];
  keys.forEach((k, i) => {
    const t0 = 3.5 + i * .12;
    const e = E.back(P(lt, t0, .7));
    if (e <= 0) return;
    const off = i - 2;
    const x = W / 2 + off * 175 * e, y = 1490 + Math.abs(off) * 28 * e - 10 * Math.sin(lt * 1.6 + i) * P(lt, 5, 1);
    card(k, x, y, 190, { rot: off * .2 * e, flip: E.io(P(lt, 4.2 + i * .18, .5)), s: e });
  });

  sub(lt, 'Turnamen padel dengan [[kartu power]]', 1730, { t0: 5.2, sz: 46 });
  sub(lt, 'yang bikin setiap match penuh kejutan!', 1798, { t0: 5.6, sz: 46 });
}

/* 2. Ajak main bareng */
const S2_ROWS = [
  { y: 930, h: 250, ks: ['herry', 'sisil', 'farid', 'nina'] },
  { y: 1215, h: 270, ks: ['max', 'lulu', 'dianty', 'aria'] },
  { y: 1510, h: 290, ks: ['rezaerlangga', 'wuluh', 'dani', 'yeninila'] }
];
const S2_XS = [[180, 420, 660, 900], [160, 400, 680, 920], [180, 420, 660, 900]];
function s2(lt) {
  // latar court
  X.save();
  X.globalAlpha *= .9 * enter(lt, 0, .8);
  const zy = 560, zh = 1120;
  imgCover(IMG.court, 0, zy, W, zh, 1 + .05 * lt / 8);
  const g1 = X.createLinearGradient(0, zy, 0, zy + 260); g1.addColorStop(0, C.bg); g1.addColorStop(1, hexA(C.bg, 0));
  X.fillStyle = g1; X.fillRect(0, zy - 2, W, 262);
  const g2 = X.createLinearGradient(0, zy + zh - 300, 0, zy + zh); g2.addColorStop(0, hexA(C.bg, 0)); g2.addColorStop(1, C.bg);
  X.fillStyle = g2; X.fillRect(0, zy + zh - 300, W, 302);
  X.fillStyle = 'rgba(10,22,40,.25)'; X.fillRect(0, zy, W, zh);
  X.restore();

  title(lt, 'AYO MAIN BARENG!', 250, { sz: 140 });
  sub(lt, 'Teman-teman Paddoc sudah siap di lapangan', 365, { sz: 42 });

  let i = 0;
  const labels = [];
  S2_ROWS.forEach((row, ri) => {
    row.ks.forEach((k, ci) => {
      const st = .9 + i * .26; i++;
      const p = P(lt, st, .5);
      if (p <= 0) return;
      const yOff = -900 * (1 - p * p);
      const q = P(lt, st + .5, .4);
      const sq = Math.sin(Math.PI * q) * (1 - q * .4);
      const bob = Math.sin((lt - st) * 2.4 + i) * 6 * P(lt, st + 1, .5);
      chibi(k, S2_XS[ri][ci], row.y + yOff, row.h, { sy: 1 - .14 * sq, sx: 1 + .1 * sq, dy: bob, sh: p });
      labels.push([NM[k], S2_XS[ri][ci], row.y + 26, P(lt, st + .5, .3)]);
    });
  });
  labels.forEach(([n, x, y, a]) => { if (a > 0) pill(n, x, y, { sz: 26, a }); });

  sub(lt, `[[${PLAYER_COUNT} pemain]] sudah terdaftar di Paddoc Host.`, 1735, { t0: 4.8, sz: 42 });
  sub(lt, 'Giliran kamu ikut seru-seruan!', 1800, { t0: 5.3, sz: 42 });
}

/* 3. Gabung di lobi */
function s3(lt) {
  title(lt, 'GABUNG DI LOBI', 245);
  sub(lt, 'Host buat sesi [[Power Cup]], kamu tinggal ikut', 345);
  const pk = enter(lt, .3, .8);
  const px = 270, py = 430 + (1 - pk) * 120, pw = 540, ph = 980;
  const joined = ['herry', 'sisil', 'farid', 'nina', 'max', 'dianty', 'aria'];
  const tapT = 4.4;
  phone(px, py, pw, ph, pk, (x, y, w, h) => {
    txt('9:41', x + 50, y + 34, { sz: 22, al: 'left', shadow: false, col: C.muted });
    pill('POWER CUP', x + 30, y + 100, { sz: 22, al: 'left', bg: C.acc, col: C.ink, shadow: false, ls: 2 });
    txt('Sabtu · 19.00–22.00', x + w - 30, y + 100, { sz: 22, al: 'right', shadow: false, col: C.muted });
    txt('Padel Doc Arena', x + 30, y + 150, { sz: 32, al: 'left', shadow: false, fam: 'PJS', w: 800 });
    // court mini
    const cx = x + 18, cy = y + 185, cw = w - 36, chh = 330;
    X.save(); rr(cx, cy, cw, chh, 24); X.clip(); imgCover(IMG.court, cx, cy, cw, chh, 1.15, .5, .55); X.restore();
    const spots = [[cx + 95, cy + 175], [cx + 185, cy + 220], [cx + 120, cy + 290], [cx + 210, cy + 300],
      [cx + 300, cy + 175], [cx + 395, cy + 220], [cx + 320, cy + 300], [cx + 415, cy + 300]];
    const all = joined.concat(['lulu']);
    all.forEach((k, i) => {
      const st = i < 7 ? 1.0 + i * .42 : tapT + .25;
      const p = P(lt, st, .4); if (p <= 0) return;
      const q = P(lt, st + .4, .3), sq = Math.sin(Math.PI * q);
      chibi(k, spots[i][0], spots[i][1] - 500 * (1 - p * p), 118, { sy: 1 - .12 * sq, sx: 1 + .08 * sq, shadow: true, sh: p });
      if (k === 'lulu' && p >= 1) pill('Kamu', spots[i][0], spots[i][1] - 132, { sz: 18, bg: C.acc, col: C.ink, shadow: false });
    });
    // daftar hadir
    const n = Math.min(8, joined.filter((_, i) => lt >= 1.4 + i * .42).length + (lt >= tapT + .65 ? 1 : 0));
    const full = n >= 8;
    txt('Hadir', x + 30, y + 565, { sz: 26, al: 'left', shadow: false, col: C.muted });
    txt(`${n}/8`, x + 30, y + 618, { sz: 64, al: 'left', fam: 'BSD', shadow: false, col: full ? C.gold : C.cream });
    if (full) pill('PENUH', x + 170, y + 618, { sz: 22, bg: C.red, col: '#fff', al: 'left', shadow: false, a: P(lt, tapT + .65, .2) });
    // waiting list
    const wl = P(lt, 6.0, .5);
    if (wl > 0) {
      X.save(); X.globalAlpha *= wl;
      rr(x + 24, y + 670 + (1 - E.out(wl)) * 40, w - 48, 92, 22); X.fillStyle = 'rgba(238,111,95,.16)'; X.fill();
      X.lineWidth = 2; X.strokeStyle = 'rgba(238,111,95,.6)'; X.stroke();
      X.restore();
      head('toha', x + 80, y + 716 + (1 - E.out(wl)) * 40, 32, { a: wl });
      txt('#1 Toha', x + 128, y + 702 + (1 - E.out(wl)) * 40, { sz: 28, al: 'left', shadow: false, a: wl, w: 800 });
      txt('Waiting list · naik kalau ada yang batal', x + 128, y + 736 + (1 - E.out(wl)) * 40, { sz: 19, al: 'left', shadow: false, a: wl, col: C.muted });
    }
    // tombol
    const done = lt >= tapT + .15;
    const by = y + h - 130;
    const press = 1 - .06 * Math.sin(Math.PI * P(lt, tapT, .3));
    tf(x + w / 2, by + 45, press, 0, 1, () => {
      rr(-(w - 60) / 2, -45, w - 60, 90, 45);
      X.fillStyle = done ? '#2E7D4F' : C.acc; X.fill();
    });
    txt(done ? '✓ Bergabung' : 'Saya Bergabung', x + w / 2, by + 47, { sz: 32, shadow: false, col: done ? '#fff' : C.ink, w: 800 });
    // jari
    const fp = P(lt, tapT - .6, .6), fo = 1 - P(lt, tapT + .5, .4);
    if (fp > 0 && fo > 0) {
      const fx = x + w / 2 + 60, fy = by + 45 + (1 - E.out(fp)) * 160;
      X.save(); X.globalAlpha *= fo;
      const rp = P(lt, tapT, .5);
      if (rp > 0) { X.beginPath(); X.arc(fx, fy, 30 + 70 * rp, 0, 7); X.lineWidth = 6; X.strokeStyle = hexA('#FFFFFF', .7 * (1 - rp)); X.stroke(); }
      X.beginPath(); X.arc(fx, fy, 30, 0, 7); X.fillStyle = 'rgba(255,255,255,.75)'; X.fill();
      X.restore();
    }
  });
  bullet(lt, 6.8, 1520, '👥', 'Maks. [[court × 4]] pemain: 2 court = 8, 3 court = 12');
  bullet(lt, 7.6, 1650, '⏳', 'Penuh? Masuk [[waiting list]], otomatis naik kalau ada yang batal');
}
function bullet(lt, t0, y, ico, s, o = {}) {
  const k = enter(lt, t0, .6);
  if (k <= 0) return;
  const x0 = 70 + (1 - k) * -40;
  panel(x0, y - 58, 940, 116, { a: k, r: 26 });
  X.save(); X.globalAlpha *= k;
  X.beginPath(); X.arc(x0 + 66, y, 38, 0, 7); X.fillStyle = o.ic || 'rgba(232,144,47,.2)'; X.fill();
  X.restore();
  txt(ico, x0 + 66, y + 2, { sz: 38, a: k, shadow: false });
  rich(s, x0 + 128, y, 790, { sz: o.sz || 34, al: 'left', a: k, vc: true, lh: 46 });
}

/* 4. Pasangan diundi */
const S4_L = ['lulu', 'herry', 'farid', 'max', 'sisil', 'dianty'];
const S4_R = ['rezaerlangga', 'nina', 'wuluh', 'yeninila', 'aria', 'dani'];
const S4_TEAMS = ['LR', 'HN', 'FW', 'MY', 'SA', 'DD'];
function s4(lt) {
  title(lt, 'PASANGAN DIUNDI', 245);
  sub(lt, 'Aplikasi mengundi pasangan secara [[acak]]', 345);
  const ph1 = 1 - P(lt, 4.9, .4);
  if (ph1 > 0) {
    X.save(); X.globalAlpha *= ph1;
    const lx = 300, rx = 780;
    const phase = 18 * E.out(P(lt, 1.6, 2.2));
    for (let i = 0; i < 6; i++) {
      const y = 600 + i * 165;
      const k = enter(lt, .6 + i * .1, .5);
      head(S4_L[i], lx - (1 - k) * 80, y, 64, { a: k, ring: C.acc });
      txt(NM[S4_L[i]], lx - 100 - (1 - k) * 80, y, { sz: 32, al: 'right', a: k, w: 800 });
      // slot berputar
      const kb = enter(lt, .7 + i * .1, .5);
      const base = Math.floor(phase), fr = phase - base;
      X.save();
      X.globalAlpha *= kb;
      X.beginPath(); X.arc(rx, y, 64, 0, 7); X.fillStyle = C.surf2; X.fill(); X.clip();
      const ka = S4_R[(i + base) % 6], kb2 = S4_R[(i + base + 1) % 6];
      head(ka, rx, y - fr * 130, 64, { ring: C.acc });
      if (fr > .01) head(kb2, rx, y + 130 - fr * 130, 64, { ring: C.acc });
      X.restore();
      X.save(); X.globalAlpha *= kb; X.beginPath(); X.arc(rx, y, 64, 0, 7); X.lineWidth = 6; X.strokeStyle = C.acc; X.stroke(); X.restore();
      const settled = P(lt, 3.8, .3);
      txt(NM[S4_R[i]], rx + 100, y, { sz: 32, al: 'left', a: kb * settled, w: 800 });
      // garis pasangan
      const lp = E.out(P(lt, 3.9 + i * .08, .4));
      if (lp > 0) {
        X.save(); X.strokeStyle = C.acc; X.lineWidth = 6; X.setLineDash([14, 12]); X.lineDashOffset = -lt * 40;
        X.beginPath(); X.moveTo(lx + 70, y); X.lineTo(lx + 70 + (rx - lx - 140) * lp, y); X.stroke(); X.restore();
        if (lp >= 1) txt('+', W / 2, y, { sz: 54, fam: 'BSD', col: C.acc, a: P(lt, 4.3 + i * .08, .2) });
      }
    }
    X.restore();
  }
  // kartu tim
  S4_TEAMS.forEach((tk, i) => {
    const st = 5.1 + i * .18;
    const k = E.back(P(lt, st, .55));
    if (k <= 0) return;
    const cx = i % 2 ? 790 : 290, cy = 640 + Math.floor(i / 2) * 340;
    tf(cx, cy, k, 0, cl(k * 2), () => {
      panel(-235, -150, 470, 300, { r: 30 });
      pill('TIM ' + (i + 1), -235 + 24, -118, { sz: 22, al: 'left', bg: C.acc, col: C.ink, shadow: false, ls: 2 });
      const bob = Math.sin(lt * 2.5 + i) * 4;
      chibi(TEAM[tk][0], -80, 95 + bob, 210, { shadow: false });
      chibi(TEAM[tk][1], 80, 95 - bob, 210, { shadow: false });
      txt(tname(tk), 0, 122, { sz: 30, w: 800 });
    });
  });
  sub(lt, 'Tim tetap dari awal sampai akhir. Host juga bisa atur [[manual]].', 1700, { t0: 6.0, sz: 38 });
}

/* 5. Court punya nilai */
function s5(lt) {
  title(lt, 'COURT PUNYA NILAI', 245);
  sub(lt, 'Court 1 = [[±1]] · Court 2 = [[±2]] · Court 3 = [[±3]]', 345);
  const foc = E.io(P(lt, 3.2, .5));
  for (let i = 0; i < 3; i++) {
    const k = E.back(P(lt, .4 + i * .3, .6));
    if (k <= 0) continue;
    const cx = 210 + i * 330, cy = 730;
    const dim = i < 2 ? foc * .6 : 0;
    const sc = k * (i === 2 ? 1 + .06 * foc : 1 - .04 * foc);
    tf(cx, cy + (1 - k) * 100, sc, 0, cl(k * 2), () => {
      courtTile(-140, -260, 280, 520, i, { lit: i === 2 ? foc * (.7 + .3 * Math.sin(lt * 5)) : 0 });
      txt('COURT ' + (i + 1), 0, -200, { sz: 34, fam: 'BSD', ls: 3, shadow: false });
      X.save(); X.beginPath(); X.arc(0, 0, 92, 0, 7); X.fillStyle = 'rgba(10,22,40,.75)'; X.fill(); X.restore();
      txt('±' + (i + 1), 0, 6, { sz: 120, fam: 'BSD', col: C.gold, shadow: false });
      if (dim) { X.save(); rr(-140, -260, 280, 520, 22); X.fillStyle = `rgba(10,22,40,${dim})`; X.fill(); X.restore(); }
    });
  }
  // contoh menang / kalah
  const rowW = 940, rx = 70;
  [['HN', 'MENANG', '+3', C.plus, 3.7], ['LR', 'KALAH', '−3', C.red, 4.9]].forEach(([tm, lab, val, col, t0], i) => {
    const k = enter(lt, t0, .6);
    if (k <= 0) return;
    const y = 1130 + i * 190;
    panel(rx + (1 - k) * 60, y - 80, rowW, 160, { a: k, r: 30, border: hexA(col, .5), bw: 3 });
    X.save(); X.globalAlpha *= k;
    headPair(tm, rx + 110 + (1 - k) * 60, y, 50);
    txt(tname(tm), rx + 210, y - 22, { sz: 34, al: 'left', w: 800 });
    pill(lab + ' di Court 3', rx + 210, y + 30, { sz: 22, al: 'left', bg: hexA(col, .2), col, border: hexA(col, .6), shadow: false });
    const pp = E.back(P(lt, t0 + .35, .5));
    tf(rx + rowW - 110, y + 4, pp, 0, cl(pp * 2), () => txt(val, 0, 0, { sz: 130, fam: 'BSD', col, glow: hexA(col, .7) }));
    X.restore();
  });
  sub(lt, 'Poin bisa minus. [[Berani ambil court besar?]]', 1600, { t0: 6.2, sz: 40 });
  sub(lt, 'Nilai court bisa diatur host: ±1 sampai ±6', 1675, { t0: 6.7, sz: 34, col: C.muted });
}

/* 6. Match 5 game */
const S6_SEQ = ['A', 'B', 'A', 'B', 'A'];
function s6(lt) {
  title(lt, 'MATCH 5 GAME', 245);
  sub(lt, 'Selalu dimainkan penuh: total [[5 game]]', 345);
  const k = enter(lt, .3, .7);
  panel(60, 450 + (1 - k) * 60, 960, 560, { a: k, r: 36 });
  X.save(); X.globalAlpha *= k;
  const oy = (1 - k) * 60;
  pill('COURT 3 · ±3', W / 2, 500 + oy, { sz: 26, bg: COURTS[2].c, col: '#fff', shadow: false, ls: 2 });
  const won = { A: 0, B: 0 };
  const filled = S6_SEQ.map((w, i) => { const f = P(lt, .9 + i * .7, .3); if (f >= 1) won[w]++; return f; });
  [['A', 'HN'], ['B', 'LR']].forEach(([side, tm], r) => {
    const y = 640 + r * 230 + oy;
    headPair(tm, 170, y, 52);
    txt(tname(tm), 260, y - 40, { sz: 34, al: 'left', w: 800 });
    for (let g = 0; g < 5; g++) {
      const bx = 262 + g * 92, by = y + 2;
      const mine = S6_SEQ[g] === side, f = filled[g];
      X.save();
      rr(bx, by, 76, 76, 16);
      X.fillStyle = 'rgba(255,255,255,.06)'; X.fill();
      X.lineWidth = 2; X.strokeStyle = 'rgba(255,255,255,.18)'; X.stroke();
      if (f > 0 && mine) {
        const s = E.back(f);
        X.translate(bx + 38, by + 38); X.scale(s, s);
        rr(-38, -38, 76, 76, 16); X.fillStyle = side === 'A' ? C.plus : C.acc; X.fill();
      }
      X.restore();
      if (f >= 1 && mine) txt('✓', bx + 38, by + 40, { sz: 42, col: C.ink, shadow: false, w: 800 });
    }
    txt(String(won[side]), 930, y + 10, { sz: 140, fam: 'BSD', col: side === 'A' ? C.plus : C.acc });
  });
  X.restore();
  // 40-40
  const pk = P(lt, 4.6, .5);
  if (pk > 0) {
    const s = lerp(1.8, 1, E.out5(pk));
    tf(W / 2, 1230, s, 0, cl(pk * 3), () => {
      txt('40 – 40', 0, 0, { sz: 230, fam: 'BSD', col: C.cream, glow: 'rgba(232,144,47,.6)', ls: 4 });
    });
    stamp('POIN PENENTU!', W / 2, 1400, P(lt, 5.4, .6), C.gold, -.06, 80);
  }
  sub(lt, 'Skor [[15 · 30 · 40]]. 40-40 = [[satu poin penentu]], tanpa deuce.', 1640, { t0: 5.9, sz: 38 });
}

/* 7. Ronde & penantang */
// posisi tiap tim (FW, SA, LR) per langkah acak; terakhir = urutan sebenarnya
const S7_PERMS = [[0, 1, 2], [1, 0, 2], [1, 2, 0], [2, 1, 0], [0, 2, 1], [2, 0, 1], [0, 1, 2], [1, 0, 2], [1, 2, 0]];
function s7(lt) {
  // RONDE 2 besar
  const rk = P(lt, .1, .5);
  const up = E.io(P(lt, 1.8, .6));
  if (rk > 0) {
    const s = lerp(lerp(2, 1, E.out5(rk)), .34, up);
    const y = lerp(860, 255, up);
    tf(W / 2, y, s, 0, cl(rk * 3), () => {
      if (up < 1) rays(0, 0, 700, (1 - up) * .7, lt * .3, C.acc);
      txt('RONDE 2', 0, 0, { sz: 280, fam: 'BSD', col: C.gold, stroke: C.bg, sw: 16, glow: 'rgba(232,144,47,.7)' });
    });
  }
  if (up > 0) txt('URUTAN MEMILIH COURT', W / 2, 360, { sz: 34, ls: 6, col: C.muted, a: up, w: 800 });
  // urutan tim diacak
  const teams = ['FW', 'SA', 'LR'];
  const finalOrder = ['LR', 'FW', 'SA'];
  const sh = P(lt, 2.4, 2.2);
  for (let i = 0; i < 3; i++) {
    const k = enter(lt, 2.1 + i * .12, .5);
    if (k <= 0) continue;
    const tm = teams[i];
    // posisi: acak berputar, lalu ke urutan akhir
    const fi = finalOrder.indexOf(tm);
    const ph = E.out(sh) * (S7_PERMS.length - 1);
    const pa = Math.floor(ph), pb = Math.min(pa + 1, S7_PERMS.length - 1);
    const slot = lerp(S7_PERMS[pa][i], S7_PERMS[pb][i], E.io(ph - pa));
    const y = 470 + slot * 150;
    const settled = sh >= 1;
    panel(80, y - 62 + (1 - k) * 40, 920, 124, { a: k, r: 28, border: settled && fi === 0 ? C.gold : undefined, bw: settled && fi === 0 ? 4 : 2 });
    X.save(); X.globalAlpha *= k;
    X.beginPath(); X.arc(150, y, 36, 0, 7); X.fillStyle = settled ? C.gold : C.surf2; X.fill(); X.restore();
    txt(settled ? String(fi + 1) : '?', 150, y + 3, { sz: 46, fam: 'BSD', col: settled ? C.ink : C.muted, a: k, shadow: false });
    X.save(); X.globalAlpha *= k; headPair(tm, 270, y, 40); X.restore();
    txt(tname(tm), 350, y, { sz: 34, al: 'left', a: k, w: 800 });
    pill('PENANTANG', 970, y, { sz: 20, al: 'right', bg: 'rgba(232,144,47,.2)', col: C.acc, border: C.acc, a: k, shadow: false, ls: 2 });
  }
  // court mini
  const ck = enter(lt, 4.9, .6);
  if (ck > 0) {
    const pick = P(lt, 5.5, .3);
    for (let i = 0; i < 3; i++) {
      const cx = 220 + i * 320, cy = 1150 + (1 - ck) * 60;
      const lit = i === 2 ? pick * (.75 + .25 * Math.sin(lt * 6)) : 0;
      X.save(); X.globalAlpha *= ck;
      courtTile(cx - 115, cy - 150, 230, 300, i, { lit });
      X.restore();
      txt('±' + (i + 1), cx, cy, { sz: 90, fam: 'BSD', col: C.gold, a: ck, stroke: 'rgba(10,22,40,.7)', sw: 10 });
      const who = i === 2 ? 'LR' : i === 0 ? 'FW' : 'SA';
      const wt = i === 2 ? 5.6 : i === 0 ? 6.6 : 7.1;
      const wk = E.back(P(lt, wt, .5));
      if (wk > 0) tf(cx, cy + 205, wk, 0, 1, () => { headPair(who, 0, 0, 34); });
    }
    // jari tap court 3
    const fp = P(lt, 5.0, .5), fo = 1 - P(lt, 5.9, .4);
    if (fp > 0 && fo > 0) {
      const fx = 860, fy = 1150 + (1 - E.out(fp)) * 200;
      X.save(); X.globalAlpha *= fo;
      const rp = P(lt, 5.5, .5);
      if (rp > 0) { X.beginPath(); X.arc(fx, fy, 30 + 80 * rp, 0, 7); X.lineWidth = 6; X.strokeStyle = hexA('#FFFFFF', .7 * (1 - rp)); X.stroke(); }
      X.beginPath(); X.arc(fx, fy, 30, 0, 7); X.fillStyle = 'rgba(255,255,255,.8)'; X.fill();
      X.restore();
    }
    const lk = E.back(P(lt, 5.8, .5));
    if (lk > 0) tf(700, 965, lk, 0, cl(lk * 2) * (1 - P(lt, 8.8, .5)), () => pill('Lulu & Reza memilih court ini ±3', 0, 0, { sz: 26, bg: COURTS[2].c, col: '#fff', border: '#fff' }));
  }
  sub(lt, 'Semua tim main bersamaan, lawan [[berputar]] sampai semua bertemu.', 1560, { t0: 2.6, sz: 36 });
  sub(lt, 'Tim yang kalah jadi [[penantang]] & memilih court duluan.', 1690, { t0: 6.0, sz: 36 });
}

/* 8. Ambil kartu */
const S8_SEQ = ['double', 'pick', 'free30', 'zonk', 'swh', 'block', 'steal', 'nosmash', 'free15', 'reverse', 'noglass', 'swap', 'zonk', 'golden'];
const S8_N = 27; // indeks akhir: 27 % 14 = 13 → golden
function s8Phase(lt) { return S8_N * E.out(P(lt, 1.3, 3.3)); }
function s8(lt) {
  title(lt, 'KALAH? AMBIL KARTU!', 245);
  sub(lt, 'Tim yang kalah berhak ambil [[1 kartu power]]', 345);
  const ak = E.back(P(lt, .7, .6));
  const ph = s8Phase(lt);
  const idx = Math.floor(ph) % S8_SEQ.length;
  const fr = ph - Math.floor(ph);
  const done = lt >= 4.6;
  const toHand = E.io(P(lt, 6.0, .8));
  if (ak > 0) {
    const cx = lerp(540, 650, toHand), cy = lerp(880, 1360, toHand), w = lerp(400, 190, toHand);
    if (done) rays(cx, cy, 620, (1 - toHand) * P(lt, 4.6, .3), lt * .4, C.gold);
    const jig = lt < 4.6 && lt > 1.3 ? (1 - fr) * .05 : 0;
    card(lt < 1.3 ? 'back' : S8_SEQ[idx], cx, cy, w, { s: ak * (1 + jig), glow: done ? 'rgba(242,193,78,.9)' : undefined, glowB: 80, rot: (lt > 1.3 && !done ? (fr - .5) * .06 : 0) });
    if (done && toHand < .2) {
      const lk = E.back(P(lt, 4.75, .5));
      tf(W / 2, 1270, lk, 0, cl(lk * 2) * (1 - toHand * 5), () => pill('GOLDEN POINT!', 0, 0, { sz: 40, bg: C.gold, col: C.ink, fam: 'BSD', ls: 3 }));
    }
  }
  // tangan
  const hk = enter(lt, 5.4, .6);
  if (hk > 0) {
    X.save(); X.globalAlpha *= hk;
    txt('KARTU DI TANGAN', W / 2, 1150, { sz: 30, ls: 6, col: C.muted, w: 800, a: 1 });
    [430, 650].forEach((x) => { rr(x - 100, 1360 - 138, 200, 276, 18); X.setLineDash([12, 10]); X.lineWidth = 3; X.strokeStyle = 'rgba(242,235,221,.35)'; X.stroke(); X.setLineDash([]); });
    X.restore();
    card('free15', 430, 1360, 190, { a: hk });
    const full = P(lt, 6.8, .3);
    if (full > 0) pill('2/2 · tangan penuh', W / 2, 1545, { sz: 26, a: full, bg: 'rgba(242,193,78,.18)', col: C.gold, border: C.gold });
  }
  bullet(lt, 7.0, 1665, '🃏', 'Dek digital [[28 kartu]], tidak pernah habis', { sz: 32 });
  bullet(lt, 7.6, 1795, '🤫', 'Rahasia: hanya [[HP timmu]] yang bisa lihat', { sz: 32 });
}

/* 9. Katalog kartu */
const CARDINFO = {
  free15: ['FREE 15', 3, 'Tiap game kamu mulai [[15-0]]'],
  free30: ['FREE 30', 1, 'Tiap game kamu mulai [[30-0]]'],
  golden: ['GOLDEN POINT', 2, '40-40? [[Langsung game]] milikmu'],
  double: ['DOUBLE POINT', 2, 'Menang? Poin court [[×2]]'],
  steal: ['STEAL ALL POINTS', 1, 'Menang? [[Rebut semua poin]] klasemen lawan'],
  swap: ['SWAP RANKING', 1, 'Menang & masih di bawah? [[Total poin ditukar]]'],
  pick: ['PICK OPPONENT', 2, '[[Pilih sendiri]] tim lawanmu'],
  nosmash: ['NO SMASH', 2, 'Lawan [[dilarang smash]] selama 2 game'],
  noglass: ['NO GLASS', 2, 'Lawan [[dilarang pakai kaca]] selama 2 game'],
  swh: ['SWITCH HAND', 2, 'Lawan pakai [[tangan non-dominan]], game 1–2'],
  block: ['BLOCK', 3, '[[Batalkan]] kartu lawan apa pun'],
  reverse: ['REVERSE', 1, '[[Balikkan]] efek kartu lawan ke pengirimnya']
};
function cardRow(lt, keys, y, w, t0, gap) {
  const n = keys.length;
  keys.forEach((k, i) => {
    const x = W / 2 + (i - (n - 1) / 2) * gap;
    const st = t0 + i * .8;
    const ek = E.out(P(lt, st, .6));
    if (ek <= 0) return;
    const f = E.io(P(lt, st + .35, .55));
    const bob = Math.sin(lt * 1.8 + i * 1.3) * 6 * P(lt, st + 1, .5);
    card(k, x, y + (1 - ek) * 300 + bob, w, { flip: f, a: cl(ek * 2), count: CARDINFO[k][1], ca: P(lt, st + .8, .3) });
    const ik = enter(lt, st + .7, .5);
    txt(CARDINFO[k][0], x, y + w * .7 + 56, { sz: n > 2 ? 42 : 52, fam: 'BSD', col: C.gold, a: ik, ls: 1 });
    rich(CARDINFO[k][2], x, y + w * .7 + 112, gap - 30, { sz: 29, lh: 40, a: ik, hl: C.acc });
  });
}
function cardGrid(lt, keys, t0) {
  keys.forEach((k, i) => {
    const x = i % 2 ? 790 : 290, y = 640 + Math.floor(i / 2) * 560;
    const st = t0 + i * .75;
    const ek = E.out(P(lt, st, .6));
    if (ek <= 0) return;
    const f = E.io(P(lt, st + .35, .55));
    const bob = Math.sin(lt * 1.8 + i * 1.3) * 5 * P(lt, st + 1, .5);
    card(k, x, y + (1 - ek) * 300 + bob, 250, { flip: f, a: cl(ek * 2), count: CARDINFO[k][1], ca: P(lt, st + .8, .3) });
    const ik = enter(lt, st + .7, .5);
    txt(CARDINFO[k][0], x, y + 225, { sz: 42, fam: 'BSD', col: C.gold, a: ik, ls: 2 });
    rich(CARDINFO[k][2], x, y + 272, 440, { sz: 28, lh: 38, a: ik, hl: C.acc });
  });
}
function s9a(lt) {
  title(lt, 'KARTU SKOR', 245, { col: C.acc });
  sub(lt, 'Mulai tiap game [[lebih unggul]]', 345);
  cardRow(lt, ['free15', 'free30', 'golden'], 700, 290, .5, 340);
  const k = enter(lt, 3.6, .6);
  if (k > 0) {
    panel(110, 1330 + (1 - k) * 40, 860, 230, { a: k, r: 30 });
    X.save(); X.globalAlpha *= k;
    const oy = (1 - k) * 40;
    txt('GAME 1 · sebelum servis', W / 2, 1380 + oy, { sz: 26, col: C.muted, w: 800 });
    headPair('LR', 230, 1470 + oy, 40);
    headPair('HN', 850, 1470 + oy, 40);
    const s15 = P(lt, 4.3, .4);
    txt(s15 > 0 ? '15' : '0', 430, 1472 + oy, { sz: 120, fam: 'BSD', col: s15 > 0 ? C.gold : C.cream, glow: s15 > 0 ? 'rgba(242,193,78,.6)' : undefined });
    txt('–', 540, 1472 + oy, { sz: 100, fam: 'BSD' });
    txt('0', 650, 1472 + oy, { sz: 120, fam: 'BSD' });
    X.restore();
    stamp('FREE 15', 430, 1552 + oy, P(lt, 4.3, .5), C.acc, -.08, 34);
  }
  sub(lt, 'Efeknya otomatis tercatat di [[papan skor wasit]].', 1660, { t0: 4.8, sz: 38 });
}
function s9b(lt) {
  title(lt, 'KARTU POIN', 245, { col: C.acc });
  sub(lt, 'Ubah [[poin klasemen]] dalam sekali menang', 345);
  cardRow(lt, ['double', 'steal', 'swap'], 700, 290, .5, 340);
  const k = enter(lt, 3.6, .6);
  if (k > 0) {
    panel(110, 1360 + (1 - k) * 40, 860, 200, { a: k, r: 30 });
    X.save(); X.globalAlpha *= k;
    const y = 1460 + (1 - k) * 40;
    txt('Menang di Court 3', 330, y, { sz: 34, w: 800 });
    const a1 = E.back(P(lt, 4.0, .4)), a2 = E.back(P(lt, 4.5, .4)), a3 = E.back(P(lt, 5.0, .5));
    tf(590, y, a1, 0, cl(a1 * 2), () => txt('+3', 0, 0, { sz: 96, fam: 'BSD', col: C.plus }));
    tf(710, y, a2, 0, cl(a2 * 2), () => txt('×2', 0, 0, { sz: 96, fam: 'BSD', col: C.acc }));
    tf(860, y, a3, 0, cl(a3 * 2), () => txt('= +6', 0, 0, { sz: 96, fam: 'BSD', col: C.gold, glow: 'rgba(242,193,78,.6)' }));
    X.restore();
  }
  sub(lt, 'Kartu langka ini bisa [[membalik klasemen]]!', 1660, { t0: 5.4, sz: 38 });
}
function s9c(lt) {
  title(lt, 'KARTU TAKTIK', 245, { col: C.acc });
  sub(lt, 'Atur lawan & ganggu permainan mereka', 345);
  cardGrid(lt, ['pick', 'nosmash', 'noglass', 'swh'], .5);
  sub(lt, 'Melanggar larangan? [[Wasit memberi poin]] ke lawan.', 1790, { t0: 4.6, sz: 36 });
}
function s9d(lt) {
  title(lt, 'KARTU JAWABAN', 245, { col: C.acc });
  sub(lt, 'Dipakai saat lawan memasang kartu', 345);
  cardRow(lt, ['block', 'reverse'], 700, 300, .5, 440);
  const k = enter(lt, 3.6, .6);
  if (k > 0) {
    panel(110, 1330 + (1 - k) * 40, 860, 330, { a: k, r: 30 });
    X.save(); X.globalAlpha *= k;
    const oy = (1 - k) * 40;
    card('zonk', 250, 1495 + oy, 180, { count: 6 });
    stamp('DIBUANG', 250, 1500 + oy, P(lt, 4.4, .5), C.red, -.25, 34);
    txt('ZONK!', 380, 1440 + oy, { sz: 64, fam: 'BSD', col: C.gold, al: 'left' });
    rich('Langsung dibuang, tidak mengisi slot tangan 😅', 380, 1530 + oy, 540, { sz: 30, al: 'left', lh: 42 });
    X.restore();
  }
  sub(lt, 'Reverse: untuk No Smash, No Glass, Switch Hand & Steal All', 1750, { t0: 5.2, sz: 30, col: C.muted });
}

/* 10. Keseruan: cerita satu match */
function s10(lt) {
  txt('SATU KARTU,', W / 2, 215 + (1 - enter(lt, .15)) * 40, { sz: 112, fam: 'BSD', col: C.gold, a: enter(lt, .15), stroke: 'rgba(10,22,40,.6)', sw: 12 });
  txt('SEMUA BERUBAH!', W / 2, 330 + (1 - enter(lt, .35)) * 40, { sz: 112, fam: 'BSD', col: C.cream, a: enter(lt, .35), stroke: 'rgba(10,22,40,.6)', sw: 12 });
  const ak = enter(lt, .3, .8);
  // court 3 horizontal
  X.save(); X.globalAlpha *= ak;
  courtTile(50, 470, 980, 520, 2, { horiz: true });
  X.restore();
  pill('COURT 3 · ±3', W / 2, 470, { sz: 26, bg: C.bg, col: '#fff', border: COURTS[2].c, a: ak, ls: 2 });
  // pemain
  const jumpR = lt > 11.6 ? Math.abs(Math.sin((lt - 11.6) * 6)) * 70 * (1 - P(lt, 14.5, 1)) : 0;
  const sadL = P(lt, 11.6, .4);
  const pl = [['lulu', 200, 0], ['rezaerlangga', 370, 0], ['herry', 710, 1], ['nina', 880, 1]];
  pl.forEach(([k, x, side], i) => {
    const e = E.back(P(lt, .5 + i * .12, .6));
    if (e <= 0) return;
    const bob = Math.sin(lt * 2.4 + i) * 5;
    const dy = side ? -jumpR * (i % 2 ? 1 : .8) : sadL * 6;
    chibi(k, x, 940 + bob, 300 * e, { dy, sy: side ? 1 : 1 - .05 * sadL, flipX: side === 1 });
  });
  txt('Lulu & Reza', 285, 1035, { sz: 32, w: 800, a: ak });
  txt('Herry & Nina', 795, 1035, { sz: 32, w: 800, a: ak });
  if (sadL > 0) {
    txt('😱', 285, 600 - 10 * Math.sin(lt * 5), { sz: 72, a: sadL * (1 - P(lt, 15, .6)) });
    txt('🎉', 795, 600 - jumpR * .4, { sz: 72, a: sadL * (1 - P(lt, 15, .6)) });
  }
  // beat 1: steal
  const s1k = E.back(P(lt, 1.2, .5));
  const s1fly = E.io(P(lt, 3.6, .8));
  const s1flip = E.io(P(lt, 1.6, .55));
  const revHit = P(lt, 9.0, .6);
  if (s1k > 0) {
    const x = lerp(540, 118, s1fly), y = lerp(1430, 568, s1fly), w = lerp(280, 108, s1fly);
    const rot = lerp(0, -.12, s1fly) + Math.PI * E.io(revHit);
    card('steal', x, y, w, { flip: s1flip, s: s1k, rot, glow: s1fly < 1 && s1flip > .5 ? 'rgba(242,193,78,.8)' : undefined });
    if (revHit > 0) stamp('DIBALIK!', 150, 580, P(lt, 9.4, .6), C.acc, -.2, 36);
  }
  // beat 2: reverse
  const r1k = E.back(P(lt, 6.8, .5));
  const rflip = E.io(P(lt, 7.3, .55));
  const rfly = E.io(P(lt, 8.4, .7));
  const rland = E.io(P(lt, 9.6, .6));
  if (r1k > 0) {
    let x = lerp(540, 170, rfly), y = lerp(1430, 590, rfly), w = lerp(280, 130, rfly);
    x = lerp(x, 962, rland); y = lerp(y, 568, rland); w = lerp(w, 108, rland);
    card('reverse', x, y, w, { flip: rflip, s: r1k, rot: rfly * .4 * (1 - rland) + rland * .12, glow: rfly < 1 && rflip > .5 ? 'rgba(232,144,47,.8)' : undefined });
  }
  if (revHit > 0 && revHit < 1) {
    X.save(); X.globalAlpha = .35 * (1 - revHit); X.fillStyle = '#fff'; X.fillRect(0, 0, W, H); X.restore();
  }
  // notifikasi HP
  const nk = E.out(P(lt, 4.5, .5)) * (1 - E.io(P(lt, 6.3, .4)));
  if (nk > 0) {
    const y = 1400 + (1 - nk) * 80;
    X.save(); X.globalAlpha *= nk;
    X.shadowColor = 'rgba(0,0,0,.5)'; X.shadowBlur = 30; X.shadowOffsetY = 10;
    rr(80, y - 110, 920, 220, 36); X.fillStyle = 'rgba(242,235,221,.97)'; X.fill();
    X.restore();
    X.save(); X.globalAlpha *= nk;
    X.drawImage(IMG.logo, 112, y - 86, 64, 64);
    txt('PADDOC HOST · sekarang', 196, y - 56, { sz: 24, al: 'left', col: '#5B6A7E', shadow: false, w: 800 });
    rich('⚡ Lawan memakai [[STEAL ALL POINTS]] ke timmu!', 112, y + 4, 860, { sz: 33, al: 'left', col: '#13233A', hl: C.acc2 });
    rich('Kamu memegang [[REVERSE]] — jawab sekarang?', 112, y + 58, 860, { sz: 28, al: 'left', col: '#5B6A7E', hl: '#13233A' });
    X.restore();
  }
  // keterangan
  const cap = (s, a, b) => {
    const k = enter(lt, a, .5) * (1 - P(lt, b, .4));
    if (k > 0) rich(s, W / 2, 1120 + (1 - k) * 20, 960, { sz: 40, a: k, hl: C.gold });
  };
  cap('Lulu & Reza memakai [[STEAL ALL POINTS]]!', 2.1, 6.4);
  cap('Herry & Nina menjawab dengan [[REVERSE]]!', 7.3, 9.6);
  cap('Kini [[Herry & Nina]] yang bisa merebut semua poin!', 9.9, 99);
  sub(lt, 'Strategi, gertakan & kejutan dalam [[satu match]]!', 1640, { t0: 12.2, sz: 40 });
  sub(lt, 'Kartu tampil besar di papan iPad & HP pemain dapat notifikasi.', 1730, { t0: 12.9, sz: 30, col: C.muted });
  confetti(lt, 11.7, 90, 795, 900, 7, .8);
}

/* 11. Aturan kartu */
function s11(lt) {
  title(lt, 'ATURAN MAIN KARTU', 245);
  const rules = [
    'Maks. [[1 kartu per tim]] per match, termasuk Block & Reverse',
    '[[Penantang]] umumkan kartu lebih dulu, lalu lawan',
    'Kartu sebelum match ditutup saat [[Game start]]',
    'Salah pasang? [[Batalkan]] selama match belum mulai',
    'Isi tangan [[rahasia]]: layar umum hanya tampil jumlahnya'
  ];
  rules.forEach((s, i) => {
    const k = enter(lt, .5 + i * .7, .6);
    if (k <= 0) return;
    const y = 450 + i * 175, x0 = 70 + (1 - k) * 80;
    panel(x0, y - 70, 940, 140, { a: k, r: 28 });
    X.save(); X.globalAlpha *= k;
    X.beginPath(); X.arc(x0 + 76, y, 44, 0, 7); X.fillStyle = C.gold; X.fill();
    X.restore();
    txt(String(i + 1), x0 + 76, y + 4, { sz: 58, fam: 'BSD', col: C.ink, a: k, shadow: false });
    rich(s, x0 + 150, y, 760, { sz: 33, al: 'left', a: k, vc: true, lh: 44 });
  });
  // kartu tertutup
  const bk = enter(lt, 4.4, .7);
  if (bk > 0) {
    card('back', 440, 1500 + (1 - bk) * 80, 170, { rot: -.14, a: bk });
    card('back', 640, 1490 + (1 - bk) * 80, 170, { rot: .12, a: bk });
    const q = Math.sin(lt * 3) * 6;
    txt('?', 440, 1500 + q, { sz: 120, fam: 'BSD', col: C.gold, a: bk, stroke: C.bg, sw: 10 });
    txt('?', 640, 1490 - q, { sz: 120, fam: 'BSD', col: C.gold, a: bk, stroke: C.bg, sw: 10 });
  }
  sub(lt, 'Lawan tidak tahu kartumu. [[Gertak]] atau simpan untuk nanti?', 1745, { t0: 5.0, sz: 36 });
}

/* 12. Klasemen & podium */
const S12_FINAL = [['HN', 7, 6], ['SA', 4, 3], ['LR', 3, 2], ['FW', 1, 0], ['MY', -2, -3], ['DD', -5, -8]];
const S12_START = ['LR', 'FW', 'HN', 'DD', 'SA', 'MY'];
function s12(lt) {
  const lbOut = E.io(P(lt, 6.0, .5));
  if (lbOut < 1) {
    X.save(); X.globalAlpha *= 1 - lbOut;
    title(lt, 'KLASEMEN', 245);
    sub(lt, 'Total [[poin court]], lalu [[selisih game]]', 345);
    pill('Contoh ilustrasi', W / 2, 430, { sz: 22, a: enter(lt, .6), bg: 'rgba(156,174,196,.15)', col: C.muted });
    const sp = E.io(P(lt, 2.4, 1.1));
    S12_FINAL.forEach(([tm, pts, gd], fi) => {
      const si = S12_START.indexOf(tm);
      const slot = lerp(si, fi, sp);
      const k = enter(lt, .5 + si * .12, .5);
      if (k <= 0) return;
      const y = 560 + slot * 158;
      const top = sp >= 1 && fi === 0;
      panel(70 + (1 - k) * 60, y - 66, 940, 132, { a: k, r: 26, border: top ? C.gold : undefined, bw: top ? 4 : 2 });
      X.save(); X.globalAlpha *= k;
      txt(sp >= 1 ? String(fi + 1) : '·', 130, y + 3, { sz: 64, fam: 'BSD', col: top ? C.gold : C.muted, shadow: false });
      headPair(tm, 245, y, 42);
      txt(tname(tm), 325, y - 18, { sz: 32, al: 'left', w: 800 });
      txt('selisih game ' + (gd > 0 ? '+' : '') + gd, 325, y + 26, { sz: 24, al: 'left', col: C.muted, shadow: false });
      const cnt = Math.round(pts * E.out(P(lt, 1.2, 1.2)));
      const col = pts > 0 ? C.plus : pts < 0 ? C.red : C.cream;
      txt((cnt > 0 ? '+' : cnt < 0 ? '−' : '') + Math.abs(cnt), 960, y + 4, { sz: 84, fam: 'BSD', col, al: 'right' });
      X.restore();
    });
    X.restore();
  }
  // podium
  const pk = P(lt, 6.2, .1);
  if (pk > 0) {
    const tk = enter(lt, 6.3, .6);
    txt('🏆', W / 2, 250 - (1 - tk) * 40, { sz: 110, a: tk });
    txt('JUARA POWER CUP', W / 2, 390 + (1 - tk) * 40, { sz: 120, fam: 'BSD', col: C.gold, a: tk, stroke: 'rgba(10,22,40,.6)', sw: 12, glow: 'rgba(242,193,78,.5)' });
    rays(W / 2, 900, 800, enter(lt, 6.8, 1) * .5, lt * .2, C.gold);
    const base = 1560;
    const pods = [[1, 230, 300, C.silver, 'SA'], [0, 540, 440, C.gold, 'HN'], [2, 850, 230, C.bronze, 'LR']];
    pods.forEach(([rank, x, h, col, tm], i) => {
      const st = 6.6 + (2 - rank) * .35;
      const k = E.out(P(lt, st, .7));
      if (k <= 0) return;
      const hh = h * k;
      X.save();
      const g = X.createLinearGradient(0, base - hh, 0, base);
      g.addColorStop(0, col); g.addColorStop(1, mixHex(col, '#0A1628', .55));
      rr(x - 150, base - hh, 300, hh + 40, [20, 20, 0, 0]); X.fillStyle = g; X.fill();
      X.restore();
      txt(String(rank + 1), x, base - hh + 90, { sz: 130, fam: 'BSD', col: C.bg, a: k, shadow: false });
      const ck = E.back(P(lt, st + .5, .5));
      if (ck > 0) {
        const jmp = rank === 0 ? Math.abs(Math.sin((lt - st) * 5)) * 50 : Math.abs(Math.sin((lt - st) * 4 + i)) * 22;
        const ch = rank === 0 ? 260 : 220;
        chibi(TEAM[tm][0], x - 62, base - hh + 4, ch * ck, { dy: -jmp, shadow: false });
        chibi(TEAM[tm][1], x + 62, base - hh + 4, ch * ck, { dy: -jmp * .8, shadow: false });
        pill(tname(tm), x, base + 75, { sz: 26, a: ck, bg: rank === 0 ? C.gold : C.surf2, col: rank === 0 ? C.ink : C.cream });
      }
    });
    confetti(lt, 7.4, 140, W / 2, 1000, 3, 1.2);
    sub(lt, 'Podium bisa disimpan jadi [[foto & video]] untuk dibagikan!', 1760, { t0: 8.2, sz: 36 });
  }
}

/* 13. Fitur lainnya */
function tile(lt, i, t0, ttl, desc, badge, draw) {
  const x = i % 2 ? 790 : 290, y = 790 + Math.floor(i / 2) * 590;
  const k = E.back(P(lt, t0, .6));
  if (k <= 0) return;
  tf(x, y, k, 0, cl(k * 2), () => {
    panel(-240, -265, 480, 530, { r: 32 });
    X.save(); rr(-222, -247, 444, 300, 22); X.clip();
    X.fillStyle = C.bg2; X.fillRect(-222, -247, 444, 300);
    draw(lt - t0, -222, -247, 444, 300);
    X.restore();
    txt(ttl, 0, 100, { sz: Math.min(44, 44 * 430 / tw(ttl, 44, 'BSD', 900, 1)), fam: 'BSD', col: C.gold, ls: 1 });
    rich(desc, 0, 160, 420, { sz: 26, lh: 36 });
    if (badge) pill('BARU', 200, -255, { sz: 22, bg: C.red, col: '#fff', fam: 'BSD', ls: 3, al: 'right' });
  });
}
function s13a(lt) {
  title(lt, 'FITUR SERU LAINNYA', 245);
  sub(lt, 'Bukan cuma Power Cup — ini yang bikin main makin asyik', 345, { sz: 34 });
  tile(lt, 0, .6, 'LOBI & AVATAR CHIBI', 'Karaktermu jatuh ke lapangan saat bergabung', false, (t, x, y, w, h) => {
    imgCover(IMG.court, x, y, w, h, 1.2);
    ['sisil', 'max', 'nina'].forEach((k, i) => {
      const p = P(t, .3 + i * .35, .4);
      chibi(k, x + 110 + i * 115, y + h - 30 - 300 * (1 - p * p), 170, { dy: Math.sin(t * 2 + i) * 4 });
    });
  });
  tile(lt, 1, 1.2, 'MAIN BOLA DI LOBI', 'Lempar bola & reli bareng sambil menunggu', true, (t, x, y, w, h) => {
    imgCover(IMG.court, x, y, w, h, 1.6, .5, .6);
    X.fillStyle = 'rgba(10,22,40,.3)'; X.fillRect(x, y, w, h);
    chibi('aria', x + 80, y + h - 30, 180, {});
    chibi('wuluh', x + w - 80, y + h - 30, 180, { flipX: true });
    const per = 1.4, ph = (t % per) / per, dir = Math.floor(t / per) % 2;
    const bx = lerp(x + 120, x + w - 120, dir ? 1 - ph : ph), by = y + 150 - Math.sin(Math.PI * ph) * 100;
    X.beginPath(); X.arc(bx, by, 16, 0, 7); X.fillStyle = '#D7F24E'; X.shadowColor = '#D7F24E'; X.shadowBlur = 20; X.fill(); X.shadowBlur = 0;
  });
  tile(lt, 2, 1.8, 'NOTIFIKASI GILIRAN', 'Dipanggil ke court? HP-mu langsung bunyi', false, (t, x, y, w, h) => {
    X.fillStyle = '#16273F'; X.fillRect(x, y, w, h);
    const sh = Math.sin(t * 40) * 5 * (t % 2 < .4 ? 1 : 0);
    const nx = x + 24 + sh, ny = y + 50;
    rr(nx, ny, w - 48, 200, 24); X.fillStyle = C.cream; X.fill();
    X.drawImage(IMG.logo, nx + 20, ny + 18, 44, 44);
    txt('Court 2 · giliranmu main!', nx + 76, ny + 40, { sz: 24, al: 'left', col: '#13233A', shadow: false, w: 800 });
    txt('Partner: Farid · lawan Max & Yeni', nx + 20, ny + 92, { sz: 20, al: 'left', col: '#5B6A7E', shadow: false });
    rr(nx + 20, ny + 126, 170, 54, 27); X.fillStyle = '#2E7D4F'; X.fill();
    txt('Siap', nx + 105, ny + 154, { sz: 24, col: '#fff', shadow: false, w: 800 });
    rr(nx + 206, ny + 126, 170, 54, 27); X.fillStyle = '#D8CFBE'; X.fill();
    txt('Skip dulu', nx + 291, ny + 154, { sz: 22, col: '#13233A', shadow: false, w: 800 });
  });
  tile(lt, 3, 2.4, 'FOTO PRO AI', 'Foto profil ala atlet pro, dibuat otomatis', false, (t, x, y, w, h) => {
    X.fillStyle = '#16273F'; X.fillRect(x, y, w, h);
    PHOTO_KEYS.forEach((k, i) => {
      const im = IMG['p_' + k]; if (!im) return;
      const off = i - 1, sw = 150, shh = 225;
      X.save(); X.translate(x + w / 2 + off * 130, y + h / 2 + 10 + Math.abs(off) * 14); X.rotate(off * .14);
      X.shadowColor = 'rgba(0,0,0,.5)'; X.shadowBlur = 20;
      rr(-sw / 2 - 6, -shh / 2 - 6, sw + 12, shh + 12, 12); X.fillStyle = '#fff'; X.fill(); X.shadowBlur = 0;
      X.drawImage(im, -sw / 2, -shh / 2, sw, shh); X.restore();
    });
    txt('✨', x + w - 50, y + 50 + Math.sin(t * 3) * 6, { sz: 44 });
  });
}
function s13b(lt) {
  title(lt, 'FITUR SERU LAINNYA', 245);
  sub(lt, 'Semua tersinkron live di iPad & HP', 345, { sz: 34 });
  tile(lt, 0, .5, 'PODIUM & VIDEO', 'Rayakan juara, simpan foto & video', false, (t, x, y, w, h) => {
    X.fillStyle = '#16273F'; X.fillRect(x, y, w, h);
    const base = y + h - 20;
    [[x + 110, 90, C.silver, 'sisil'], [x + w / 2, 130, C.gold, 'herry'], [x + w - 110, 70, C.bronze, 'lulu']].forEach(([px, ph, col, k], i) => {
      rr(px - 65, base - ph, 130, ph, [10, 10, 0, 0]); X.fillStyle = col; X.fill();
      chibi(k, px, base - ph + 2, 150, { dy: -Math.abs(Math.sin(t * 4 + i)) * 14, shadow: false });
    });
    confetti(t % 3, 0, 40, x + w / 2, y + 160, 11, 1);
  });
  tile(lt, 1, 1.1, 'KUDOS', 'Beri apresiasi untuk pemain & host', false, (t, x, y, w, h) => {
    X.fillStyle = '#16273F'; X.fillRect(x, y, w, h);
    const ks = ['🔥 Smash Machine', '🤝 Dream Partner', '🧱 Wall Master', '🎯 Game Reader', '⭐ Super Host'];
    ks.forEach((s, i) => {
      const k = E.back(P(t, .3 + i * .3, .4));
      if (k > 0) tf(x + w / 2 + (i % 2 ? 70 : -60), y + 45 + i * 52, k, 0, 1, () => pill(s, 0, 0, { sz: 22, bg: i % 2 ? C.acc : C.surf2, col: i % 2 ? C.ink : C.cream, shadow: false }));
    });
  });
  tile(lt, 2, 1.7, 'SUDAH DATANG & WAITING LIST', 'Yang hadir di venue langsung masuk putaran', true, (t, x, y, w, h) => {
    X.fillStyle = '#16273F'; X.fillRect(x, y, w, h);
    ['farid', 'dianty', 'max', 'toha'].forEach((k, i) => {
      const yy = y + 45 + i * 68;
      head(k, x + 50, yy, 26);
      txt(NM[k], x + 90, yy, { sz: 24, al: 'left', shadow: false, w: 800 });
      const ok = i < 3 ? P(t, .4 + i * .4, .3) : 0;
      if (i < 3) pill(ok > 0 ? '✓ Datang' : 'Belum', x + w - 24, yy, { sz: 18, al: 'right', bg: ok > 0 ? '#2E7D4F' : C.surf2, col: '#fff', shadow: false });
      else pill('Waiting #1', x + w - 24, yy, { sz: 18, al: 'right', bg: 'rgba(238,111,95,.25)', col: C.red, shadow: false });
    });
  });
  tile(lt, 3, 2.3, 'PEMBAYARAN SESI', 'Bayar & unggah bukti, langsung tercatat', false, (t, x, y, w, h) => {
    X.fillStyle = '#16273F'; X.fillRect(x, y, w, h);
    rr(x + 70, y + 30, w - 140, 240, 18); X.fillStyle = C.cream; X.fill();
    txt('Bukti transfer', x + w / 2, y + 70, { sz: 22, col: '#5B6A7E', shadow: false, w: 800 });
    txt('🧾 bukti-bayar.jpg', x + w / 2, y + 128, { sz: 30, col: '#13233A', shadow: false, w: 800 });
    const ok = E.back(P(t, .8, .5));
    if (ok > 0) tf(x + w / 2, y + 205, ok, 0, 1, () => pill('✓ Lunas', 0, 0, { sz: 26, bg: '#2E7D4F', col: '#fff', shadow: false }));
  });
}

/* 14. Ajakan */
function s14(lt) {
  const lk = E.back(P(lt, .2, .7));
  if (lk > 0) tf(W / 2, 170, lk, 0, 1, () => { X.shadowColor = 'rgba(232,144,47,.6)'; X.shadowBlur = 40; X.drawImage(IMG.logo, -110, -110, 220, 220); });
  title(lt, 'AYO MAIN BARENG', 380, { sz: 150, t0: .5 });
  title(lt, 'DI POWER CUP!', 515, { sz: 130, t0: .8, col: C.cream });
  const steps = ['Buka [[Paddoc Host]] di HP', 'Masuk [[lobi]] sesi Power Cup', 'Tekan [[Saya Bergabung]]'];
  steps.forEach((s, i) => {
    const k = enter(lt, 1.6 + i * .5, .6);
    if (k <= 0) return;
    const y = 680 + i * 120, x0 = 120 + (1 - k) * 60;
    panel(x0, y - 50, 840, 100, { a: k, r: 50 });
    X.save(); X.globalAlpha *= k; X.beginPath(); X.arc(x0 + 50, y, 36, 0, 7); X.fillStyle = C.acc; X.fill(); X.restore();
    txt(String(i + 1), x0 + 50, y + 3, { sz: 50, fam: 'BSD', col: C.ink, a: k, shadow: false });
    rich(s, x0 + 110, y, 700, { sz: 36, al: 'left', a: k, vc: true });
  });
  const wk = enter(lt, 3.4, .6);
  if (wk > 0) {
    pill('Belum punya akun? Chat admin WA 0851-2130-0042', W / 2, 1065 + (1 - wk) * 30, { sz: 30, bg: C.wa, col: '#06301A', a: wk, h: 72 });
  }
  const crowd = ['nina', 'farid', 'sisil', 'aziz', 'lulu', 'euis', 'herry', 'dianty', 'max'];
  [1, 3, 5, 7, 0, 2, 4, 6, 8].forEach((i) => {
    const k = crowd[i];
    const st = 2.4 + Math.abs(i - 4) * .15;
    const e = E.back(P(lt, st, .6));
    if (e <= 0) return;
    const x = 80 + i * 115, row = i % 2;
    const jmp = Math.abs(Math.sin((lt - st) * 3.2 + i * .7)) * 26 * P(lt, st + .6, .5);
    chibi(k, x, (row ? 1520 : 1600), (row ? 270 : 300) * e, { dy: -jmp, shadow: true });
  });
  const vk = P(lt, 5.6, .5);
  if (vk > 0) {
    const s = lerp(2.2, 1, E.out5(vk));
    tf(W / 2, 1770, s * (1 + .03 * Math.sin(lt * 4)), -.04, cl(vk * 3), () => txt('VAMOS!!!', 0, 0, { sz: 190, fam: 'BSD', col: C.gold, stroke: C.bg, sw: 14, glow: 'rgba(242,193,78,.7)', ls: 6 }));
    confetti(lt, 5.8, 120, W / 2, 1700, 21, 1.3);
  }
}

/* =================== TIMELINE =================== */
const SCENES = [
  { d: 8, f: s1, glow: '#E8902F', ch: '' },
  { d: 8, f: s2, glow: '#2A6AAE', ch: '' },
  { d: 10, f: s3, glow: '#E8902F', ch: 'CARA MAIN · 1/5' },
  { d: 10, f: s4, glow: '#5BA8E8', ch: 'CARA MAIN · 2/5' },
  { d: 10, f: s5, glow: '#2E7D4F', ch: 'CARA MAIN · 3/5' },
  { d: 8, f: s6, glow: '#2A6AAE', ch: 'CARA MAIN · 4/5' },
  { d: 10, f: s7, glow: '#E8902F', ch: 'CARA MAIN · 5/5' },
  { d: 10, f: s8, glow: '#F2C14E', ch: 'KARTU POWER' },
  { d: 8, f: s9a, glow: '#E8902F', ch: 'KARTU POWER · 1/4' },
  { d: 8, f: s9b, glow: '#2A6AAE', ch: 'KARTU POWER · 2/4' },
  { d: 10, f: s9c, glow: '#2E7D4F', ch: 'KARTU POWER · 3/4' },
  { d: 8, f: s9d, glow: '#E8902F', ch: 'KARTU POWER · 4/4' },
  { d: 16, f: s10, glow: '#2A6AAE', ch: 'KESERUAN' },
  { d: 8, f: s11, glow: '#F2C14E', ch: 'ATURAN KARTU' },
  { d: 12, f: s12, glow: '#F2C14E', ch: 'KLASEMEN' },
  { d: 10, f: s13a, glow: '#5BA8E8', ch: 'FITUR LAINNYA' },
  { d: 10, f: s13b, glow: '#2E7D4F', ch: 'FITUR LAINNYA' },
  { d: 12, f: s14, glow: '#E8902F', ch: '' }
];
let acc = 0;
SCENES.forEach((s) => { s.t0 = acc; acc += s.d; });
const DURATION = acc;

/* efek suara: [waktu lokal, jenis] per adegan */
const SFX = [
  [[0, 'riser'], [.5, 'pop'], [2.4, 'slam'], [3.5, 'whoosh'], [4.2, 'flip'], [4.38, 'flip'], [4.56, 'flip'], [4.74, 'flip'], [4.92, 'flip']],
  [].concat(...Array.from({ length: 12 }, (_, i) => [[.9 + i * .26 + .5, 'pop']])),
  [[.3, 'whoosh'], ...Array.from({ length: 7 }, (_, i) => [1.4 + i * .42, 'pop']), [4.4, 'tap'], [4.65, 'pop'], [5.05, 'ding'], [6.0, 'notif'], [6.8, 'swish'], [7.6, 'swish']],
  [[.4, 'swish'], [1.6, 'spin'], [3.8, 'ding'], ...Array.from({ length: 6 }, (_, i) => [5.1 + i * .18, 'pop'])],
  [[.4, 'pop'], [.7, 'pop'], [1.0, 'pop'], [3.2, 'riser_s'], [4.05, 'coin'], [5.25, 'thud']],
  [...Array.from({ length: 5 }, (_, i) => [.9 + i * .7 + .3, 'tick']), [4.6, 'slam'], [5.4, 'stamp']],
  [[.1, 'slam'], [2.4, 'spin'], [4.6, 'ding'], [5.5, 'tap'], [5.6, 'ding'], [6.6, 'pop'], [7.1, 'pop']],
  [[.7, 'whoosh']],
  [[.85, 'flip'], [1.65, 'flip'], [2.45, 'flip'], [4.3, 'stamp']],
  [[.85, 'flip'], [1.65, 'flip'], [2.45, 'flip'], [4.0, 'pop'], [4.5, 'pop'], [5.0, 'coin']],
  [[.85, 'flip'], [1.6, 'flip'], [2.35, 'flip'], [3.1, 'flip']],
  [[.85, 'flip'], [1.65, 'flip'], [4.4, 'stamp']],
  [[1.2, 'whoosh'], [1.6, 'flip'], [2.1, 'ding'], [3.6, 'whoosh'], [4.5, 'notif'], [6.8, 'whoosh'], [7.3, 'flip'], [8.4, 'whoosh'], [9.0, 'slam'], [9.4, 'stamp'], [11.7, 'cheer']],
  Array.from({ length: 5 }, (_, i) => [.5 + i * .7, 'swish']).concat([[4.4, 'whoosh']]),
  [[.5, 'swish'], [2.4, 'spin_s'], [6.3, 'slam'], [7.4, 'cheer']],
  [[.6, 'pop'], [1.2, 'pop'], [1.8, 'pop'], [2.4, 'pop']],
  [[.5, 'pop'], [1.1, 'pop'], [1.7, 'pop'], [2.3, 'pop'], [3.1, 'coin']],
  [[.2, 'pop'], [1.6, 'swish'], [2.1, 'swish'], [2.6, 'swish'], [3.4, 'notif'], [5.6, 'slam'], [5.8, 'cheer']]
];
const EVENTS = [];
SCENES.forEach((s, i) => {
  if (i > 0) EVENTS.push({ t: s.t0 - .25, k: 'trans' });
  (SFX[i] || []).forEach(([t, k]) => EVENTS.push({ t: s.t0 + t, k }));
});
// detak pengocokan kartu (adegan 8) mengikuti pergantian wajah kartu
(function () {
  const s = SCENES[7]; let prev = 0;
  for (let lt = 1.3; lt < 4.6; lt += 1 / 120) { const f = Math.floor(s8Phase(lt)); if (f !== prev) { EVENTS.push({ t: s.t0 + lt, k: 'tick' }); prev = f; } }
  EVENTS.push({ t: s.t0 + 4.6, k: 'reveal' }, { t: s.t0 + 6.0, k: 'whoosh' });
})();
EVENTS.sort((a, b) => a.t - b.t);

/* latar & partikel */
const PART = (() => { const R = rng(42); return Array.from({ length: 46 }, () => ({ x: R() * W, y: R() * H, s: 2 + R() * 5, v: 20 + R() * 50, ph: R() * 6 })); })();
function background(t, glow) {
  const g = X.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0B1A30'); g.addColorStop(.55, C.bg); g.addColorStop(1, '#070F1C');
  X.fillStyle = g; X.fillRect(0, 0, W, H);
  const rg = X.createRadialGradient(W / 2, 760, 0, W / 2, 760, 1100);
  rg.addColorStop(0, hexA(glow, .30)); rg.addColorStop(1, hexA(glow, 0));
  X.fillStyle = rg; X.fillRect(0, 0, W, H);
  // garis diagonal halus
  X.save(); X.globalAlpha = .05; X.strokeStyle = C.cream; X.lineWidth = 2;
  const off = (t * 18) % 120;
  for (let i = -20; i < 30; i++) { X.beginPath(); X.moveTo(i * 120 + off, 0); X.lineTo(i * 120 + off - H * .45, H); X.stroke(); }
  X.restore();
  PART.forEach((p) => {
    const y = ((p.y - t * p.v) % H + H) % H;
    X.save(); X.globalAlpha = .12 + .1 * Math.sin(t + p.ph);
    X.fillStyle = C.gold; X.beginPath(); X.arc(p.x + Math.sin(t * .5 + p.ph) * 20, y, p.s, 0, 7); X.fill(); X.restore();
  });
}
function header(t, ch, a) {
  if (a <= 0) return;
  X.save(); X.globalAlpha = a;
  X.drawImage(IMG.logo, 48, 46, 76, 76);
  txt('PADDOC HOST', 140, 72, { sz: 36, fam: 'BSD', al: 'left', ls: 3, shadow: false });
  txt('POWER CUP', 140, 106, { sz: 22, al: 'left', col: C.acc, ls: 4, shadow: false, w: 800 });
  X.restore();
}
function chapter(s, a) {
  if (!s || a <= 0) return;
  pill(s, W - 48, 84, { sz: 24, al: 'right', a, bg: 'rgba(232,144,47,.16)', col: C.acc, border: 'rgba(232,144,47,.6)', ls: 3 });
}
function wipe(t) {
  for (let i = 1; i < SCENES.length; i++) {
    const p = (t - (SCENES[i].t0 - .3)) / .6;
    if (p <= 0 || p >= 1) continue;
    const e = E.io(p);
    const sweep = lerp(-900, W + 900, e);
    X.save();
    X.translate(sweep, H / 2); X.rotate(-.35);
    X.fillStyle = hexA(C.acc, .9); X.fillRect(-90, -H, 180, H * 2);
    X.fillStyle = hexA(C.gold, .9); X.fillRect(120, -H, 34, H * 2);
    X.fillStyle = hexA(C.cream, .5); X.fillRect(-150, -H, 18, H * 2);
    X.restore();
  }
}

function draw(t) {
  X.setTransform(1, 0, 0, 1, 0, 0);
  X.globalAlpha = 1;
  let i = SCENES.findIndex((s) => t >= s.t0 && t < s.t0 + s.d);
  if (i < 0) i = SCENES.length - 1;
  const S = SCENES[i];
  const lt = t - S.t0;
  // warna cahaya latar berbaur antar adegan
  const prev = SCENES[i - 1];
  const glow = prev && lt < .8 ? mixHex(prev.glow, S.glow, E.io(lt / .8)) : S.glow;
  background(t, glow);
  const fin = i === 0 ? 1 : E.out(P(lt, 0, .35));
  const fout = i === SCENES.length - 1 ? 1 : 1 - E.in(P(lt, S.d - .35, .35));
  X.save();
  X.globalAlpha = fin * fout;
  const sc = 1 + .025 * (1 - fout);
  X.translate(W / 2, H / 2); X.scale(sc, sc); X.translate(-W / 2, -H / 2);
  S.f(lt, S.d);
  X.restore();
  // header tetap dari adegan 3 sampai 17
  const ha = cl((t - SCENES[2].t0 + .3) / .5) * (1 - cl((t - SCENES[17].t0 + .3) / .5));
  header(t, S.ch, ha);
  const cha = Math.min(fin, fout);
  chapter(S.ch, ha * cha);
  wipe(t);
  // fade dari/ke hitam
  const blk = Math.max(1 - cl(t / .6), cl((t - (DURATION - 1.2)) / 1.2));
  if (blk > 0) { X.globalAlpha = blk; X.fillStyle = '#000'; X.fillRect(0, 0, W, H); X.globalAlpha = 1; }
}

window.DURATION = DURATION / SPEED;
window.SPEED = SPEED;
window.EVENTS = EVENTS.map((e) => ({ t: e.t / SPEED, k: e.k }));
window.SCENES_T = SCENES.map((s) => ({ t0: s.t0 / SPEED, d: s.d / SPEED, ch: s.ch }));
const drawTimeline = draw;   // fungsi draw global = window.draw, simpan sebelum diganti
window.draw = (t) => drawTimeline(t * SPEED);
window.READY = (async () => {
  const jobs = [load('logo', 'assets/logo.png'), load('court', 'assets/court.webp')];
  CARD_KEYS.forEach((k) => jobs.push(load('k_' + k, 'assets/cards/' + k + '.webp')));
  Object.keys(NM).forEach((k) => jobs.push(load('c_' + k, 'assets/chibi/' + k + '.png')));
  PHOTO_KEYS.forEach((k) => jobs.push(load('p_' + k, 'assets/photo/' + k + '.jpg')));
  await Promise.all(jobs);
  await document.fonts.load('900 100px BSD');
  await document.fonts.load('700 40px PJS');
  await document.fonts.load('800 40px PJS');
  await document.fonts.ready;
  drawTimeline(0);
  return true;
})();
