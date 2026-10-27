/* ============================================================
   Paddoc Host — foto ajakan lobi (16:9, 1920×1080)
   Invite.render(data) → Promise<canvas>
   data: { title, kicker, when, venue, url, bg, logo, joined, cap, people: [{ name, sprite?, svg? }] }
   Karakter pemain yang sudah bergabung berjejer, masing-masing dengan gelembung ajakan; panel kanan berisi cara
   bergabung: lewat aplikasi yang sudah terpasang, atau scan QR / buka link (butuh qrcode.js untuk QR).
   ============================================================ */
var Invite = (function () {
  'use strict';
  var W = 1920, H = 1080;
  var DISPLAY = "'Big Shoulders Display', 'Arial Narrow', sans-serif", BODY = "'Plus Jakarta Sans', system-ui, sans-serif";
  var SHORT = ['Ayo gabung!', 'Yuk ikut!', 'Main yuk!', 'Join yuk!', 'Ditunggu!', 'Gas padel!', 'Sini!', 'Seru nih!'];
  var SAY = ['Ayo gabung!', 'Main bareng yuk!', 'Kurang kamu nih!', 'Yuk ikut main!', 'Ditunggu ya!', 'Gas padel!', 'Siap smash?', 'Join dong!', 'Seru nih!', 'Sini gabung!'];

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function fit(c, text, maxW) {
    text = String(text || '');
    if (c.measureText(text).width <= maxW) return text;
    while (text.length > 1 && c.measureText(text + '…').width > maxW) text = text.slice(0, -1);
    return text + '…';
  }
  function wrap(c, text, maxW, maxLines) {
    var words = String(text || '').split(/\s+/), lines = [], cur = '';
    words.forEach(function (w) {
      var t = cur ? cur + ' ' + w : w;
      if (c.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; }
    });
    if (cur) lines.push(cur);
    if (maxLines && lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = fit(c, lines[maxLines - 1] + '…', maxW); }
    return lines;
  }
  /* link panjang dipotong per karakter (tidak ada spasi) */
  function wrapChars(c, text, maxW) {
    var lines = [], cur = '';
    String(text).split('').forEach(function (ch) { if (c.measureText(cur + ch).width > maxW && cur) { lines.push(cur); cur = ch; } else cur += ch; });
    if (cur) lines.push(cur);
    return lines;
  }
  function load(src) {
    return new Promise(function (res) {
      if (!src) return res(null);
      var im = new Image(), done = false, end = function (ok) { if (!done) { done = true; res(ok ? im : null); } };
      im.onload = function () { end(im.naturalWidth > 0); }; im.onerror = function () { end(false); };
      setTimeout(function () { end(im.complete && im.naturalWidth > 0); }, 6000);
      im.src = src;
    });
  }
  function svgSrc(svg) { return svg ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) : ''; }
  function fonts() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    var t = new Promise(function (r) { setTimeout(r, 2500); });
    return Promise.race([Promise.all(['900 96px ' + DISPLAY, '800 30px ' + BODY, '600 30px ' + BODY].map(function (f) { return document.fonts.load(f).catch(function () {}); })), t]);
  }
  function bubble(c, x, y, text, size, tx) {
    c.font = '800 ' + size + 'px ' + BODY;
    var w = c.measureText(text).width + size * 1.2, h = size * 1.75;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.35)'; c.shadowBlur = 12; c.shadowOffsetY = 4;
    c.fillStyle = '#FFFFFF'; rr(c, x - w / 2, y - h, w, h, h / 2); c.fill();
    c.shadowColor = 'transparent';
    var t = tx == null ? x : clamp(tx, x - w / 2 + size * 0.7, x + w / 2 - size * 0.7);
    c.beginPath(); c.moveTo(t - size * 0.4, y - 2); c.lineTo(t, y + size * 0.5); c.lineTo(t + size * 0.4, y - 2); c.fill();
    c.restore();
    c.fillStyle = '#13233A'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, x, y - h / 2 + 1);
    return { x: x - w / 2, y: y - h, w: w, h: h };
  }
  function hit(a, list) { return list.some(function (b) { return a.x < b.x + b.w + 6 && b.x < a.x + a.w + 6 && a.y < b.y + b.h + 4 && b.y < a.y + a.h + 4; }); }
  function qrDraw(c, text, x, y, size) {
    if (typeof qrcode !== 'function') return false;
    var q = qrcode(0, 'M'); q.addData(text); q.make();
    var n = q.getModuleCount(), quiet = 4, cell = Math.floor(size / (n + quiet * 2)), s = cell * (n + quiet * 2), ox = Math.round(x + (size - s) / 2), oy = Math.round(y + (size - s) / 2);
    c.fillStyle = '#FFFFFF'; c.fillRect(ox, oy, s, s);
    c.fillStyle = '#0A1628';
    for (var r = 0; r < n; r++) for (var k = 0; k < n; k++) if (q.isDark(r, k)) c.fillRect(ox + (k + quiet) * cell, oy + (r + quiet) * cell, cell, cell);
    return true;
  }

  function render(d) {
    var people = (d.people || []).slice(0, 24), more = Math.max(0, (d.people || []).length - people.length);
    return Promise.all([fonts(), load(d.bg), load(d.logo)].concat(people.map(function (p) { return load(p.sprite || svgSrc(p.svg)); }))).then(function (r) {
      var bg = r[1], logo = r[2], ims = r.slice(3);
      var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      var c = cv.getContext('2d');

      // latar: tema lobi (lapangan / lounge / pantai) digelapkan, cadangan gradasi navy
      if (bg) { var k = Math.max(W / bg.naturalWidth, H / bg.naturalHeight); c.drawImage(bg, (W - bg.naturalWidth * k) / 2, (H - bg.naturalHeight * k) / 2, bg.naturalWidth * k, bg.naturalHeight * k); }
      else { var g0 = c.createLinearGradient(0, 0, W, H); g0.addColorStop(0, '#0A1628'); g0.addColorStop(1, '#1E4A7A'); c.fillStyle = g0; c.fillRect(0, 0, W, H); }
      var g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(6,14,28,0.88)'); g.addColorStop(0.45, 'rgba(6,14,28,0.45)'); g.addColorStop(1, 'rgba(6,14,28,0.55)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);

      // judul
      var L = 72, maxT = 1180;
      if (logo) { c.save(); c.beginPath(); c.arc(L + 34, 86, 34, 0, Math.PI * 2); c.clip(); c.drawImage(logo, L, 52, 68, 68); c.restore(); }
      c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      c.fillStyle = '#FFFFFF'; c.font = '900 34px ' + DISPLAY; c.fillText('PADDOC', L + 84, 98);
      c.fillStyle = '#E8902F'; c.fillText('HOST', L + 84 + c.measureText('PADDOC ').width, 98);
      c.fillStyle = '#F2C14E'; c.font = '800 24px ' + BODY; c.fillText(fit(c, String(d.kicker || '').toUpperCase(), maxT), L, 178);
      c.fillStyle = '#FFFFFF'; c.font = '900 104px ' + DISPLAY;
      var tl = wrap(c, String(d.title || '').toUpperCase(), maxT, 2), ty = 272;
      tl.forEach(function (t, i) { c.fillText(t, L, ty + i * 96); });
      ty += (tl.length - 1) * 96;
      c.fillStyle = 'rgba(242,235,221,0.95)'; c.font = '700 34px ' + BODY;
      if (d.when) { ty += 58; c.fillText(fit(c, d.when, maxT), L, ty); }
      if (d.venue) { ty += 46; c.font = '600 30px ' + BODY; c.fillText(fit(c, d.venue, maxT), L, ty); }
      // jumlah yang sudah bergabung & sisa slot
      var slots = d.cap ? d.cap - d.joined : -1;
      var pill = d.joined + ' pemain sudah gabung' + (slots > 0 ? ' · sisa ' + slots + ' slot' : slots === 0 ? ' · penuh, masih bisa waiting list' : '');
      c.font = '800 26px ' + BODY;
      var pw = c.measureText(pill).width + 40; ty += 36;
      c.fillStyle = '#E8902F'; rr(c, L, ty, pw, 50, 25); c.fill();
      c.fillStyle = '#FFFFFF'; c.textBaseline = 'middle'; c.fillText(pill, L + 20, ty + 26);

      // karakter berjejer satu baris (berhimpitan seperti foto bersama bila banyak); setiap karakter punya gelembung
      // ajakan, disusun bertingkat di atas kepala supaya tidak bertabrakan (tingkat atas diberi garis penunjuk)
      var n = people.length, areaX = 50, areaW = 1210, floor = H - 76, top = ty + 84, drawn = [];
      var step = areaW / Math.max(n, 1), says = (step < 150 ? SHORT : SAY).slice();
      if (slots > 0) says.unshift(step < 150 ? 'Ada slot!' : 'Masih ada slot!'); else if (slots === 0) says.unshift(step < 150 ? 'Waiting list!' : 'Ikut waiting list!');
      var fs = n <= 4 ? 30 : n <= 8 ? 27 : n <= 14 ? 24 : 21;
      c.font = '800 ' + fs + 'px ' + BODY;
      var bw = Math.max.apply(null, says.map(function (t) { return c.measureText(t).width; })) + fs * 1.4;
      var lv = clamp(Math.ceil(bw / step), 1, 6), gap = fs * 2.4;
      var ch = Math.min(step / 0.42, floor - top - lv * gap - 10, 480);
      people.forEach(function (p, i) { drawn.push({ p: p, im: ims[i], cx: areaX + step * (i + 0.5), foot: floor, h: ch, idx: i, lvl: i % lv }); });
      drawn.forEach(function (o) {
        if (o.im) { var w = o.h * o.im.naturalWidth / o.im.naturalHeight; c.drawImage(o.im, o.cx - w / 2, o.foot - o.h, w, o.h); }
      });
      drawn.forEach(function (o) {                                        // nama di kaki masing-masing
        c.font = '800 ' + Math.round(clamp(o.h * 0.08, 14, 26)) + 'px ' + BODY; c.textAlign = 'center'; c.textBaseline = 'middle';
        var nm = fit(c, String(o.p.name || '').split(/\s+/)[0], Math.max(step - 6, 40)), nw = c.measureText(nm).width + 16, nh = clamp(o.h * 0.11, 22, 38);
        c.fillStyle = 'rgba(10,22,40,0.88)'; rr(c, o.cx - nw / 2, o.foot + 2, nw, nh, nh / 2); c.fill();
        c.fillStyle = '#FFFFFF'; c.fillText(nm, o.cx, o.foot + 2 + nh / 2 + 1);
      });
      var placed = [];
      drawn.forEach(function (o) {
        var text = says[o.idx % says.length], head = o.foot - o.h + o.h * 0.04, by = head - 8 - o.lvl * gap;
        c.font = '800 ' + fs + 'px ' + BODY;
        var w = c.measureText(text).width + fs * 1.2, x = clamp(o.cx, 22 + w / 2, areaX + areaW + 6 - w / 2);
        var box = { x: x - w / 2, y: by - fs * 1.75, w: w, h: fs * 1.75 };
        if (hit(box, placed)) return;
        if (o.lvl) {                                                      // garis penunjuk dari gelembung ke kepala
          c.save(); c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 3; c.setLineDash([2, 6]); c.lineCap = 'round';
          c.beginPath(); c.moveTo(o.cx, by + fs * 0.45); c.lineTo(o.cx, head - 4); c.stroke(); c.restore();
        }
        placed.push(bubble(c, x, by, text, fs, o.cx));
      });
      if (more) { c.font = '800 24px ' + BODY; c.textAlign = 'right'; c.textBaseline = 'alphabetic'; c.fillStyle = 'rgba(255,255,255,0.85)'; c.fillText('+' + more + ' lainnya', 1250, H - 22); }

      // panel kanan: cara bergabung
      var px = 1300, py = 56, pW = W - px - 56, pH = H - py * 2;
      c.save(); c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 40; c.shadowOffsetY = 12;
      c.fillStyle = '#F7F3EA'; rr(c, px, py, pW, pH, 32); c.fill(); c.restore();
      var ix = px + 44, iw = pW - 88, y = py + 92;
      c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      c.fillStyle = '#0A1628'; c.font = '900 64px ' + DISPLAY; c.fillText('GABUNG SEKARANG', ix, y);
      var step2 = function (num, head, body) {
        y += 34;
        c.fillStyle = '#E8902F'; c.beginPath(); c.arc(ix + 20, y + 20, 20, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#FFFFFF'; c.font = '900 24px ' + DISPLAY; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(num), ix + 20, y + 21);
        c.textAlign = 'left'; c.textBaseline = 'alphabetic';
        c.fillStyle = '#0A1628'; c.font = '800 25px ' + BODY;
        wrap(c, head, iw - 58).forEach(function (t, i) { c.fillText(t, ix + 58, y + 28 + i * 32); y += i ? 32 : 0; });
        y += 28;
        c.fillStyle = '#4F5C6E'; c.font = '600 21px ' + BODY;
        wrap(c, body, iw - 58).forEach(function (t) { y += 28; c.fillText(t, ix + 58, y); });
      };
      step2(1, 'Sudah pasang aplikasi Paddoc Host?', 'Buka aplikasinya, lobi ini ada di halaman Home. Tekan Ikut hadir.');
      step2(2, 'Belum punya aplikasinya?', 'Scan QR code ini atau buka link di bawah, lalu pasang di layar utama HP.');
      var qs = Math.min(iw - 40, pH - (y - py) - 150), qx = ix + (iw - qs) / 2, qy = y + 26;
      if (qrDraw(c, d.url, qx, qy, qs)) { c.strokeStyle = 'rgba(10,22,40,0.12)'; c.lineWidth = 2; rr(c, qx - 2, qy - 2, qs + 4, qs + 4, 12); c.stroke(); y = qy + qs; }
      c.fillStyle = '#1E4A7A'; c.font = '700 20px ' + BODY; c.textAlign = 'center';
      wrapChars(c, String(d.url || '').replace(/^https?:\/\//, ''), iw).slice(0, 3).forEach(function (t) { y += 28; c.fillText(t, ix + iw / 2, y); });
      return cv;
    });
  }
  return { render: render };
})();
