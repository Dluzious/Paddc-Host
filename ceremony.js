/* ============================================================
   Paddoc Host — podium akhir sesi
   Semua digambar di <canvas> supaya bisa disimpan sebagai foto (PNG) dan video (MP4/WebM).
   Ceremony.open(data, opts) → { update(data), close(), root }
   data: { title, sub, bg, podium: [{ rank, people: [{ id, name, sprite, svg, photo }], line }],
           table: [{ rank, name, photos: [url], w, diff, me }], crowd: [{ id, name, sprite, svg }], cols: judul kolom angka (opsional) }
   opts: { nextLabel, onNext, onClose, extra: [{ label, onClick }] }
   ============================================================ */
var Ceremony = (function () {
  'use strict';
  var RANKC = { 1: ['#FFE38F', '#E3A72F', '#7A4E0C'], 2: ['#F1F4F8', '#AAB5C4', '#4F5C6E'], 3: ['#F4BE90', '#C27A43', '#5E3412'] };
  var CHEERS = ['VAMOS!', 'Mantap!', 'Keren!', 'Selamat!', 'GG!', 'Juara!', 'Hebat!', 'Woohoo!'];
  var CONF = ['#E8902F', '#F2C14E', '#2FAF6B', '#3A8DDE', '#E25D7A', '#FFFFFF'];
  var DISPLAY = "'Big Shoulders Display', 'Arial Narrow', sans-serif", BODY = "'Plus Jakarta Sans', system-ui, sans-serif";
  var REDUCE = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var imgs = {};
  function img(src) {
    if (!src) return null;
    if (!imgs[src]) { var im = new Image(); im.decoding = 'async'; im.src = src; imgs[src] = im; }
    return imgs[src];
  }
  function ok(im) { return !!(im && im.complete && im.naturalWidth > 0); }
  function svgSrc(svg) { return svg ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) : ''; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function ease(x) { x = clamp(x, 0, 1); return 1 - Math.pow(1 - x, 3); }
  function pop(x) { x = clamp(x, 0, 1); var c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); }
  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function fitText(c, text, maxW) {
    text = String(text || '');
    if (c.measureText(text).width <= maxW) return text;
    while (text.length > 1 && c.measureText(text + '…').width > maxW) text = text.slice(0, -1);
    return text + '…';
  }
  function cover(c, im, x, y, w, h) {
    var k = Math.max(w / im.naturalWidth, h / im.naturalHeight), iw = im.naturalWidth * k, ih = im.naturalHeight * k;
    c.drawImage(im, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
  }
  function face(c, im, cx, cy, r, ring, fallback) {
    c.save(); c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.closePath();
    c.fillStyle = '#1A3253'; c.fill(); c.clip();
    if (ok(im)) { var k = Math.max(2 * r / im.naturalWidth, 2 * r / im.naturalHeight), iw = im.naturalWidth * k, ih = im.naturalHeight * k; c.drawImage(im, cx - iw / 2, cy - r * 1.05, iw, ih); }
    else if (fallback) { c.fillStyle = '#9CAEC4'; c.font = '800 ' + Math.round(r * 0.9) + 'px ' + BODY; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(fallback, cx, cy + 1); }
    c.restore();
    if (ring) { c.lineWidth = Math.max(2, r * 0.14); c.strokeStyle = ring; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke(); }
  }
  function initials(n) { var w = String(n || '?').trim().split(/\s+/); return ((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase(); }
  /* karakter: sprite PNG/WebP (avatar chibi) atau SVG karakter bawaan */
  function figure(c, p, cx, footY, h, alpha) {
    var im = p._im;
    if (!ok(im)) return 0;
    var w = h * im.naturalWidth / im.naturalHeight;
    c.save(); if (alpha != null) c.globalAlpha = alpha;
    c.drawImage(im, cx - w / 2, footY - h, w, h);
    c.restore();
    return w;
  }
  function bubble(c, x, y, text, size) {
    c.font = '800 ' + size + 'px ' + BODY;
    var w = c.measureText(text).width + size * 1.1, h = size * 1.7;
    c.fillStyle = 'rgba(255,255,255,0.96)'; rr(c, x - w / 2, y - h, w, h, h / 2); c.fill();
    c.beginPath(); c.moveTo(x - size * 0.35, y - 1); c.lineTo(x, y + size * 0.45); c.lineTo(x + size * 0.35, y - 1); c.fill();
    c.fillStyle = '#13233A'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, x, y - h / 2 + 1);
  }

  function open(data, opts) {
    opts = opts || {};
    var root = document.createElement('div');
    root.className = 'cer'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true');
    root.innerHTML = '<div class="cer-stage"><canvas class="cer-cv"></canvas><button type="button" class="cer-x" data-c="close" aria-label="Tutup podium">×</button>' +
      '<ol class="cer-sr" aria-live="polite"></ol></div>' +
      '<div class="cer-bar"><button type="button" class="cer-btn" data-c="photo">Simpan foto</button>' +
      '<button type="button" class="cer-btn" data-c="video" hidden>Rekam video</button>' +
      (opts.extra || []).map(function (b, i) { return '<button type="button" class="cer-btn" data-x="' + i + '">' + esc(b.label) + '</button>'; }).join('') +
      '<button type="button" class="cer-btn primary" data-c="next">' + esc(opts.nextLabel || 'Lanjut') + '</button></div>';
    document.body.appendChild(root);
    var cv = root.querySelector('canvas'), c = cv.getContext('2d'), stage = root.querySelector('.cer-stage');
    var D = null, W = 0, H = 0, K = 1, t0 = performance.now(), raf = 0, alive = true, conf = [], bubbles = [], nextBub = 0, lastT = 0;
    var logo = img('icon-192.png');

    function prep(d) {
      D = d;
      var all = [];
      d.podium.forEach(function (s) { s.people.forEach(function (p) { all.push(p); p._ph = img(p.photo); }); });
      d.crowd.forEach(function (p) { all.push(p); });
      all.forEach(function (p) { p._im = img(p.sprite || svgSrc(p.svg)); });
      d.table.forEach(function (r) { r._ph = (r.photos || []).map(img); });
      d._bg = img(d.bg);
      root.setAttribute('aria-label', 'Podium ' + d.title);
      root.querySelector('.cer-sr').innerHTML = d.podium.map(function (s) {
        return '<li>Juara ' + s.rank + ': ' + esc(s.people.map(function (p) { return p.name; }).join(' & ')) + ', ' + esc(s.line) + '</li>';
      }).join('');
    }
    function size() {
      var r = stage.getBoundingClientRect();
      W = Math.max(200, r.width); H = Math.max(200, r.height);
      K = Math.min(window.devicePixelRatio || 1, 1400 / Math.max(W, H));
      cv.width = Math.round(W * K); cv.height = Math.round(H * K);
      cv.style.width = W + 'px'; cv.style.height = H + 'px';
    }
    function layout() {
      var wide = W / H >= 1.15;
      var sc = wide ? { x: 0, y: 0, w: W * 0.6, h: H } : { x: 0, y: 0, w: W, h: H * 0.6 };
      var tb = wide ? { x: W * 0.6, y: 0, w: W * 0.4, h: H } : { x: 0, y: H * 0.6, w: W, h: H * 0.4 };
      var base = sc.y + sc.h * (wide ? 0.8 : 0.84), bw = Math.min(sc.w * (wide ? 0.25 : 0.29), 230);
      var sh = Math.min(sc.h * (wide ? 0.27 : 0.25), bw * 1.3);
      var hs = wide ? { 1: sc.h * 0.17, 2: sc.h * 0.125, 3: sc.h * 0.095 } : { 1: sc.h * 0.19, 2: sc.h * 0.145, 3: sc.h * 0.115 };
      return { wide: wide, sc: sc, tb: tb, base: base, bw: bw, sh: sh, hs: hs };
    }
    function drawBg(L, t) {
      c.fillStyle = '#081426'; c.fillRect(0, 0, W, H);
      if (ok(D._bg)) { c.save(); c.globalAlpha = 0.55; cover(c, D._bg, 0, 0, W, H); c.restore(); }
      var g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(6,12,26,0.55)'); g.addColorStop(1, 'rgba(6,12,26,0.85)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      // lampu sorot bergerak
      var cx = L.sc.x + L.sc.w / 2;
      [[-1, 0.0], [1, 1.3]].forEach(function (s) {
        var a = Math.sin(t * 0.6 + s[1]) * 0.35, x0 = cx + s[0] * L.sc.w * 0.55, y0 = L.sc.y - 20;
        c.save(); c.translate(x0, y0); c.rotate(-s[0] * 0.5 + a);
        var lg = c.createLinearGradient(0, 0, 0, L.sc.h); lg.addColorStop(0, 'rgba(255,226,150,0.28)'); lg.addColorStop(1, 'rgba(255,226,150,0)');
        c.fillStyle = lg; c.beginPath(); c.moveTo(-8, 0); c.lineTo(8, 0); c.lineTo(L.sc.w * 0.22, L.sc.h * 1.1); c.lineTo(-L.sc.w * 0.22, L.sc.h * 1.1); c.closePath(); c.fill();
        c.restore();
      });
      // sinar di belakang juara 1
      c.save(); c.translate(cx, L.base - L.hs[1] - L.sh * 0.55); c.rotate(t * 0.25);
      for (var i = 0; i < 12; i++) {
        c.rotate(Math.PI / 6); c.fillStyle = 'rgba(255,215,120,0.07)';
        c.beginPath(); c.moveTo(0, 0); c.lineTo(L.sh * 1.6, -L.sh * 0.18); c.lineTo(L.sh * 1.6, L.sh * 0.18); c.closePath(); c.fill();
      }
      c.restore();
    }
    function drawTitle(L, t) {
      var a = ease(t / 0.6), x = L.sc.x + L.sc.w / 2, fs = clamp(L.sc.h * 0.075, 22, 54);
      c.save(); c.globalAlpha = a; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      c.fillStyle = '#F2C14E'; c.font = '800 ' + Math.round(fs * 0.38) + 'px ' + BODY; c.fillText(D.kicker || 'P O D I U M', x, L.sc.y + fs * 0.95);
      c.fillStyle = '#FFFFFF'; c.font = '900 ' + Math.round(fs) + 'px ' + DISPLAY; c.fillText(fitText(c, String(D.title).toUpperCase(), L.sc.w - 120), x, L.sc.y + fs * 1.95);
      c.fillStyle = 'rgba(242,235,221,0.75)'; c.font = '600 ' + Math.round(fs * 0.34) + 'px ' + BODY; c.fillText(fitText(c, D.sub || '', L.sc.w - 120), x, L.sc.y + fs * 2.5);
      c.restore();
    }
    function slotX(L, rank) { var cx = L.sc.x + L.sc.w / 2; return rank === 1 ? cx : rank === 2 ? cx - L.bw * 1.04 : cx + L.bw * 1.04; }
    function drawPodium(L, t) {
      var order = [2, 3, 1];                              // 1 digambar terakhir (paling depan)
      order.forEach(function (rank) {
        var s = D.podium.filter(function (x) { return x.rank === rank; })[0];
        var appear = rank === 3 ? 0.3 : rank === 2 ? 0.75 : 1.2, k = ease((t - appear) / 0.55);
        var x = slotX(L, rank), h = L.hs[rank] * k, top = L.base - h, col = RANKC[rank];
        // balok podium
        var g = c.createLinearGradient(0, top, 0, L.base); g.addColorStop(0, col[0]); g.addColorStop(1, col[1]);
        c.fillStyle = g; rr(c, x - L.bw / 2, top, L.bw, h + 2, 8); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(x - L.bw / 2 + 6, top + 4, L.bw - 12, 3);
        // muka balok: angka (bila muat) lalu nama & catatan, tersusun ke bawah tanpa saling menimpa
        var nsz = Math.round(clamp(L.bw * 0.085, 10, 17)), lsz = Math.round(clamp(L.bw * 0.07, 9, 14)), full = L.hs[rank];
        var fs = Math.min(clamp(full * 0.5, 18, 64), full - nsz - lsz - 22), numOn = fs >= 18;
        var y0 = top + 6, nameY = y0 + (numOn ? fs + 4 : Math.max(0, (full - nsz - lsz - 16) / 2)) + nsz / 2, lineY = nameY + nsz / 2 + 4 + lsz / 2;
        if (k > 0.5 && numOn) {
          c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = col[2];
          c.font = '900 ' + Math.round(fs) + 'px ' + DISPLAY; c.fillText(String(rank), x, y0 + fs / 2 + 1);
        }
        if (!s || k < 0.98) return;
        var p0 = s.people, n = p0.length, popK = pop((t - appear - 0.35) / 0.5);
        if (popK <= 0) return;
        var jump = REDUCE ? 0 : Math.abs(Math.sin(t * (rank === 1 ? 4.2 : 3.4) + rank)) * L.sh * (rank === 1 ? 0.16 : 0.1);
        var sh = L.sh * (n > 1 ? 0.82 : 1) * (rank === 1 ? 1 : 0.92) * popK, gap = L.bw * 0.42;
        p0.forEach(function (p, i) {
          var px = x + (n > 1 ? (i ? gap : -gap) * 0.55 : 0), foot = top - jump * (i ? 0.8 : 1);
          c.fillStyle = 'rgba(0,0,0,0.28)'; c.beginPath(); c.ellipse(px, top + 2, L.bw * 0.22 * (1 - jump / (L.sh * 0.4)), 4, 0, 0, Math.PI * 2); c.fill();
          figure(c, p, px, foot, sh);
        });
        // foto pro AI di atas kepala, lencana peringkat, trofi juara 1
        var r = clamp(L.sh * 0.17, 15, 40), my = top - sh - jump - r - 6, rf = r * (n > 1 ? 0.85 : 1);
        p0.forEach(function (p, i) {
          var fx = x + (n > 1 ? (i ? r * 0.95 : -r * 0.95) : 0);
          face(c, p._ph, fx, my, rf, col[1], initials(p.name));
        });
        var bx = x + (n > 1 ? r * 0.95 : 0) + rf * 0.78, by = my + rf * 0.7, br = Math.max(9, rf * 0.42);
        c.fillStyle = col[1]; c.beginPath(); c.arc(bx, by, br, 0, Math.PI * 2); c.fill();
        c.lineWidth = 2; c.strokeStyle = '#ffffff'; c.stroke();
        c.fillStyle = col[2]; c.font = '900 ' + Math.round(br * 1.25) + 'px ' + DISPLAY; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(rank), bx, by + 1);
        if (rank === 1) { c.font = Math.round(r * 1.25) + 'px ' + BODY; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.fillText('🏆', x, my - rf - 4); }
        c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = col[2];
        c.font = '800 ' + nsz + 'px ' + BODY;
        c.fillText(fitText(c, p0.map(function (p) { return p.name; }).join(' & '), L.bw - 12), x, nameY);
        if (lineY + lsz / 2 <= L.base - 2) { c.font = '600 ' + lsz + 'px ' + BODY; c.fillText(fitText(c, s.line || '', L.bw - 12), x, lineY); }
      });
    }
    function drawCrowd(L, t) {
      var list = D.crowd, n = list.length;
      if (!n) return;
      var ch = L.sh * 0.62, rows = n > 9 ? 2 : 1, perRow = Math.ceil(n / rows), bottom = L.sc.y + L.sc.h;
      var spots = [];
      list.forEach(function (p, i) {
        var row = rows === 2 && i >= perRow ? 0 : rows - 1, idx = row === rows - 1 ? i : i - perRow, cnt = row === rows - 1 ? Math.min(perRow, n) : n - perRow;
        var x = L.sc.x + L.sc.w * ((idx + 0.5) / cnt) + (row === 0 && rows === 2 ? L.sc.w / cnt / 2 : 0), bob = REDUCE ? 0 : Math.abs(Math.sin(t * 5 + i * 1.7)) * ch * 0.08;
        var foot = bottom + ch * (row === rows - 1 ? 0.3 : 0.08) - bob - (row === 0 && rows === 2 ? ch * 0.2 : 0);
        spots.push({ p: p, x: x, head: foot - ch, row: row, foot: foot });
      });
      spots.sort(function (a, b) { return a.row - b.row; }).forEach(function (s) { figure(c, s.p, s.x, s.foot, ch * (s.row === rows - 1 ? 1 : 0.9)); });
      // gelembung sorakan
      if (!REDUCE && t > 1.6 && t > nextBub) {
        var s = spots[Math.floor(Math.random() * spots.length)];
        if (!bubbles.some(function (b) { return Math.abs(b.x - s.x) < 110; }))
          bubbles.push({ x: s.x, y: s.head + ch * 0.12, text: CHEERS[Math.floor(Math.random() * CHEERS.length)], until: t + 1.6 });
        nextBub = t + 0.5 + Math.random() * 0.5;
      }
      bubbles = bubbles.filter(function (b) { return b.until > t; });
      bubbles.forEach(function (b) { bubble(c, clamp(b.x, L.sc.x + 40, L.sc.x + L.sc.w - 40), Math.max(b.y, L.base - L.hs[3] * 0.2), b.text, clamp(L.sh * 0.07, 10, 15)); });
    }
    function drawConfetti(L, t, dt) {
      if (REDUCE || t < 1.4) return;
      while (conf.length < 110) conf.push({ x: L.sc.x + Math.random() * L.sc.w, y: L.sc.y - Math.random() * L.sc.h, s: 4 + Math.random() * 6, v: 40 + Math.random() * 70, r: Math.random() * 6, w: (Math.random() - 0.5) * 6, col: CONF[Math.floor(Math.random() * CONF.length)] });
      conf.forEach(function (p) {
        p.y += p.v * dt; p.r += p.w * dt; p.x += Math.sin(t * 2 + p.s) * 12 * dt;
        if (p.y > L.sc.y + L.sc.h) { p.y = L.sc.y - 10; p.x = L.sc.x + Math.random() * L.sc.w; }
        c.save(); c.translate(p.x, p.y); c.rotate(p.r); c.fillStyle = p.col; c.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); c.restore();
      });
    }
    function drawTable(L, t) {
      var b = L.tb, pad = 12, a = ease((t - 0.4) / 0.6);
      if (L.wide) b = { x: b.x, y: b.y + 50, w: b.w, h: b.h - 50 };          // ruang untuk tombol tutup di pojok
      if (a <= 0) return;
      c.save(); c.globalAlpha = a;
      c.fillStyle = 'rgba(10,22,40,0.86)'; rr(c, b.x + pad / 2, b.y + pad, b.w - pad * 1.5, b.h - pad * 2, 16); c.fill();
      c.strokeStyle = 'rgba(242,235,221,0.14)'; c.lineWidth = 1; c.stroke();
      var x0 = b.x + pad * 1.6, x1 = b.x + b.w - pad * 2, y = b.y + pad * 2.6;
      c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      c.fillStyle = '#F2C14E'; c.font = '900 ' + 20 + 'px ' + DISPLAY; c.fillText('KLASEMEN AKHIR', x0, y);
      c.textAlign = 'right'; c.fillStyle = 'rgba(242,235,221,0.6)'; c.font = '700 10px ' + BODY; c.fillText(D.cols || 'MENANG · SELISIH', x1, y);
      y += 10;
      var rows = D.table, avail = b.y + b.h - pad * 2.4 - y, rh = clamp(avail / Math.max(rows.length, 1), 22, 40), fitN = Math.floor(avail / rh);
      var shown = rows.length > fitN ? rows.slice(0, Math.max(1, fitN - 1)) : rows;
      shown.forEach(function (r, i) {
        var ry = y + i * rh, mid = ry + rh / 2, fs = clamp(rh * 0.42, 10, 15), pr = rh * 0.36;
        if (r.me) { c.strokeStyle = '#E8902F'; c.lineWidth = 2; rr(c, x0 - 6, ry + 1, x1 - x0 + 12, rh - 2, 8); c.stroke(); }
        else if (i % 2 === 0) { c.fillStyle = 'rgba(255,255,255,0.04)'; rr(c, x0 - 6, ry + 1, x1 - x0 + 12, rh - 2, 8); c.fill(); }
        c.textBaseline = 'middle'; c.textAlign = 'center';
        c.fillStyle = r.rank <= 3 ? RANKC[r.rank][0] : 'rgba(242,235,221,0.6)'; c.font = '900 ' + Math.round(fs * 1.25) + 'px ' + DISPLAY; c.fillText(String(r.rank), x0 + 9, mid + 1);
        var px = x0 + 22 + pr;
        (r._ph.length ? r._ph : [null]).slice(0, 2).forEach(function (im, j) { face(c, im, px + j * pr * 1.2, mid, pr, r.rank <= 3 ? RANKC[r.rank][1] : 'rgba(255,255,255,0.25)', initials(r.name)); });
        var nx = px + pr * (r._ph.length > 1 ? 2.4 : 1.3) + 6;
        c.textAlign = 'right'; c.fillStyle = r.diff > 0 ? '#7FE3A6' : r.diff < 0 ? '#FF9A8A' : 'rgba(242,235,221,0.6)'; c.font = '700 ' + Math.round(fs * 0.9) + 'px ' + BODY;
        var dtx = (r.diff > 0 ? '+' : '') + r.diff; c.fillText(dtx, x1, mid);
        var dw = Math.max(c.measureText('+00').width, c.measureText(dtx).width) + 10;
        c.fillStyle = r.wc || '#FFFFFF'; c.font = '900 ' + Math.round(fs * 1.25) + 'px ' + DISPLAY; c.fillText(String(r.w), x1 - dw, mid + 1);
        var ww = Math.max(c.measureText('00').width, c.measureText(String(r.w)).width) + 8;
        c.textAlign = 'left'; c.fillStyle = '#F2EBDD'; c.font = (r.me ? '800 ' : '600 ') + Math.round(fs) + 'px ' + BODY;
        c.fillText(fitText(c, r.name, x1 - dw - ww - nx - 4), nx, mid);
      });
      if (shown.length < rows.length) { c.textAlign = 'left'; c.fillStyle = 'rgba(242,235,221,0.6)'; c.font = '600 12px ' + BODY; c.fillText('+' + (rows.length - shown.length) + ' pemain lainnya', x0, y + shown.length * rh + rh / 2); }
      c.restore();
    }
    function drawMark(L) {
      var x = L.sc.x + 12, y = L.sc.y + 12 + 22, s = 22;                       // pojok kiri atas: jauh dari penonton & gelembung
      c.save(); c.globalAlpha = 0.85;
      if (ok(logo)) c.drawImage(logo, x, y - s, s, s);
      if (W >= 480) { c.fillStyle = '#F2EBDD'; c.font = '800 11px ' + BODY; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText('PADDOC HOST', x + s + 6, y - s / 2); }
      c.restore();
    }
    function draw(now) {
      if (!alive) return;
      var t = (now - t0) / 1000, dt = Math.min(0.05, Math.max(0, t - lastT)); lastT = t;
      c.setTransform(K, 0, 0, K, 0, 0);
      var L = layout();
      drawBg(L, t); drawTitle(L, t); drawPodium(L, t); drawConfetti(L, t, dt); drawCrowd(L, t); drawTable(L, t); drawMark(L);
      raf = requestAnimationFrame(draw);
    }

    /* simpan: foto (PNG) langsung; video direkam ±8 detik lalu disimpan/dibagikan lewat ketukan berikutnya */
    function fileName(ext) { return 'Podium ' + String(D.title).replace(/[\\/:*?"<>|]+/g, ' ').trim() + '.' + ext; }
    function deliver(blob, name) {
      try {
        var f = new File([blob], name, { type: blob.type });
        if (navigator.maxTouchPoints > 0 && navigator.canShare && navigator.canShare({ files: [f] })) { navigator.share({ files: [f], title: name }).catch(function () {}); return; }
      } catch (e) { /* unduh biasa */ }
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 8000);
    }
    function savePhoto() {
      try {
        var url = cv.toDataURL('image/png'), bin = atob(url.split(',')[1]), u8 = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        deliver(new Blob([u8], { type: 'image/png' }), fileName('png'));     // tetap di dalam ketukan (syarat Bagikan di iPhone)
        return true;
      } catch (e) { return false; }
    }
    function videoType() {
      if (!window.MediaRecorder || !cv.captureStream) return null;
      var list = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
      for (var i = 0; i < list.length; i++) { try { if (MediaRecorder.isTypeSupported(list[i])) return list[i]; } catch (e) { /* lanjut */ } }
      return null;
    }
    var vbtn = root.querySelector('[data-c="video"]'), vtype = videoType(), vblob = null, recTimer = 0;
    vbtn.hidden = !vtype;
    function record() {
      var secs = 8, chunks = [], stream, rec;
      try { stream = cv.captureStream(30); rec = new MediaRecorder(stream, { mimeType: vtype, videoBitsPerSecond: 5000000 }); } catch (e) { vbtn.hidden = true; return; }
      t0 = performance.now(); lastT = 0; conf = []; bubbles = []; nextBub = 0;      // video mulai dari awal (podium naik)
      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = function () {
        stream.getTracks().forEach(function (tr) { tr.stop(); });
        vblob = new Blob(chunks, { type: vtype.split(';')[0] });
        vbtn.disabled = false; vbtn.textContent = 'Simpan video'; vbtn.classList.add('ready');
      };
      rec.start(250);
      vbtn.disabled = true;
      var left = secs;
      vbtn.textContent = 'Merekam… ' + left;
      recTimer = setInterval(function () { left--; if (left > 0) vbtn.textContent = 'Merekam… ' + left; else { clearInterval(recTimer); if (rec.state !== 'inactive') rec.stop(); } }, 1000);
    }
    function close() {
      if (!alive) return;
      alive = false; cancelAnimationFrame(raf); clearInterval(recTimer);
      window.removeEventListener('resize', onResize); document.removeEventListener('keydown', onKey);
      root.remove();
    }
    function onResize() { size(); }
    function onKey(e) { if (e.key === 'Escape') { close(); if (opts.onClose) opts.onClose(); } }
    root.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || b.disabled) return;
      var k = b.dataset.c;
      if (k === 'close') { close(); if (opts.onClose) opts.onClose(); }
      else if (k === 'next') { close(); if (opts.onNext) opts.onNext(); }
      else if (k === 'photo') { if (!savePhoto()) { b.textContent = 'Tidak didukung'; b.disabled = true; } }
      else if (k === 'video') { if (vblob) deliver(vblob, fileName(vblob.type.indexOf('mp4') >= 0 ? 'mp4' : 'webm')); else record(); }
      else if (b.dataset.x != null && opts.extra[+b.dataset.x]) { var x = opts.extra[+b.dataset.x]; if (x.close !== false) close(); x.onClick(); }
    });
    window.addEventListener('resize', onResize); document.addEventListener('keydown', onKey);
    prep(data); size();
    raf = requestAnimationFrame(draw);
    root.querySelector('[data-c="next"]').focus({ preventScroll: true });
    return { root: root, close: close, update: function (d) { prep(d); }, isOpen: function () { return alive; } };
  }
  return { open: open };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Ceremony;
