/* ============================================================
   Paddoc Host v2 — inti server
   Dipakai bersama oleh server (Cloudflare Worker, adaptor Durable Object) dan mode demo (adaptor lokal).
   Semua perubahan sesi dijalankan di sini supaya admin, host, dan user selalu melihat data yang sama.
   ============================================================ */
// di browser Engine sudah global (engine.js); di Worker diambil lewat require
var Engine = typeof Engine !== 'undefined' ? Engine : require('./engine.js');

var Core = (function () {
  'use strict';
  var DEFAULT_PIN = '123456';
  var TOKEN_DAYS = 60;
  var A = null;

  function init(adapter) { A = adapter; return Core; }
  function err(code, msg) { var e = new Error(msg ? code + ': ' + msg : code); e.code = code; return e; }
  function now() { return A.now(); }

  /* ---------------- orang (admin, host, user) ---------------- */
  function slug(name) {
    var s = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 14);
    return s || 'pemain';
  }
  function uniqueUsername(list, name, selfId) {
    var base = slug(name), u = base, n = 2;
    var taken = function (x) { return list.some(function (p) { return p.id !== selfId && String(p.username || '').toLowerCase() === x; }); };
    while (taken(u)) u = base + n++;
    return u;
  }
  function hashPin(salt, pin) { return A.hash(salt + '|' + String(pin)); }
  function setPin(p, pin) {
    p.salt = A.uuid().slice(0, 12);
    p.pinHash = hashPin(p.salt, pin);
    p.pinDefault = String(pin) === DEFAULT_PIN;
  }
  function peopleVersion() { return Number(A.prop('PV') || 1); }
  function bumpPeople() { A.setProp('PV', String(peopleVersion() + 1)); A.cachePut('PEOPLE', null); }

  /* semua orang, lengkap; data lama v1 dilengkapi username/PIN/peran di sini */
  function people() {
    var c = A.cacheGet('PEOPLE');
    if (c) return c;
    var list = A.people();
    var changed = false;
    list.forEach(function (p) {
      if (!p.role) { p.role = 'user'; changed = true; }
      if (!p.username) { p.username = uniqueUsername(list, p.name, p.id); changed = true; }
      if (!p.pinHash) { setPin(p, DEFAULT_PIN); changed = true; }
      if (!p.photoPref) p.photoPref = 'pro';
      if (changed) { A.savePerson(p); changed = false; }
    });
    A.cachePut('PEOPLE', list);
    return list;
  }
  function person(id) { return people().filter(function (p) { return p.id === id; })[0] || null; }
  function playersMap() {
    var m = {};
    people().forEach(function (p) { m[p.id] = { id: p.id, name: p.name, gender: p.gender }; });
    return m;
  }
  function displayPhoto(p) {
    if (p.photoPref === 'asli' && p.photoId) return p.photoId;
    return p.proId || p.photoId || '';
  }
  function publicPerson(p) {
    var fid = displayPhoto(p);
    return { id: p.id, name: p.name, gender: p.gender, hijab: !!p.hijab, role: p.role, archived: !!p.archived, photoUrl: fid ? A.photoUrl(fid) : '', fid: fid,
      // avatar chibi lobi: versi kecil (sprite) untuk semua; versi besar hanya sampai HP host membuat versi kecilnya
      chibiUrl: p.spriteId ? A.photoUrl(p.spriteId) : '', chibiFull: p.chibiId && !p.spriteId ? A.photoUrl(p.chibiId) : '' };
  }
  function fullPerson(p) {
    var o = publicPerson(p);
    o.username = p.username; o.hijab = !!p.hijab; o.photoPref = p.photoPref || 'pro';
    o.photoId = p.photoId || ''; o.proId = p.proId || '';
    o.asliUrl = p.photoId ? A.photoUrl(p.photoId) : ''; o.proUrl = p.proId ? A.photoUrl(p.proId) : '';
    o.aiStatus = p.aiStatus || (p.proId ? 'done' : 'none'); o.aiNote = p.aiNote || ''; o.pinDefault = !!p.pinDefault;
    o.chibiStatus = p.chibiStatus || (p.chibiId ? 'done' : 'none'); o.chibiNote = p.chibiNote || ''; o.chibiAt = p.chibiAt || 0; o.chibiBusyAt = p.chibiBusyAt || 0;
    return o;
  }

  /* ---------------- akun ---------------- */
  function auth(token, roles) {
    if (!token) throw err('AUTH_REQUIRED');
    var raw = A.prop('tok_' + token);
    if (!raw) throw err('AUTH_REQUIRED');
    var t = JSON.parse(raw);
    if (t.exp < now()) { A.delProp('tok_' + token); throw err('AUTH_REQUIRED'); }
    var p = person(t.uid);
    if (!p || p.archived) throw err('AUTH_REQUIRED');
    if (roles && roles.indexOf(p.role) < 0) throw err('FORBIDDEN', 'Akses ditolak untuk peran ' + p.role);
    return p;
  }
  function issueToken(p) {
    var tok = A.uuid().replace(/-/g, '') + A.uuid().replace(/-/g, '').slice(0, 8);
    A.setProp('tok_' + tok, JSON.stringify({ uid: p.id, exp: now() + TOKEN_DAYS * 864e5 }));
    return tok;
  }
  function status() {
    var hasAdmin = people().some(function (p) { return p.role === 'admin' && !p.archived; });
    return { hasAdmin: hasAdmin, needCode: !hasAdmin && !!A.prop('APP_PIN'), ai: A.aiEnabled(), version: '2.12', migrated: !!A.prop('MIGRATED_AT') };
  }
  function createAdmin(r) {
    return A.lock(function () {
      if (status().hasAdmin) throw err('ADMIN_EXISTS', 'Admin sudah dibuat');
      var code = A.prop('APP_PIN');
      if (code && String(r.code || '') !== String(code)) throw err('CODE_WRONG', 'Kode pemasangan salah');
      var name = String(r.name || '').trim();
      if (!name) throw err('INVALID', 'Nama wajib diisi');
      if (!/^\d{4,8}$/.test(String(r.pin || ''))) throw err('INVALID', 'PIN harus 4–8 angka');
      var list = people();
      var p = { id: A.uuid('p_'), name: name.slice(0, 40), gender: r.gender === 'P' ? 'P' : 'L', role: 'admin', photoPref: 'pro', created: now() };
      p.username = r.username ? uniqueUsername(list, r.username, p.id) : uniqueUsername(list, name, p.id);
      setPin(p, r.pin);
      A.savePerson(p); bumpPeople();
      return { token: issueToken(p), me: fullPerson(p) };
    });
  }
  function login(r) {
    var u = String(r.username || '').trim().toLowerCase();
    var key = 'fail_' + u;
    var fails = Number(A.cacheGet(key) || 0);
    if (fails >= 8) throw err('LOCKED', 'Terlalu banyak percobaan. Coba lagi 10 menit lagi');
    var p = people().filter(function (x) { return !x.archived && String(x.username).toLowerCase() === u; })[0];
    if (!p || hashPin(p.salt, r.pin) !== p.pinHash) {
      A.cachePut(key, fails + 1, 600);
      throw err('LOGIN_FAILED', 'Username atau PIN salah');
    }
    A.cachePut(key, 0, 1);
    return { token: issueToken(p), me: fullPerson(p) };
  }
  function logout(r) { if (r.token) A.delProp('tok_' + r.token); return true; }
  function me(r) { return fullPerson(auth(r.token)); }
  function changePin(r) {
    var p = auth(r.token);
    if (hashPin(p.salt, r.old) !== p.pinHash) throw err('PIN_WRONG', 'PIN lama salah');
    if (!/^\d{4,8}$/.test(String(r.pin || ''))) throw err('INVALID', 'PIN baru harus 4–8 angka');
    setPin(p, r.pin); A.savePerson(p); A.cachePut('PEOPLE', null);
    return fullPerson(p);
  }

  /* ---------------- data orang (admin & host) ---------------- */
  function listPeople(r) {
    auth(r.token, ['admin', 'host']);
    return people().map(fullPerson);
  }
  function savePersonReq(r) {
    var actor = auth(r.token, ['admin', 'host']);
    return A.lock(function () {
      var list = people();
      var src = r.person || {};
      var p = src.id ? list.filter(function (x) { return x.id === src.id; })[0] : null;
      var isNew = !p;
      if (isNew) p = { id: A.uuid('p_'), role: 'user', photoPref: 'pro', created: now() };
      if (p.role === 'admin' && actor.role !== 'admin') throw err('FORBIDDEN', 'Hanya admin yang bisa mengubah akun admin');
      if (src.name != null) p.name = String(src.name).trim().slice(0, 40);
      if (!p.name) throw err('INVALID', 'Nama wajib diisi');
      if (src.gender) p.gender = src.gender === 'P' ? 'P' : 'L';
      p.hijab = p.gender === 'P' && !!src.hijab;
      if (src.photoPref) p.photoPref = src.photoPref === 'asli' ? 'asli' : 'pro';
      if (src.archived != null) {
        if (src.archived && p.id === actor.id) throw err('INVALID', 'Tidak bisa mengarsipkan akun sendiri');
        p.archived = !!src.archived;
      }
      if (actor.role === 'admin' && src.role && ['admin', 'host', 'user'].indexOf(src.role) >= 0) {
        if (p.id === actor.id && src.role !== 'admin') throw err('INVALID', 'Admin tidak bisa menurunkan perannya sendiri');
        p.role = src.role;
      } else if (isNew && src.role === 'host') {
        p.role = 'host';
      }
      if (actor.role === 'admin' && src.username) p.username = uniqueUsername(list, src.username, p.id);
      if (!p.username) p.username = uniqueUsername(list, p.name, p.id);
      if (isNew) setPin(p, DEFAULT_PIN);
      if (r.photoData) {
        var f = A.savePhoto(r.photoData, p.name + '_asli');
        A.trash(p.photoId); A.trash(p.proId);
        p.photoId = f; p.proId = ''; p.aiStatus = 'none'; p.aiNote = ''; p.photoPref = 'pro';
      }
      p.updated = now();
      A.savePerson(p); bumpPeople();
      return fullPerson(p);
    });
  }
  function resetPin(r) {
    auth(r.token, ['admin']);
    return A.lock(function () {
      var p = person(r.id);
      if (!p) throw err('NOT_FOUND');
      setPin(p, DEFAULT_PIN); A.savePerson(p); A.cachePut('PEOPLE', null);
      return fullPerson(p);
    });
  }
  function generatePro(r) {
    auth(r.token, ['admin', 'host']);
    var p = person(r.id);
    if (!p) throw err('NOT_FOUND');
    if (!p.photoId) throw err('INVALID', 'Belum ada foto asli');
    if (!A.aiEnabled()) throw err('AI_OFF', 'OPENAI_API_KEY belum diisi');
    // generateAI bisa async (server memanggil OpenAI); data orang dibaca ulang setelah selesai
    return Promise.resolve().then(function () {
      return A.generateAI(p, p.role === 'host' || p.role === 'admin' ? p.role : 'player');
    }).then(function (out) {
      return A.lock(function () {
        var q = person(r.id);
        A.trash(q.proId);
        q.proId = out.id; q.aiStatus = 'done'; q.aiNote = out.note || ''; q.updated = now();
        A.savePerson(q); bumpPeople();
        return fullPerson(q);
      });
    }, function (e) {
      A.lock(function () { var q = person(r.id); q.aiStatus = 'error'; q.aiNote = String(e.message || e).slice(0, 400); A.savePerson(q); A.cachePut('PEOPLE', null); });
      throw e;
    });
  }
  /* avatar chibi lobi: dibuat sekali dari foto pro lewat OpenAI; hanya admin/host yang bisa membuat ulang */
  function generateChibi(r) {
    auth(r.token, ['admin', 'host']);
    var p = person(r.id);
    if (!p) throw err('NOT_FOUND');
    if (!p.proId && !p.photoId) throw err('INVALID', 'Belum ada foto untuk dijadikan avatar');
    if (!A.aiEnabled() || !A.generateChibi) throw err('AI_OFF', 'OPENAI_API_KEY belum diisi');
    A.lock(function () { var q = person(r.id); q.chibiStatus = 'busy'; q.chibiBusyAt = now(); A.savePerson(q); A.cachePut('PEOPLE', null); });
    return Promise.resolve().then(function () {
      return A.generateChibi(p, p.role === 'host' ? 'host' : 'player');
    }).then(function (out) {
      return A.lock(function () {
        var q = person(r.id);
        A.trash(q.chibiId); A.trash(q.spriteId);
        q.chibiId = out.id; q.spriteId = ''; q.chibiStatus = 'done'; q.chibiNote = out.note || ''; q.chibiAt = now();
        A.savePerson(q); bumpPeople();
        return fullPerson(q);
      });
    }, function (e) {
      A.lock(function () { var q = person(r.id); q.chibiStatus = 'error'; q.chibiNote = String(e.message || e).slice(0, 400); A.savePerson(q); A.cachePut('PEOPLE', null); });
      throw e;
    });
  }
  /* versi kecil avatar (±320×480, latar transparan) dibuat di HP admin/host, supaya lobi ringan untuk 30 karakter */
  function saveSprite(r) {
    auth(r.token, ['admin', 'host']);
    if (!/^data:image\/(png|webp);base64,/.test(String(r.data || '')) || String(r.data).length > 700000) throw err('INVALID', 'Gambar avatar tidak valid');
    return A.lock(function () {
      var q = person(r.id);
      if (!q || !q.chibiId) throw err('NOT_FOUND', 'Avatar belum dibuat');
      if (r.chibiId && r.chibiId !== q.chibiId) throw err('STALE', 'Avatar sudah diganti');
      var id = A.savePhoto(r.data, q.name + '_sprite');
      A.trash(q.spriteId);
      q.spriteId = id; A.savePerson(q); bumpPeople();
      return publicPerson(q);
    });
  }

  /* profil sendiri: pilihan foto tampil dan unggah foto sendiri */
  function updateMe(r) {
    var actor = auth(r.token);
    return A.lock(function () {
      var p = person(actor.id);
      if (r.photoData) {
        var f = A.savePhoto(r.photoData, p.name + '_upload');
        if (p.photoId && p.photoId !== f) A.trash(p.photoId);
        p.photoId = f; p.photoPref = 'asli';
      }
      if (r.photoPref) p.photoPref = r.photoPref === 'asli' ? 'asli' : 'pro';
      p.updated = now();
      A.savePerson(p); bumpPeople();
      return fullPerson(p);
    });
  }
  function photoData(r) { return A.photoData(r.id); }

  /* ---------------- notifikasi push ke HP (panggilan giliran) ---------------- */
  function pushKey() { return A.pushKey ? A.pushKey() : null; }
  function pushSubscribe(r) {
    var actor = auth(r.token);
    var sub = r.sub || {};
    if (!A.savePush) throw err('INVALID', 'Notifikasi push tidak tersedia di versi ini');
    if (!/^https:\/\//.test(String(sub.endpoint || '')) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) throw err('INVALID', 'Data notifikasi tidak valid');
    A.savePush(actor.id, { endpoint: String(sub.endpoint), keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) } });
    return true;
  }
  function pushUnsubscribe(r) { if (A.deletePush && r.endpoint) A.deletePush(String(r.endpoint)); return true; }

  /* ---------------- pindahan dari Google Sheet v1.0 (admin) ---------------- */
  function truthy(v) { return v === true || v === 1 || /^(true|1|ya|yes)$/i.test(String(v || '')); }
  function importPerson(r) {
    auth(r.token, ['admin']);
    return A.lock(function () {
      var src = r.person || {};
      if (!/^[\w-]{1,64}$/.test(String(src.id || ''))) throw err('INVALID', 'ID pemain tidak valid');
      var list = people();
      var p = list.filter(function (x) { return x.id === String(src.id); })[0];
      if (!p) p = { id: String(src.id), role: 'user', photoPref: 'pro', created: Number(src.created) || now() };
      p.name = String(src.name || p.name || '?').trim().slice(0, 40) || '?';
      p.gender = src.gender === 'P' ? 'P' : 'L';
      p.hijab = p.gender === 'P' && truthy(src.hijab);
      p.archived = truthy(src.archived);
      if (r.photoData) { var f = A.savePhoto(r.photoData, p.name + '_asli'); A.trash(p.photoId); p.photoId = f; }
      if (r.proData) { var g = A.savePhoto(r.proData, p.name + '_pro'); A.trash(p.proId); p.proId = g; p.aiStatus = 'done'; p.aiNote = String(src.aiNote || '').slice(0, 400); }
      else if (!p.proId) p.aiStatus = 'none';
      if (!p.username) p.username = uniqueUsername(list, p.name, p.id);
      if (!p.pinHash) setPin(p, DEFAULT_PIN);
      p.updated = now();
      A.savePerson(p); bumpPeople();
      return fullPerson(p);
    });
  }
  function importSession(r) {
    auth(r.token, ['admin']);
    return A.lock(function () {
      var S = r.S;
      if (!S || !/^[\w-]{1,64}$/.test(String(S.id || '')) || !S.parts || !S.matches || !S.courts) throw err('INVALID', 'Data sesi tidak valid');
      S.rules = S.rules || {}; S.calls = S.calls || {}; S.lastDone = {}; S.teams = S.teams || [];
      S.v = (S.v || 0) + 1;
      A.saveSession(S, rowsFor(S, playersMap()));
      A.cachePut('S_' + S.id, null);
      return { id: S.id };
    });
  }
  function markMigrated(r) {
    auth(r.token, ['admin']);
    A.setProp('MIGRATED_AT', String(now()));
    return true;
  }

  /* ---------------- sesi ---------------- */
  function loadS(sid) {
    if (!sid) return null;
    var c = A.cacheGet('S_' + sid);
    if (c) return c;
    var S = A.session(sid);
    if (S) A.cachePut('S_' + sid, S, 21600);
    return S;
  }
  function rowsFor(S, P) {
    var cname = function (id) { return (S.courts.filter(function (c) { return c.id === id; })[0] || {}).name || ''; };
    var nm = function (id) { return (P[id] || {}).name || id; };
    var t = function (x) { return x ? new Date(x) : ''; };
    var matches = S.matches.filter(function (m) { return m.status !== 'void'; }).map(function (m) {
      return [m.no, cname(m.court), nm(m.A[0]) + ' & ' + nm(m.A[1]), nm(m.B[0]) + ' & ' + nm(m.B[1]),
        m.sA == null ? '' : m.sA, m.sB == null ? '' : m.sB, m.status === 'done' ? 'Selesai' : 'Bermain', t(m.start), t(m.end)];
    });
    var standings = Engine.standings(S, P, { sortBy: S.rules.sortBy }).map(function (r) {
      return [r.rank, nm(r.id), (P[r.id] || {}).gender === 'P' ? 'Putri' : 'Putra', r.played, r.w, r.d, r.l, r.pf, r.diff,
        Math.round(r.avg * 100) / 100, r.active ? (S.parts[r.id].paused ? 'Belum siap' : 'Aktif') : 'Keluar'];
    });
    return { matches: matches, standings: standings };
  }
  function saveS(S, P) {
    S.v = (S.v || 0) + 1;
    S.updated = now();
    A.saveSession(S, rowsFor(S, P || playersMap()));
    A.cachePut('S_' + S.id, S, 21600);
  }
  function publicS(S) {
    if (!S) return null;
    var o = JSON.parse(JSON.stringify(S));
    o.matches.forEach(function (m) { delete m.snap; });
    if (o.plan) { o.plan.chatN = (o.plan.chat || []).length; delete o.plan.chat; } // chat lobi hanya lewat plans (anggota)
    if (o.pay) o.pay = paySummary(S);                                                  // rekening & bukti bayar lewat payInfo (login)
    if (o.pc && o.pc.cd) {                                                             // Power Cup: isi kartu di tangan lewat pcHand (login)
      var cd = o.pc.cd, hand = {};
      Object.keys(cd.hand || {}).forEach(function (t) { hand[t] = (cd.hand[t] || []).length; });
      o.pc.cd = { n: (cd.deck || []).length, d: (cd.disc || []).length, hand: hand, hv: cd.hv || {} };
      o.matches.forEach(function (m) { if (m.drawn && !m.drawn.z) delete m.drawn.id; });
    }
    return o;
  }
  /* Power Cup: kartu di tangan. Pemain (termasuk host sesi) melihat kartu timnya; admin & host melihat semua tim */
  function pcHand(r) {
    var actor = auth(r.token), S = loadS(r.sid || A.prop('ACTIVE_SID'));
    if (!S || !Engine.isPC(S) || !S.pc || !S.pc.cd) throw err('NOT_FOUND', 'Tidak ada sesi Power Cup');
    var all = roleStaff(actor), t = Engine.teamOf(S, actor.id), out = {};      // host sesi ikut bermain: hanya kartu timnya
    Object.keys(S.pc.cd.hand || {}).forEach(function (tid) { if (all || (t && t.id === tid)) out[tid] = S.pc.cd.hand[tid]; });
    if (t && !out[t.id]) out[t.id] = [];
    return { sid: S.id, all: all, team: t ? t.id : null, hands: out, hv: S.pc.cd.hv || {} };
  }
  /* tim kalah berhak mengambil kartu: dikabarkan ke HP kedua pemainnya (prevT = tim kalah sebelum koreksi skor) */
  function pcOweNotify(S, m, prevT) {
    var dr = m.drawn, t = dr && dr.owe && dr.t !== prevT && Engine.teamById(S, dr.t);
    if (!A.notify || !t) return;
    [t.a, t.b].forEach(function (pid) {
      A.notify(pid, { title: 'Ambil kartu power', tag: 'pcowe-' + m.id, url: '/',
        body: 'Timmu kalah di Match #' + m.no + '. Buka app lalu tekan Ambil kartu, atau host mengambilkan di iPad. ' + S.name });
    });
  }
  /* kartu yang diambil dikabarkan ke pemain tim itu selain yang mengambil (isi kartu hanya untuk tim itu) */
  function pcDrawNotify(S, t, res, actor) {
    if (!A.notify || !t || !res.card) return;
    var def = Engine.PC_CARDS[res.card.k] || {}, m = Engine.findMatch(S, res.m) || {};
    [t.a, t.b].forEach(function (pid) {
      if (pid === actor.id) return;
      A.notify(pid, { title: res.z ? 'Kartu power: Zonk' : 'Kartu power baru: ' + def.name, tag: 'pccard-' + res.m, url: '/',
        body: (res.z ? 'Zonk langsung dibuang, tidak ada efek' : 'Timmu mendapat ' + def.name) + (m.no ? ' (Match #' + m.no + ')' : '') + ', diambil oleh ' + actor.name + '. ' + S.name });
    });
  }
  /* kartu yang dipakai ke sebuah tim dikabarkan ke HP tim itu (Block / Reverse harus dijawab sebelum poin berikutnya);
     Pilih Lawan juga mengabari dua tim yang lawannya berubah. Jawaban Block / Reverse dikabarkan ke pemakai kartu asal */
  function pcCardNotify(S, P, type, cardId) {
    if (!A.notify) return;
    var c = null, where = null;
    S.matches.filter(function (m) { return m.status === 'live'; }).forEach(function (m) { (m.cards || []).forEach(function (x) { if (x.id === cardId) { c = x; where = m; } }); });
    (S.pc.pend || []).forEach(function (p) { (p.cards || []).forEach(function (x) { if (x.id === cardId) c = x; }); });
    if (!c) return;
    var name = function (k) { return (Engine.PC_CARDS[k] || {}).name || k; };
    var tn = function (tid) { var t = Engine.teamById(S, tid); return t ? [t.a, t.b].map(function (id) { return (P[id] || {}).name || '?'; }).join(' & ') : '?'; };
    var court = where ? ' di ' + ((S.courts.filter(function (x) { return x.id === where.court; })[0] || {}).name || 'court') : '';
    var send = function (tid, title, body) {
      var t = Engine.teamById(S, tid);
      if (t) [t.a, t.b].forEach(function (pid) { A.notify(pid, { title: title, body: body + ' · ' + S.name, tag: 'pcvs-' + c.id + '-' + tid, url: '/' }); });
    };
    if (type === 'pcResp') {
      send(c.tg, 'Kartu ' + name(c.ofk) + ' ' + (c.k === 'block' ? 'diblok' : 'dibalik'), tn(c.by) + (c.k === 'block' ? ' memblok ' : ' membalik ') + name(c.ofk) + ' timmu' + court + '.');
      return;
    }
    var hand = (S.pc.cd.hand[c.tg] || []), def = Engine.PC_CARDS[c.k] || {};
    var canBlock = hand.some(function (x) { return x.k === 'block' || (x.k === 'reverse' && def.rev); });
    var hint = canBlock ? ' Kamu memegang ' + (hand.some(function (x) { return x.k === 'block'; }) ? 'Block' : 'Reverse') + ': jawab di HP sebelum ' + (c.k === 'pick' ? 'match dimulai.' : 'poin berikutnya.') : '';
    if (c.k === 'pick') {
      send(c.tg, tn(c.by) + ' memilih timmu jadi lawan', tn(c.by) + ' memakai Pilih Lawan: timmu sekarang melawan mereka' + court + '.' + hint);
      var pv = c.prev || [], o1 = pv[0] === c.by ? pv[1] : pv[0], o2 = pv[2] === c.tg ? pv[3] : pv[2];
      if (o1 && o2) {
        send(o1, 'Lawanmu berubah', tn(c.by) + ' memakai Pilih Lawan. Timmu sekarang melawan ' + tn(o2) + '.');
        send(o2, 'Lawanmu berubah', tn(c.by) + ' memakai Pilih Lawan. Timmu sekarang melawan ' + tn(o1) + '.');
      }
      return;
    }
    send(c.tg, 'Lawan memakai ' + name(c.k), tn(c.by) + ' memakai ' + name(c.k) + ' ke timmu' + court + '.' + hint);
  }
  /* ronde baru dimulai: tim yang belum mengambil kartu haknya diingatkan sekali */
  function pcOweRemind(S) {
    if (!A.notify) return;
    (S.pc.owe || []).forEach(function (o) {
      if (o.rem) return;
      o.rem = 1;
      var t = Engine.teamById(S, o.t);
      if (t) [t.a, t.b].forEach(function (pid) { A.notify(pid, { title: 'Kartu power belum diambil', body: 'Ronde ' + S.pc.round + ' dimulai dan timmu belum mengambil kartu. Buka app lalu tekan Ambil kartu. ' + S.name, tag: 'pcowe-' + o.m, url: '/' }); });
    });
  }
  /* Pilih Lawan memindahkan tim antar court: panggilan court untuk pemain yang sudah tidak di match itu dihapus */
  function pcFixCalls(S) {
    Object.keys(S.calls || {}).forEach(function (pid) {
      var c = S.calls[pid], m = c && Engine.findMatch(S, c.m);
      if (m && m.status === 'live' && m.A.concat(m.B).indexOf(pid) < 0) delete S.calls[pid];
    });
  }

  /* ---------------- rencana sesi & ruang tunggu (lobi) ---------------- */
  var PLAN_ACTIONS = { rsvp: 1, chat: 1, theme: 1, editPlan: 1, startPlan: 1, here: 1 };
  /* Power Cup: pemain maksimal = court × 4 (semua main tiap ronde); yang bergabung setelah penuh masuk waiting list */
  function planCap(S) { return S.format === 'powercup' ? S.courts.filter(function (c) { return c.active; }).length * 4 : 0; }
  function planPlayers(S) {
    return ((S.plan || {}).rsvp || []).filter(function (x) { return x.role === 'player'; }).slice().sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
  }
  function waitPos(S) {
    var cap = planCap(S), w = {};
    if (cap) planPlayers(S).forEach(function (x, i) { if (i >= cap) w[x.pid] = i - cap + 1; });
    return w;
  }
  /* sudah datang: bila belum ada yang ditandai sama sekali (fitur tidak dipakai), semua dianggap datang */
  function arrivedFn(p, all) {
    var used = (p.rsvp || []).some(function (x) { return x.here !== undefined; });
    return function (pid) { var x = (p.rsvp || []).filter(function (y) { return y.pid === pid; })[0]; return !!all || !used || !!(x && x.here === true); };
  }
  function isMember(token) { if (!token) return false; try { auth(token); return true; } catch (e) { return false; } }
  function planFields(src, old) {
    src = src || {}; old = old || {};
    var v = src.venue || old.venue || {}, str = function (x, n) { return String(x == null ? '' : x).trim().slice(0, n); };
    var when = Number(src.when != null ? src.when : old.when) || null;
    var until = Number(src.until !== undefined ? src.until : old.until) || null;          // jam selesai booking
    if (until && (!when || until <= when || until - when > 12 * 3600000)) until = null;
    var maps = str(v.maps, 400);
    if (maps && !/^https:\/\//.test(maps)) maps = '';
    var lat = Number(v.lat), lng = Number(v.lng);
    return {
      when: when, until: until, whenText: str(src.whenText != null ? src.whenText : old.whenText, 80),
      venue: { name: str(v.name, 80), address: str(v.address, 160), maps: maps, lat: isFinite(lat) ? lat : null, lng: isFinite(lng) ? lng : null },
      theme: /^[a-z0-9_-]{1,24}$/.test(String(src.theme || '')) ? src.theme : (old.theme || 'court')
    };
  }
  function planView(S, member) {
    var p = S.plan || {}, wl = waitPos(S);
    var o = { id: S.id, v: S.v || 0, name: S.name, status: S.status, format: S.format, teamMode: S.teamMode,
      courts: S.courts.filter(function (c) { return c.active; }).length, hosts: S.hosts || [],
      when: p.when, until: p.until || null, whenText: p.whenText, venue: p.venue || {}, theme: p.theme || 'court', by: p.by,
      rsvp: (p.rsvp || []).map(function (x) { var o2 = { pid: x.pid, role: x.role, at: x.at }; if (x.from) { o2.from = x.from; o2.to = x.to; } if (x.here !== undefined) o2.here = x.here; if (wl[x.pid]) o2.w = wl[x.pid]; return o2; }), chatN: (p.chat || []).length,
      cap: planCap(S),
      cohosts: S.cohosts || [], pay: paySummary(S) };
    if (member) o.chat = (p.chat || []).slice(-100);
    if (S.teamMode === 'fixed') o.teams = (p.teams || []).map(function (t) { return { a: t.a, b: t.b }; });
    if (S.format === 'powercup') o.levels = p.levels || {};
    return o;
  }
  function plans(member) {
    return A.sessions().filter(function (r) { return r.status === 'plan'; })
      .map(function (r) { return loadS(r.id); }).filter(function (S) { return S && S.plan; })
      .sort(function (a, b) { return (a.plan.when || 0) - (b.plan.when || 0); })
      .map(function (S) { return planView(S, member); });
  }
  function venueLine(v) { v = v || {}; return [v.name, v.address].filter(Boolean).join(' · '); }
  /* pasangan tetap yang belum diatur: dipasangkan acak, putra-putri dulu bila bisa */
  function autoTeams(ids, P, given) {
    var used = {}, teams = [];
    (given || []).forEach(function (t) { if (ids.indexOf(t.a) >= 0 && ids.indexOf(t.b) >= 0 && !used[t.a] && !used[t.b]) { teams.push({ a: t.a, b: t.b }); used[t.a] = used[t.b] = 1; } });
    var rest = ids.filter(function (id) { return !used[id]; });
    for (var i = rest.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), x = rest[i]; rest[i] = rest[j]; rest[j] = x; }
    var L = rest.filter(function (id) { return (P[id] || {}).gender !== 'P'; }), W = rest.filter(function (id) { return (P[id] || {}).gender === 'P'; });
    while (L.length && W.length) teams.push({ a: L.pop(), b: W.pop() });
    var left = L.concat(W);
    while (left.length >= 2) teams.push({ a: left.pop(), b: left.pop() });
    return teams;
  }
  /* Power Cup: level atas (levels[pid] = 1) dipasangkan dengan level bawah sebanyak mungkin; sisanya
     (jumlah level tidak seimbang) dipasangkan acak. Pemain level atas jadi pemain pertama di tim */
  function levelTeams(ids, levels, given) {
    var used = {}, teams = [], lv = levels || {};
    (given || []).forEach(function (t) { if (ids.indexOf(t.a) >= 0 && ids.indexOf(t.b) >= 0 && t.a !== t.b && !used[t.a] && !used[t.b]) { teams.push({ a: t.a, b: t.b }); used[t.a] = used[t.b] = 1; } });
    var rest = ids.filter(function (id) { return !used[id]; });
    for (var i = rest.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), x = rest[i]; rest[i] = rest[j]; rest[j] = x; }
    var top = rest.filter(function (id) { return lv[id]; }), low = rest.filter(function (id) { return !lv[id]; });
    while (top.length && low.length) teams.push({ a: top.pop(), b: low.pop() });
    var left = top.concat(low);
    while (left.length >= 2) teams.push({ a: left.pop(), b: left.pop() });
    return teams;
  }
  function levelMap(ids, levels) {
    var lv = {};
    ids.forEach(function (id) { if (levels && levels[id]) lv[id] = 1; });
    return lv;
  }
  /* Power Cup dimulai: urutan pasangan diundi, penantang ronde pertama mengundi lawan */
  function pcBegin(S, P, lv) {
    S.pc = { lv: lv || {} };
    Engine.pcInit(S);
    Engine.fillCourts(S, P);
  }
  /* jam hadir sebagian (1 atau 2 jam dari jam booking) */
  var JOIN_EARLY = 5 * 60000, END_BUFFER = 10 * 60000;
  function planSlot(p, d) {
    if (!d.from || !d.to || !p.when || !p.until) return null;
    var from = Number(d.from), to = Number(d.to);
    if (!(from >= p.when && to <= p.until && to - from >= 30 * 60000)) throw err('INVALID', 'Jam hadir harus di dalam jam booking');
    if (from === p.when && to === p.until) return null;                              // sama dengan full
    return { from: from, to: to };
  }
  /* masuk antrean saat jamnya mulai; berhenti diundi 10 menit sebelum jamnya habis (match yang sedang jalan tetap selesai) */
  function applyAvail(S, t, initial) {
    var av = S.avail || {}, changed = false, next = null, notify = A.notify || function () {};
    Object.keys(av).forEach(function (pid) {
      var a = av[pid], part = S.parts[pid];
      if (!part) return;
      var start = a.from - JOIN_EARLY, end = a.to - END_BUFFER;
      if (a.st !== 'out' && t >= end) {
        if (part.active) { Engine.removeParticipant(S, pid); part.timeOff = 'done'; }
        a.st = 'out'; changed = true;
        if (!initial) notify(pid, { title: 'Jam mainmu selesai: ' + S.name, body: 'Kamu tidak diundi lagi setelah match ini. Terima kasih sudah main!', tag: 'avail-' + S.id, url: '/' });
        return;
      }
      if (a.st === 'wait' && t >= start) {
        if (part.timeOff === 'wait') { Engine.addParticipant(S, pid, S.rules.catchUp); delete part.timeOff; }
        a.st = 'in'; changed = true;
        notify(pid, { title: 'Waktunya main: ' + S.name, body: 'Jam mainmu dimulai. Kamu sudah masuk antrean undian.', tag: 'avail-' + S.id, url: '/' });
      } else if (initial && a.st === 'in' && t < start) {
        part.paused = true; part.timeOff = 'wait'; a.st = 'wait'; changed = true;
      }
      var nx = a.st === 'wait' ? start : a.st === 'in' ? end : null;
      if (nx && (next == null || nx < next)) next = nx;
    });
    return { changed: changed, next: next };
  }
  function startPlan(S, P, d) {
    d = d || {};
    var p = S.plan, alive = {};
    people().forEach(function (x) { if (!x.archived) alive[x.id] = x; });
    var players = planPlayers(S).filter(function (x) { return alive[x.pid] && alive[x.pid].role !== 'host'; }).map(function (x) { return x.pid; });
    if (players.length < 4) throw err('INVALID', 'Butuh minimal 4 pemain yang hadir untuk memulai');
    // yang belum datang ikut tercatat tapi "belum siap" (tidak diundi) sampai menekan Siap main.
    // Power Cup: yang main = yang sudah datang, urut waktu bergabung, maksimal court × 4; sisanya cadangan
    var here = arrivedFn(p, d.allHere), cap = planCap(S), inPlay = players.filter(here);
    if (cap) inPlay = inPlay.slice(0, cap);
    if (inPlay.length < 4) throw err('INVALID', 'Butuh minimal 4 pemain yang sudah datang (sekarang ' + inPlay.length + '). Tandai yang sudah datang di lobi');
    var hostIds = p.rsvp.filter(function (x) { return x.role === 'host' && alive[x.pid]; }).map(function (x) { return x.pid; });
    var teams = [], pc = S.format === 'powercup', lvIn = pc ? d.levels || p.levels || {} : null;   // Power Cup: tanda level dari host, atau dari rencana
    if (S.teamMode === 'fixed') {
      if (Array.isArray(d.teams)) {
        // pasangan dari host (acak campuran/putra/putri, best player, atau manual); sisanya boleh tidak dipasangkan
        var used = {};
        var given = d.teams.filter(function (t) {
          var okT = t && inPlay.indexOf(t.a) >= 0 && inPlay.indexOf(t.b) >= 0 && t.a !== t.b && !used[t.a] && !used[t.b];
          if (okT) used[t.a] = used[t.b] = 1;
          return okT;
        }).map(function (t) { return { a: t.a, b: t.b }; });
        teams = !d.pairRest ? given : pc ? levelTeams(inPlay, lvIn, given) : autoTeams(inPlay, P, given);
      } else teams = pc ? levelTeams(inPlay, lvIn, p.teams) : autoTeams(inPlay, P, p.teams);
    }
    // jam hadir sebagian: yang belum jamnya dijeda, masuk antrean otomatis saat jamnya mulai
    var avail = {}, t0 = now();
    if (!pc) p.rsvp.forEach(function (x) { if (x.from && players.indexOf(x.pid) >= 0) avail[x.pid] = { from: x.from, to: x.to, st: 'in' }; });
    var ready = inPlay.filter(function (pid) { var a = avail[pid]; return !a || (t0 >= a.from - JOIN_EARLY && t0 < a.to - END_BUFFER); });
    if (ready.length < 4) throw err('INVALID', 'Butuh minimal 4 pemain yang jam hadirnya sudah mulai (sekarang ' + ready.length + '). Pemain jam berikutnya masuk otomatis');
    var fresh = Engine.newSession({ name: S.name, format: S.format, teamMode: S.teamMode, scoring: S.scoring, rules: S.rules, courts: S.courts, playerIds: players, teams: teams });
    S.parts = fresh.parts; S.teams = fresh.teams; S.matches = []; S.seq = 0; S.status = 'live'; S.date = new Date().toISOString();
    S.calls = {}; S.lastDone = {};
    S.avail = avail;
    players.forEach(function (pid) {                               // belum datang / cadangan: tercatat tapi tidak diundi
      if (inPlay.indexOf(pid) >= 0 || !S.parts[pid]) return;
      S.parts[pid].paused = true;
      if (here(pid)) S.parts[pid].wl = true; else S.parts[pid].absent = true;
    });
    applyAvail(S, t0, true);
    setHosts(S, (S.hosts || []).concat(hostIds));
    p.startedAt = now(); p.prevActive = A.prop('ACTIVE_SID') || '';
    if (pc) pcBegin(S, P, levelMap(inPlay, lvIn)); else Engine.fillCourts(S, P);
    A.setProp('ACTIVE_SID', S.id);
  }
  function backToLobby(S) {
    if (!S.plan || S.status !== 'live') throw err('INVALID', 'Sesi ini tidak dimulai dari lobi');
    var played = S.matches.some(function (m) { return m.go || (m.tally && m.tally.length) || m.status === 'done'; });
    if (played) throw err('INVALID', 'Sudah ada match yang dimulai. Lobi tidak bisa dibuka lagi');
    S.status = 'plan'; S.parts = {}; S.teams = []; S.matches = []; S.seq = 0; S.calls = {}; S.lastDone = {};
    delete S.plan.startedAt; delete S.avail; delete S.pc;
    if (A.prop('ACTIVE_SID') === S.id) {
      var prev = S.plan.prevActive && loadS(S.plan.prevActive);
      if (prev && prev.status === 'live') A.setProp('ACTIVE_SID', prev.id); else A.delProp('ACTIVE_SID');
    }
  }
  function applyPlan(S, P, type, d, actor, sessStaff) {
    var p = S.plan, staff = !!sessStaff;
    if (type === 'chat') {
      var text = String(d.text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
      if (!text) throw err('INVALID', 'Pesan kosong');
      p.chat.push({ id: A.uuid('m_'), pid: actor.id, name: actor.name, role: actor.role === 'user' ? 'player' : 'host', text: text, at: now() });
      if (p.chat.length > 200) p.chat = p.chat.slice(-200);
      return null;
    }
    if (type === 'rsvp') {
      var who = person(d.pid || actor.id);
      if (!who || who.archived) throw err('NOT_FOUND', 'Orang tidak ditemukan');
      if (!staff && who.id !== actor.id) throw err('FORBIDDEN');
      var prev = p.rsvp.filter(function (x) { return x.pid === who.id; })[0], wl0 = waitPos(S);
      p.rsvp = p.rsvp.filter(function (x) { return x.pid !== who.id; });
      if (d.on !== false) {
        var role = who.role === 'host' ? 'host' : who.role === 'admin' ? (d.as === 'player' ? 'player' : 'host') : 'player';
        var slot = role === 'player' && S.format !== 'powercup' ? planSlot(p, d) : null, entry = { pid: who.id, role: role, at: prev ? prev.at : now(), by: actor.id };
        if (slot) { entry.from = slot.from; entry.to = slot.to; }
        if (prev && prev.here !== undefined) entry.here = prev.here;
        p.rsvp.push(entry);
      }
      // Power Cup: yang naik dari waiting list ke daftar main diberi tahu
      var wl1 = waitPos(S);
      if (A.notify) Object.keys(wl0).forEach(function (pid) {
        if (!wl1[pid] && pid !== who.id && p.rsvp.some(function (x) { return x.pid === pid; })) A.notify(pid, { title: 'Kamu masuk daftar main: ' + S.name,
          body: 'Ada yang batal, kamu naik dari waiting list. Sampai jumpa di court!', tag: 'wl-' + S.id, url: '/?lobby=' + S.id });
      });
      return null;
    }
    if (type === 'here') {                                         // sudah datang / belum: pemain sendiri, atau admin/host/host sesi
      var hw = p.rsvp.filter(function (x) { return x.pid === (d.pid || actor.id); })[0];
      if (!hw) throw err('NOT_FOUND', 'Orang itu belum bergabung di lobi');
      if (!staff && hw.pid !== actor.id) throw err('FORBIDDEN');
      hw.here = d.on !== false; hw.hereAt = now(); hw.hereBy = actor.id;
      return null;
    }
    if (!roleStaff(actor)) throw err('FORBIDDEN', 'Aksi ini khusus admin atau host');
    if (type === 'theme') { p.theme = planFields({ theme: d.theme }, p).theme; return null; }
    if (type === 'editPlan') {
      var f = planFields(d, p);
      if (f.when !== p.when) p.reminded = {};
      var moved = f.when !== p.when || f.until !== p.until;
      p.when = f.when; p.until = f.until; p.whenText = f.whenText; p.venue = f.venue; p.theme = f.theme;
      if (moved) p.rsvp.forEach(function (x) { delete x.from; delete x.to; });   // jadwal berubah: jam hadir sebagian kembali ke full
      if (d.name) S.name = String(d.name).trim().slice(0, 60) || S.name;
      return null;
    }
    if (type === 'startPlan') { startPlan(S, P, d); return null; }
    return null;
  }
  /* pengingat 12 jam & 3 jam sebelum main untuk yang sudah hadir; dipanggil server (alarm). Hasil: waktu pengingat berikutnya */
  function reminders(t) {
    t = t || now();
    return A.lock(function () {
      var next = null;
      A.sessions().filter(function (r) { return r.status === 'plan'; }).forEach(function (row) {
        var S = loadS(row.id); if (!S || !S.plan || !S.plan.when) return;
        var p = S.plan, changed = false; p.reminded = p.reminded || {};
        [[12, 'h12'], [3, 'h3']].forEach(function (x) {
          var due = p.when - x[0] * 3600000;
          if (p.reminded[x[1]]) return;
          if (t < due) { if (next == null || due < next) next = due; return; }
          p.reminded[x[1]] = true; changed = true;
          // rencana dibuat setelah waktu pengingat, atau pengingat terlambat jauh: lewati
          if ((p.created || 0) > due || t - due > 2 * 3600000 || t >= p.when || !A.notify) return;
          var left = Math.max(1, Math.round((p.when - t) / 3600000));
          p.rsvp.forEach(function (x2) {
            A.notify(x2.pid, { title: left + ' jam lagi main: ' + S.name, body: [p.whenText, venueLine(p.venue)].filter(Boolean).join('\n'),
              tag: 'rem-' + S.id, url: '/?lobby=' + S.id, maps: (p.venue || {}).maps || '' });
          });
        });
        if (changed) saveS(S);
      });
      // sesi berjalan: pemain jam berikutnya masuk antrean / yang jamnya habis berhenti diundi
      var LS = loadS(A.prop('ACTIVE_SID'));
      if (LS && LS.status === 'live' && LS.avail) {
        var av = applyAvail(LS, t);
        if (av.changed) { var LP = playersMap(); Engine.fillCourts(LS, LP); saveS(LS, LP); }
        if (av.next && (next == null || av.next < next)) next = av.next;
      }
      return next;
    });
  }
  /* ---------------- tema ruang tunggu: gambar + kalibrasi 4 sudut lantai, diatur admin ---------------- */
  var BUILTIN_THEMES = ['court', 'lounge', 'beach'];
  function themesRaw() { try { return JSON.parse(A.prop('LOBBY_THEMES') || '[]'); } catch (e) { return []; } }
  function themeView(t) {
    var side = function (x) { return x && x.img ? { url: A.photoUrl(x.img), size: x.size, floor: x.floor, host: x.host || null } : null; };
    return { id: t.id, name: t.name, logo: t.logo !== false, builtin: BUILTIN_THEMES.indexOf(t.id) >= 0, hidden: !!t.hidden, land: side(t.land), port: side(t.port) };
  }
  function themes() { return themesRaw().map(themeView); }
  function cleanSide(src, old, id, k) {
    var size = [Math.round(Number((src.size || [])[0])), Math.round(Number((src.size || [])[1]))];
    if (!(size[0] >= 200 && size[0] <= 6000 && size[1] >= 200 && size[1] <= 6000)) throw err('INVALID', 'Ukuran gambar tema tidak valid');
    var floor = {};
    ['tl', 'tr', 'br', 'bl'].forEach(function (c) {
      var q = (src.floor || {})[c] || [], x = Number(q[0]), y = Number(q[1]);
      if (!isFinite(x) || !isFinite(y) || x < -size[0] * .2 || x > size[0] * 1.2 || y < -size[1] * .2 || y > size[1] * 1.2) throw err('INVALID', 'Tandai 4 sudut lantai dulu');
      floor[c] = [Math.round(x), Math.round(y)];
    });
    var img = old && old.img;
    if (src.data) { var nid = A.savePhoto(src.data, 'tema_' + id + '_' + k); if (img) A.trash(img); img = nid; }
    if (!img) throw err('INVALID', 'Unggah gambar tema dulu');
    var h = src.host, host = h && isFinite(Number(h[0])) && isFinite(Number(h[1])) ? [Math.max(-.5, Math.min(1.5, Number(h[0]))), Math.max(-.5, Math.min(1.5, Number(h[1])))] : null;
    return { img: img, size: size, floor: floor, host: host };
  }
  function saveTheme(r) {
    auth(r.token, ['admin']);
    var t = r.theme || {};
    return A.lock(function () {
      var list = themesRaw();
      var id = /^[a-z0-9_]{2,24}$/.test(String(t.id || '')) ? t.id : 't_' + A.uuid().replace(/-/g, '').slice(0, 8);
      var old = list.filter(function (x) { return x.id === id; })[0] || { id: id }, builtin = BUILTIN_THEMES.indexOf(id) >= 0;
      var name = String(t.name || '').trim().slice(0, 40);
      if (!builtin && !name) throw err('INVALID', 'Isi nama tema');
      var out = { id: id, name: name, logo: t.logo !== false, hidden: !!t.hidden };
      ['land', 'port'].forEach(function (k) {
        if (t[k] === null) { if (old[k]) A.trash(old[k].img); return; }          // gambar dihapus
        if (!t[k]) { if (old[k]) out[k] = old[k]; return; }                    // tidak diubah
        out[k] = cleanSide(t[k], old[k], id, k);
      });
      if (!builtin && !out.land && !out.port) throw err('INVALID', 'Unggah minimal satu gambar (layar lebar atau HP tegak)');
      A.setProp('LOBBY_THEMES', JSON.stringify(list.filter(function (x) { return x.id !== id; }).concat([out])));
      return themes();
    });
  }
  /* hapus tema buatan admin; untuk tema bawaan: kembali ke gambar bawaan */
  function deleteTheme(r) {
    auth(r.token, ['admin']);
    return A.lock(function () {
      var list = themesRaw(), t = list.filter(function (x) { return x.id === r.id; })[0];
      if (!t) throw err('NOT_FOUND', 'Tema tidak ditemukan');
      ['land', 'port'].forEach(function (k) { if (t[k]) A.trash(t[k].img); });
      A.setProp('LOBBY_THEMES', JSON.stringify(list.filter(function (x) { return x.id !== r.id; })));
      return themes();
    });
  }

  /* ---------------- kudos setelah sesi ---------------- */
  var KUDOS_PLAYER = ['wall_master', 'lob_specialist', 'vibora_specialist', 'bandeja_master', 'smash_machine', 'volley_expert', 'block_master', 'spin_doctor',
    'chiquita_artist', 'bajada_specialist', 'drop_shot_artist', 'tactical_genius', 'game_reader', 'positioning_pro', 'defensive_wall', 'rally_machine',
    'predator', 'dream_partner', 'hype_partner', 'smart_supporter', 'silent_killer'];
  var KUDOS_HOST = ['super_host', 'organized_host', 'vibe_master', 'problem_solver', 'game_day_hero', 'reliable_host'];
  var KUDOS_DAYS = 7;
  /* yang hadir di sesi: pemain (pernah masuk acakan) dan host */
  function attendees(S) {
    var who = {};
    Object.keys(S.parts || {}).forEach(function (pid) { who[pid] = 'player'; });
    (S.hosts || []).forEach(function (pid) { if (!who[pid]) who[pid] = 'host'; });
    return who;
  }
  function kudosSession(r, actor) {
    var S = loadS(r.sid);
    if (!S || S.status !== 'done') throw err('NOT_FOUND', 'Sesi belum selesai');
    var who = attendees(S);
    if (!who[actor.id]) throw err('FORBIDDEN', 'Kamu tidak ikut sesi ini');
    return { S: S, who: who, open: now() - (S.endedAt || S.updated || 0) < KUDOS_DAYS * 864e5 };
  }
  function kudosForm(r) {
    var actor = auth(r.token), x = kudosSession(r, actor), given = {};
    (A.kudosBy ? A.kudosBy(x.S.id, actor.id) : []).forEach(function (k) { (given[k.target] = given[k.target] || []).push(k.k); });
    return { sid: x.S.id, name: x.S.name, open: x.open, given: given, lists: { player: KUDOS_PLAYER, host: KUDOS_HOST },
      people: Object.keys(x.who).filter(function (id) { return id !== actor.id && person(id); }).map(function (id) { return { id: id, role: x.who[id] }; }) };
  }
  function giveKudos(r) {
    var actor = auth(r.token), x = kudosSession(r, actor);
    if (!x.open) throw err('INVALID', 'Waktu memberi kudos untuk sesi ini sudah lewat');
    if (!A.saveKudos) throw err('INVALID', 'Kudos belum tersedia di versi ini');
    var gifts = r.gifts || {}, rows = [];
    Object.keys(gifts).forEach(function (target) {
      if (target === actor.id || !x.who[target]) throw err('INVALID', 'Kudos hanya untuk yang hadir di sesi ini');
      var ks = (gifts[target] || []).filter(function (k, i, a) { return a.indexOf(k) === i; });
      if (ks.length > 2) throw err('INVALID', 'Maksimal 2 kudos untuk satu orang');
      var allowed = x.who[target] === 'host' ? KUDOS_HOST : KUDOS_PLAYER;
      ks.forEach(function (k) { if (allowed.indexOf(k) < 0) throw err('INVALID', 'Kudos tidak dikenal'); rows.push({ target: target, k: k }); });
    });
    A.lock(function () { A.saveKudos(x.S.id, actor.id, rows, now()); });
    return { count: rows.length };
  }
  /* penerima melihat siapa yang memberi; orang lain tidak bisa */
  function myKudos(r) {
    var actor = auth(r.token), names = {}, totals = {};
    var list = (A.kudosFor ? A.kudosFor(actor.id) : []).map(function (k) {
      totals[k.k] = (totals[k.k] || 0) + 1;
      if (!(k.sid in names)) { var S = loadS(k.sid); names[k.sid] = S ? S.name : ''; }
      var g = person(k.giver);
      return { k: k.k, from: g ? g.name : '?', fromId: k.giver, session: names[k.sid], at: k.at };
    }).sort(function (a, b) { return b.at - a.at; });
    return { totals: totals, list: list };
  }
  /* admin: semua pemain dan kudos yang diterima */
  function kudosAdmin(r) {
    auth(r.token, ['admin']);
    var by = {}, names = {};
    (A.kudosAll ? A.kudosAll() : []).forEach(function (k) {
      var o = by[k.target] = by[k.target] || { id: k.target, total: 0, totals: {}, list: [] };
      o.total++; o.totals[k.k] = (o.totals[k.k] || 0) + 1;
      if (!(k.sid in names)) { var S = loadS(k.sid); names[k.sid] = S ? S.name : ''; }
      var g = person(k.giver); o.list.push({ k: k.k, from: g ? g.name : '?', fromId: k.giver, session: names[k.sid], at: k.at });
    });
    return Object.keys(by).map(function (id) { var p = person(id); by[id].name = p ? p.name : '?'; return by[id]; })
      .sort(function (a, b) { return b.total - a.total || a.name.localeCompare(b.name); });
  }

  function venueSearch(r) {
    auth(r.token, ['admin', 'host']);
    var q = String(r.q || '').trim().slice(0, 120);
    if (q.length < 3) throw err('INVALID', 'Tulis minimal 3 huruf nama venue');
    return Promise.resolve(A.geocode ? A.geocode(q) : []);
  }

  /* dashboard publik: tanpa login. Dipanggil berkala oleh semua perangkat. */
  function poll(r, member) {
    r = r || {};
    var sid = A.prop('ACTIVE_SID') || '';
    var out = { now: now(), sid: sid, pv: peopleVersion(), plans: plans(member === true || isMember(r.token)), themes: themes() };
    if (sid) {
      var S = loadS(sid);
      if (!S) { out.sid = ''; } else {
        out.v = S.v || 0;
        if (r.sid !== sid || r.v !== out.v) out.S = publicS(S);
      }
    }
    if (r.pv !== out.pv) {
      out.people = people().map(publicPerson);
    }
    return out;
  }

  function listSessions(r) { auth(r.token, ['admin', 'host']); return A.sessions(); }
  function openSession(r) {
    auth(r.token, ['admin', 'host']);
    var S = loadS(r.sid);
    if (!S) throw err('NOT_FOUND', 'Sesi tidak ditemukan');
    A.setProp('ACTIVE_SID', S.id);
    return { sid: S.id, v: S.v, S: publicS(S) };
  }
  function deleteSession(r) {
    auth(r.token, ['admin', 'host']);
    return A.lock(function () {
      A.deleteSession(r.sid);
      A.cachePut('S_' + r.sid, null);
      if (A.prop('ACTIVE_SID') === r.sid) A.delProp('ACTIVE_SID');
      return true;
    });
  }
  function createSession(r) {
    var actor = auth(r.token, ['admin', 'host']);
    return A.lock(function () {
      var P = playersMap();
      var all = people();
      var hostIds = all.filter(function (p) { return p.role === 'host'; }).map(function (p) { return p.id; });
      var st = r.setup || {};
      var ids = (st.playerIds || []).filter(function (id) { return P[id] && hostIds.indexOf(id) < 0; });
      var S = Engine.newSession({
        name: st.name, format: st.format, teamMode: st.teamMode, scoring: st.scoring, rules: st.rules,
        courts: (st.courts || []).slice(0, 6), playerIds: ids,
        teams: (st.teams || []).filter(function (t) { return ids.indexOf(t.a) >= 0 && ids.indexOf(t.b) >= 0; })
      });
      // host sesi bisa lebih dari satu; masing-masing bisa ditugaskan sebagai wasit di satu court
      setHosts(S, st.hosts || (st.hostId ? [st.hostId] : actor.role === 'host' ? [actor.id] : []));
      S.calls = {}; S.lastDone = {};
      if (st.pay) {                                                   // biaya per orang (opsional) diisi saat membuat sesi
        var amt0 = Math.round(Number(st.pay.amount) || 0), col0 = st.pay.collector ? person(st.pay.collector) : null;
        S.pay = { collector: col0 && !col0.archived ? col0.id : null, amount: amt0 > 0 ? Math.min(amt0, 100000000) : null, bank: col0 && !col0.archived ? col0.bank || null : null, st: {} };
      }
      if (st.plan) {
        // rencana: buka ruang tunggu dulu; pemain yang dipilih host langsung tercatat hadir
        var f = planFields(st.plan);
        if (!f.when) throw err('INVALID', 'Isi tanggal dan jam main');
        S.parts = {}; S.teams = []; S.status = 'plan';
        S.plan = { when: f.when, until: f.until, whenText: f.whenText, venue: f.venue, theme: f.theme, by: actor.id, created: now(), reminded: {}, chat: [],
          teams: S.teamMode === 'fixed' ? (st.teams || []).filter(function (t) { return ids.indexOf(t.a) >= 0 && ids.indexOf(t.b) >= 0; }) : [],
          levels: Engine.isPC(S) ? levelMap(ids, st.levels) : {},                // Power Cup: level atas yang sudah ditandai saat membuat rencana
          rsvp: ids.map(function (pid) { return { pid: pid, role: 'player', at: now(), by: actor.id }; }) };
        saveS(S, P);
        if (A.notify) all.forEach(function (x) {
          if (x.archived || x.id === actor.id) return;
          A.notify(x.id, { title: 'Sesi baru: ' + S.name, body: [f.whenText, venueLine(f.venue)].filter(Boolean).join(' · ') + '. Buka untuk ikut hadir.',
            tag: 'plan-' + S.id, url: '/?lobby=' + S.id, join: true });
        });
        return { sid: S.id, v: S.v, S: publicS(S), plan: planView(S, true) };
      }
      if (Engine.isPC(S)) {
        S.teams = Engine.newSession({ format: 'powercup', playerIds: ids, teams: st.pairRest === false ? S.teams : levelTeams(ids, st.levels, S.teams) }).teams;
        pcBegin(S, P, levelMap(ids, st.levels));
      } else Engine.fillCourts(S, P);
      saveS(S, P);
      A.setProp('ACTIVE_SID', S.id);
      return { sid: S.id, v: S.v, S: publicS(S) };
    });
  }

  /* host sesi: hanya akun host/admin aktif; court yang wasitnya bukan host sesi dikosongkan */
  function setHosts(S, ids) {
    var staff = people().filter(function (p) { return (p.role === 'host' || p.role === 'admin') && !p.archived; }).map(function (p) { return p.id; });
    S.hosts = (ids || []).filter(function (id, i, a) { return staff.indexOf(id) >= 0 && a.indexOf(id) === i; }).slice(0, 12);
    S.hostId = S.hosts[0] || null; // kompatibel dengan v2.1 (satu host)
    S.courts.forEach(function (c) { if (c.hostId && S.hosts.indexOf(c.hostId) < 0) c.hostId = null; });
  }

  /* keluarkan pid dari semua match berjalan atau menunggu: ganti dengan antrean teratas yang cocok, atau batalkan match */
  function replaceOut(S, P, pid) {
    var info = null;
    Engine.liveMatches(S).filter(function (m) { return m.A.concat(m.B).indexOf(pid) >= 0; })
      .forEach(function (m) { info = replaceIn(S, P, pid, m) || info; });
    return info;
  }
  function replaceIn(S, P, pid, m) {
    if (m.status !== 'live') return null;
    if (S.teamMode === 'fixed') { Engine.voidMatch(S, m.id); return { voided: m.id }; }
    var court = S.courts.filter(function (c) { return c.id === m.court; })[0] || { gender: 'mix' };
    var cand = Engine.bench(S).filter(function (b) {
      return b.id !== pid && (court.gender === 'mix' || (P[b.id] || {}).gender === court.gender);
    });
    if (cand.length) { Engine.swapPlayer(S, m.id, pid, cand[0].id); return { replacedBy: cand[0].id, match: m.id }; }
    Engine.voidMatch(S, m.id);
    return { voided: m.id };
  }

  /* ---------------- host sesi dari pemain, pembayaran, koreksi skor ---------------- */
  // pemain yang ditunjuk jadi host sesi: mengurus skor & pemain di sesi itu saja (bukan mengakhiri, mengatur court, atau database)
  var COHOST_ACTIONS = { fill: 1, score: 1, reshuffle: 1, void: 1, swap: 1, swapTeam: 1, unwait: 1, kick: 1, join: 1, skip: 1, ready: 1, pair: 1,
    call: 1, go: 1, tally: 1, swapX: 1, swapTeamX: 1, rsvp: 1, pcCourt: 1, pcCard: 1, pcResp: 1, pcPass: 1, pcUndo: 1, pcDraw: 1, here: 1 };
  // Power Cup: susunan match ditentukan alur menang-kalah-undi, jadi tidak diacak ulang atau ditukar manual
  var PC_OFF = { reshuffle: 1, swap: 1, swapTeam: 1, unwait: 1, swapX: 1, swapTeamX: 1 };
  // aksi dengan aturan izin sendiri (dicek di applyCommon), berlaku di lobi, saat main, dan setelah selesai
  var COMMON_ACTIONS = { cohost: 1, payCollector: 1, payBank: 1, payProof: 1, payMark: 1, dispute: 1, disputeDone: 1 };
  function roleStaff(p) { return p.role === 'admin' || p.role === 'host'; }
  function isCohost(S, pid) { return (S.cohosts || []).indexOf(pid) >= 0; }
  /* yang membayar: pemain yang hadir (bukan host) */
  function payers(S) {
    if (S.status === 'plan') return ((S.plan || {}).rsvp || []).filter(function (x) { return x.role === 'player'; }).map(function (x) { return x.pid; });
    return Object.keys(S.parts || {});
  }
  function inSession(S, pid) {
    return payers(S).indexOf(pid) >= 0 || (S.hosts || []).indexOf(pid) >= 0 || isCohost(S, pid) ||
      (S.status === 'plan' && ((S.plan || {}).rsvp || []).some(function (x) { return x.pid === pid; }));
  }
  function rupiah(n) { return 'Rp ' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function cleanBank(b) {
    b = b || {};
    var holder = String(b.holder || '').replace(/\s+/g, ' ').trim().slice(0, 60), bank = String(b.bank || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    var number = String(b.number || '').replace(/[^\d\s-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 34);
    if (!holder || !bank || number.replace(/\D/g, '').length < 5) throw err('INVALID', 'Isi nama pemilik rekening, nama bank, dan nomor rekening');
    return { holder: holder, bank: bank, number: number };
  }
  /* ringkasan pembayaran untuk data sesi publik: tanpa rekening & bukti */
  function paySummary(S) {
    var pay = S.pay;
    if (!pay) return null;
    var paid = {};
    Object.keys(pay.st || {}).forEach(function (pid) { if (pay.st[pid].paid) paid[pid] = pay.st[pid].by === 'proof' ? 'proof' : 'ok'; });
    return { collector: pay.collector || null, amount: pay.amount || null, hasBank: !!pay.bank, paid: paid };
  }
  function reviewers(S) {
    var ids = people().filter(function (p) { return p.role === 'admin' && !p.archived; }).map(function (p) { return p.id; }).concat(S.hosts || [], S.cohosts || []);
    return ids.filter(function (x, i, a) { return a.indexOf(x) === i; });
  }
  function applyCommon(S, P, type, d, actor, co) {
    var staff = roleStaff(actor), notify = A.notify || function () {};
    var pay = S.pay = S.pay || { collector: null, amount: null, bank: null, st: {} };
    pay.st = pay.st || {};
    var isCollector = !!pay.collector && pay.collector === actor.id;
    var payUrl = '/?pay=' + S.id;
    if (type === 'cohost') {
      if (!staff) throw err('FORBIDDEN', 'Hanya admin atau host yang bisa menunjuk host sesi');
      var who = person(d.pid);
      if (!who || who.archived || who.role !== 'user') throw err('INVALID', 'Pilih akun pemain');
      var was = isCohost(S, who.id);
      S.cohosts = (S.cohosts || []).filter(function (x) { return x !== who.id; });
      if (d.on !== false) {
        if (S.cohosts.length >= 6) throw err('INVALID', 'Maksimal 6 pemain jadi host sesi');
        S.cohosts.push(who.id);
        if (!was) notify(who.id, { title: 'Kamu jadi host sesi: ' + S.name, body: 'Kamu bisa memasukkan skor dan mengatur pemain di sesi ini.', tag: 'cohost-' + S.id,
          url: S.status === 'plan' ? '/?lobby=' + S.id : '/' });
      }
      return null;
    }
    if (type === 'payCollector') {
      if (!staff) throw err('FORBIDDEN', 'Hanya admin atau host yang bisa menentukan payment collector');
      if (d.pid) {
        var c = person(d.pid);
        if (!c || c.archived) throw err('NOT_FOUND', 'Orang tidak ditemukan');
        if (pay.collector !== c.id) {
          pay.collector = c.id; pay.bank = c.bank || null;
          if (c.id !== actor.id) notify(c.id, { title: 'Kamu payment collector: ' + S.name, body: c.bank ? 'Rekeningmu sudah terisi. Cek siapa saja yang sudah bayar.' : 'Isi nama bank dan nomor rekening supaya pemain bisa transfer.', tag: 'paycol-' + S.id, url: payUrl });
        }
      } else if (d.pid === null || d.pid === '') { pay.collector = null; pay.bank = null; }
      if (d.amount !== undefined) { var amt = Math.round(Number(d.amount) || 0); pay.amount = amt > 0 ? Math.min(amt, 100000000) : null; }
      return null;
    }
    if (type === 'payBank') {
      if (!isCollector && !staff) throw err('FORBIDDEN', 'Hanya payment collector yang bisa mengisi rekening');
      if (!pay.collector) throw err('INVALID', 'Belum ada payment collector');
      pay.bank = cleanBank(d);
      if (isCollector) { var self = person(actor.id); self.bank = pay.bank; A.savePerson(self); A.cachePut('PEOPLE', null); } // dipakai lagi di sesi berikutnya
      return null;
    }
    if (type === 'payProof') {
      if (payers(S).indexOf(actor.id) < 0) throw err('FORBIDDEN', 'Kamu tidak terdaftar sebagai pemain di sesi ini');
      if (!pay.collector) throw err('INVALID', 'Belum ada payment collector untuk sesi ini');
      if (!/^data:image\/(jpeg|png|webp);base64,/.test(String(d.data || '')) || String(d.data).length > 1400000) throw err('INVALID', 'Foto bukti bayar tidak valid');
      var old = pay.st[actor.id] || {}, ph = A.savePhoto(d.data, actor.name + '_bayar');
      if (old.proof) A.trash(old.proof);
      pay.st[actor.id] = { paid: true, by: 'proof', at: now(), proof: ph };
      if (pay.collector !== actor.id) notify(pay.collector, { title: 'Bukti bayar: ' + actor.name, body: S.name + (pay.amount ? ' · ' + rupiah(pay.amount) : '') + '. Batalkan tanda hijaunya bila transfer belum masuk.', tag: 'pay-' + S.id + '-' + actor.id, url: payUrl });
      return null;
    }
    if (type === 'payMark') {
      if (!isCollector && !staff) throw err('FORBIDDEN', 'Hanya payment collector, admin, atau host');
      if (payers(S).indexOf(d.pid) < 0 && !pay.st[d.pid]) throw err('NOT_FOUND', 'Pemain tidak ada di sesi ini');
      var cur = pay.st[d.pid] || {}, note = String(d.note || '').replace(/\s+/g, ' ').trim().slice(0, 120);
      pay.st[d.pid] = { paid: !!d.paid, by: 'collector', at: now(), proof: cur.proof || null, byId: actor.id, note: d.paid ? '' : note, rejected: !d.paid && !!cur.paid };
      if (!d.paid && cur.paid && d.pid !== actor.id) notify(d.pid, { title: 'Pembayaran belum diterima', body: S.name + (note ? ': ' + note : '') + '. Cek lagi lalu unggah bukti yang benar.', tag: 'pay-' + S.id, url: payUrl });
      return null;
    }
    if (type === 'dispute') {
      var m = Engine.findMatch(S, d.m);
      if (!m || m.status !== 'done') throw err('INVALID', 'Koreksi hanya untuk match yang sudah selesai');
      if (m.A.concat(m.B).indexOf(actor.id) < 0) throw err('FORBIDDEN', 'Koreksi skor hanya untuk pemain di match itu');
      var a = Math.round(Number(d.a)), b = Math.round(Number(d.b));
      var v = Engine.validateScore(S, a, b);
      if (!v.ok) throw err('INVALID', v.msg);
      if (a === m.sA && b === m.sB) throw err('INVALID', 'Skor usulan sama dengan skor sekarang');
      S.disputes = S.disputes || [];
      if (S.disputes.some(function (x) { return x.m === m.id && x.st === 'open'; })) throw err('INVALID', 'Koreksi untuk match ini sedang direview');
      var dp = { id: A.uuid('d_'), m: m.id, no: m.no, by: actor.id, a: a, b: b, was: [m.sA, m.sB], at: now(), st: 'open',
        note: String(d.note || '').replace(/\s+/g, ' ').trim().slice(0, 200) };
      S.disputes.push(dp);
      reviewers(S).forEach(function (pid) {
        if (pid !== actor.id) notify(pid, { title: 'Koreksi skor: Match #' + m.no, body: actor.name + ' mengusulkan ' + a + '-' + b + ' (tercatat ' + m.sA + '-' + m.sB + ')' + (dp.note ? ': ' + dp.note : '') + ' · ' + S.name,
          tag: 'dispute-' + dp.id, url: '/?dispute=' + S.id });
      });
      return { dispute: dp.id };
    }
    if (type === 'disputeDone') {
      if (!staff && !co) throw err('FORBIDDEN', 'Hanya admin atau host yang bisa mereview koreksi skor');
      var x = (S.disputes || []).filter(function (q) { return q.id === d.id; })[0];
      if (!x) throw err('NOT_FOUND', 'Koreksi tidak ditemukan');
      if (x.st !== 'open') throw err('STALE', 'Koreksi ini sudah direview');
      if (d.ok) {
        var mm = Engine.findMatch(S, x.m);
        if (!mm || mm.status !== 'done') throw err('STALE', 'Match sudah berubah');
        var na = d.a != null ? Math.round(Number(d.a)) : x.a, nb = d.b != null ? Math.round(Number(d.b)) : x.b, vv = Engine.validateScore(S, na, nb);
        if (!vv.ok) throw err('INVALID', vv.msg);
        var dr1 = mm.drawn && mm.drawn.t;
        Engine.submitScore(S, mm.id, na, nb);
        if (Engine.isPC(S)) pcOweNotify(S, mm, dr1);                 // Power Cup: menang/kalah tertukar → hak ambil kartu ikut berpindah
        x.st = 'fixed'; x.final = [na, nb];
      } else x.st = 'rejected';
      x.reply = String(d.reply || '').replace(/\s+/g, ' ').trim().slice(0, 200); x.doneBy = actor.id; x.doneAt = now();
      notify(x.by, { title: x.st === 'fixed' ? 'Skor Match #' + x.no + ' diperbaiki' : 'Koreksi skor Match #' + x.no + ' ditolak',
        body: (x.st === 'fixed' ? 'Skor sekarang ' + x.final[0] + '-' + x.final[1] : 'Skor tetap ' + x.was[0] + '-' + x.was[1]) + (x.reply ? '. ' + actor.name + ': ' + x.reply : '') + ' · ' + S.name,
        tag: 'dispute-' + x.id, url: '/' });
      return null;
    }
    throw err('INVALID', 'Aksi tidak dikenal: ' + type);
  }
  /* rincian pembayaran: rekening & daftar bayar untuk yang ikut sesi; bukti foto hanya untuk pengirim, collector, admin/host */
  function payInfo(r) {
    var actor = auth(r.token), S = loadS(r.sid);
    if (!S) throw err('NOT_FOUND', 'Sesi tidak ditemukan');
    var pay = S.pay || {}, st = pay.st || {}, staff = roleStaff(actor), coll = !!pay.collector && pay.collector === actor.id;
    if (!staff && !coll && !inSession(S, actor.id)) throw err('FORBIDDEN', 'Kamu tidak terdaftar di sesi ini');
    var full = staff || coll, ids = payers(S);
    Object.keys(st).forEach(function (pid) { if (ids.indexOf(pid) < 0) ids.push(pid); });
    return { sid: S.id, name: S.name, status: S.status, collector: pay.collector || null, amount: pay.amount || null, bank: pay.bank || null,
      canSet: staff, canManage: full, isCollector: coll, isPayer: payers(S).indexOf(actor.id) >= 0,
      choices: staff ? payers(S).concat(S.hosts || [], S.status === 'plan' ? S.plan.rsvp.map(function (x) { return x.pid; }) : []).filter(function (x, i, a) { return a.indexOf(x) === i; }) : [],
      list: ids.map(function (pid) {
        var x = st[pid] || {};
        return { pid: pid, paid: !!x.paid, by: x.by || '', at: x.at || 0, note: x.note || '', rejected: !!x.rejected, proofUrl: x.proof && (full || pid === actor.id) ? A.photoUrl(x.proof) : '' };
      }) };
  }
  /* riwayat sesi yang sudah selesai: untuk semua yang login */
  function pastSessions(r) {
    var actor = auth(r.token), P = playersMap();
    return A.sessions().filter(function (x) { return x.status === 'done'; }).slice(0, 60).map(function (x) {
      var S = loadS(x.id);
      if (!S) return null;
      var key = 'PAST_' + S.id + '_' + S.v, c = A.cacheGet(key);
      if (!c) {
        var fixed = S.teamMode === 'fixed', rows = Engine.standings(S, P, fixed ? { unit: 'team', sortBy: S.rules.sortBy } : { sortBy: S.rules.sortBy });
        c = { id: S.id, name: S.name, date: S.date, endedAt: S.endedAt || S.updated || 0, venue: (S.plan && S.plan.venue) || null, format: S.format, teamMode: S.teamMode,
          players: Object.keys(S.parts).length, matches: S.matches.filter(function (m) { return m.status === 'done'; }).length,
          top: rows.slice(0, 3).map(function (q) { return fixed ? [q.team.a, q.team.b] : [q.id]; }), ids: Object.keys(S.parts).concat(S.hosts || [], S.cohosts || []) };
        A.cachePut(key, c, 86400);
      }
      var o = JSON.parse(JSON.stringify(c));
      o.mine = o.ids.indexOf(actor.id) >= 0; delete o.ids;
      return o;
    }).filter(Boolean).sort(function (a, b) { return (b.endedAt || 0) - (a.endedAt || 0); });
  }
  function pastSession(r) {
    auth(r.token);
    var S = loadS(r.sid);
    if (!S || S.status !== 'done') throw err('NOT_FOUND', 'Sesi tidak ditemukan');
    return { S: publicS(S) };
  }

  var SELF_ACTIONS = { skip: 1, ready: 1, leave: 1, rsvp: 1, chat: 1, pcCourt: 1, pcCard: 1, pcResp: 1, pcPass: 1, pcUndo: 1, pcDraw: 1, here: 1 };
  function act(r) {
    var actor = auth(r.token);
    var type = r.type, d = r.payload || {};
    if (!roleStaff(actor) && !SELF_ACTIONS[type] && !COMMON_ACTIONS[type] && !COHOST_ACTIONS[type]) throw err('FORBIDDEN', 'Aksi ini khusus admin atau host');
    return A.lock(function () {
      var S = loadS(r.sid || A.prop('ACTIVE_SID'));
      if (!S) throw err('NOT_FOUND', 'Sesi tidak ditemukan');
      var co = isCohost(S, actor.id), staff = roleStaff(actor) || (co && !!COHOST_ACTIONS[type]);
      if (!staff && !SELF_ACTIONS[type] && !COMMON_ACTIONS[type]) throw err('FORBIDDEN', 'Aksi ini khusus admin atau host');
      if (!staff && !COMMON_ACTIONS[type]) d.pid = actor.id;
      var P = playersMap();
      var info;
      if (COMMON_ACTIONS[type]) info = applyCommon(S, P, type, d, actor, co);
      else if (S.status === 'plan') {
        if (!PLAN_ACTIONS[type]) throw err('INVALID', 'Sesi ini masih di ruang tunggu');
        info = applyPlan(S, P, type, d, actor, staff);
      } else if (type === 'backToLobby') { if (!roleStaff(actor)) throw err('FORBIDDEN'); backToLobby(S); }
      else if (PLAN_ACTIONS[type]) throw err('STALE', 'Sesi sudah dimulai');
      else {
        if (S.status === 'live' && S.avail && applyAvail(S, now()).changed) fill(S, P);
        var rd0 = S.pc ? S.pc.round || 0 : 0;
        info = apply(S, P, type, d, actor, staff);
        if (Engine.isPC(S) && S.pc && (S.pc.round || 0) > rd0 && rd0 > 0) pcOweRemind(S);
      }
      saveS(S, P);
      var out = { sid: S.id, v: S.v, S: publicS(S), info: info || null };
      if (S.plan) out.plan = planView(S, true);
      return out;
    });
  }

  function findM(S, id, needLive) {
    var m = Engine.findMatch(S, id);
    if (!m) throw err('STALE', 'Match sudah berubah. Data diperbarui');
    if (needLive && m.status !== 'live') throw err('STALE', 'Match sudah selesai atau dibatalkan');
    return m;
  }
  function fill(S, P) { if (S.status === 'live') Engine.fillCourts(S, P); }

  function apply(S, P, type, d, actor, staff) {
    S.calls = S.calls || {}; S.lastDone = S.lastDone || {};
    var m, info = null;
    if (PC_OFF[type] && Engine.isPC(S)) throw err('INVALID', 'Tidak dipakai di Power Cup: lawan ditentukan dari undian penantang');
    switch (type) {
      case 'fill': if (S.status === 'live') Engine.fillCourts(S, P, null, !!d.force); break;
      case 'score':
        m = findM(S, d.m);
        var wasLive = m.status === 'live', dr0 = m.drawn && m.drawn.t;
        Engine.submitScore(S, m.id, Number(d.a), Number(d.b));
        if (Engine.isPC(S)) pcOweNotify(S, m, dr0);
        if (wasLive) S.lastDone[m.court] = { m: m.id, at: now() };
        if (wasLive || Engine.isPC(S)) fill(S, P);                    // Power Cup: koreksi skor bisa menukar menang/kalah
        break;
      case 'pcCard':  // Power Cup: pakai kartu power
      case 'pcResp':  // jawab kartu lawan dengan Block / Reverse
      case 'pcPass':  // penantang menyatakan tanpa kartu sebelum match
      case 'pcUndo':  // batalkan kartu yang dipasang (sebelum match dimulai)
      case 'pcDraw':  // tim kalah mengambil kartu (HP sendiri, atau host di iPad)
        if (!Engine.isPC(S) || S.status !== 'live') throw err('INVALID', 'Hanya untuk sesi Power Cup yang berjalan');
        var tm = roleStaff(actor) && d.team ? Engine.teamById(S, d.team) : Engine.teamOf(S, actor.id);   // atas nama tim lain: admin/host saja
        if (!tm) throw err('FORBIDDEN', 'Kamu tidak ada di tim mana pun di sesi ini');
        if (type === 'pcDraw') {
          var dres = Engine.pcDraw(S, tm.id);
          if (dres.err) throw err('STALE', dres.err);
          pcDrawNotify(S, tm, dres, actor);
          info = { t: tm.id, m: dres.m, card: dres.card || null, z: dres.z || 0, full: dres.full || 0 };   // isi kartu hanya untuk yang mengambil
          break;
        }
        var pe = type === 'pcCard' ? Engine.pcPlay(S, { team: tm.id, card: d.card, ref: d.ref, target: d.target })
          : type === 'pcResp' ? Engine.pcRespond(S, { team: tm.id, card: d.card, of: d.of, ref: d.ref })
          : type === 'pcUndo' ? Engine.pcUndo(S, { team: tm.id, card: d.card, ref: d.ref }) : Engine.pcPass(S, d.ref, tm.id);
        if (pe) throw err('INVALID', pe);
        pcFixCalls(S);
        if (type === 'pcCard' || type === 'pcResp') pcCardNotify(S, P, type, d.card);
        break;
      case 'pcCourt': // Power Cup: tim penantang memilih court untuk tantangannya (host boleh memilihkan)
        if (!Engine.isPC(S) || S.status !== 'live') throw err('INVALID', 'Hanya untuk sesi Power Cup yang berjalan');
        Engine.pcSync(S);
        var pd = (S.pc.pend || [])[0];
        if (!pd || (d.p && d.p !== pd.id)) throw err('STALE', 'Tantangan ini sudah mendapat court. Data diperbarui');
        if (!staff) {
          var tc = Engine.teamById(S, pd.ch);
          if (!tc || (tc.a !== d.pid && tc.b !== d.pid)) throw err('FORBIDDEN', 'Court dipilih oleh tim penantang');
        }
        if (d.all && staff) {                                       // host: semua tantangan dipilihkan court acak
          for (var g = 0; g < 12 && S.pc.pend.length; g++) if (!Engine.pcChoose(S, null)) break;
        } else if (!Engine.pcChoose(S, d.c || null)) throw err('STALE', 'Court itu sudah terisi. Data diperbarui');
        break;
      case 'reshuffle':
        m = findM(S, d.m, true);
        if (!Engine.reshuffle(S, P, m.id)) info = { msg: 'Tidak ada susunan lain yang memungkinkan' };
        break;
      case 'void': m = findM(S, d.m, true); Engine.voidMatch(S, m.id); fill(S, P); break;
      case 'swap': m = findM(S, d.m, true); Engine.swapPlayer(S, m.id, d.out, d['in']); break;
      case 'swapTeam': m = findM(S, d.m, true); Engine.swapTeam(S, m.id, d.side, d.team); break;
      case 'unwait': // host tidak mau menunggu pemain dari court lain
        m = findM(S, d.m, true);
        var fw = Engine.freeWaiting(S, P, m.id);
        if (fw.missing.length) info = { msg: 'Tidak ada pemain menunggu yang cocok untuk menggantikan ' + fw.missing.map(function (x) { return (P[x] || {}).name || x; }).join(', ') };
        break;
      case 'kick':
      case 'leave':
        if (!S.parts[d.pid]) throw err('NOT_FOUND', 'Pemain tidak ada di sesi ini');
        Engine.removeParticipant(S, d.pid);
        info = replaceOut(S, P, d.pid);
        fill(S, P);
        break;
      case 'skip':
        if (!S.parts[d.pid]) throw err('NOT_FOUND', 'Pemain tidak ada di sesi ini');
        S.parts[d.pid].paused = true;
        info = replaceOut(S, P, d.pid);
        delete S.calls[d.pid];
        fill(S, P);
        break;
      case 'ready':
        if (!S.parts[d.pid]) throw err('NOT_FOUND', 'Pemain tidak ada di sesi ini');
        S.parts[d.pid].paused = false; delete S.parts[d.pid].absent;
        if (S.parts[d.pid].timeOff === 'wait' && S.avail && S.avail[d.pid]) S.avail[d.pid].st = 'in';   // datang lebih awal
        delete S.parts[d.pid].timeOff;                                                                   // atau lanjut main setelah jamnya habis
        if (!S.parts[d.pid].active) Engine.addParticipant(S, d.pid, S.rules.catchUp);
        fill(S, P);
        break;
      case 'join':
        if (!P[d.pid]) throw err('NOT_FOUND', 'Pemain tidak ditemukan');
        Engine.addParticipant(S, d.pid, S.rules.catchUp);
        fill(S, P);
        break;
      case 'pair':
        if (!d.a || !d.b || d.a === d.b) throw err('INVALID', 'Pilih dua pemain berbeda');
        S.teams.push({ id: Engine.uid('t_'), a: d.a, b: d.b });
        fill(S, P);
        break;
      case 'settings': applySettings(S, d); fill(S, P); break;
      case 'call':
        m = findM(S, d.m, true);
        var cname = (S.courts.filter(function (c) { return c.id === m.court; })[0] || {}).name || 'Court';
        var nm = function (id) { return (P[id] || {}).name || '?'; };
        m.A.concat(m.B).forEach(function (pid) {
          S.calls[pid] = { at: now(), m: m.id, by: actor.id };
          // notifikasi push ke HP pemain (bila aplikasinya terpasang & izin notifikasi aktif)
          if (A.notify) {
            var mine = m.A.indexOf(pid) >= 0 ? m.A : m.B, opp = mine === m.A ? m.B : m.A;
            var partner = mine.filter(function (x) { return x !== pid; })[0];
            A.notify(pid, { title: 'Giliran kamu main: ' + cname, body: 'Partner ' + nm(partner) + ' · lawan ' + nm(opp[0]) + ' & ' + nm(opp[1]) + '. Buka untuk Siap atau Skip.', tag: 'call-' + m.id, m: m.id, at: S.calls[pid].at });
          }
        });
        break;
      case 'go': // Game start
        m = findM(S, d.m, true);
        if (Engine.isWaiting(m)) throw err('INVALID', 'Match ini masih menunggu pemain dari court lain');
        if (!m.go) m.go = now();
        break;
      case 'tally': // hitung skor langsung oleh host
        m = findM(S, d.m, true);
        if (Engine.isWaiting(m)) throw err('INVALID', 'Match ini masih menunggu pemain dari court lain');
        Engine.tally(S, m.id, d.side, !!d.undo);
        break;
      case 'swapX': // tukar dengan pemain di court lain yang belum mulai
        m = findM(S, d.m, true);
        if (!Engine.swapAcross(S, m.id, d.out, findM(S, d.m2, true).id, d['in'])) throw err('STALE', 'Pemain itu sudah mulai bertanding. Data diperbarui');
        break;
      case 'swapTeamX':
        m = findM(S, d.m, true);
        if (!Engine.swapTeamAcross(S, m.id, d.side, findM(S, d.m2, true).id, d.side2)) throw err('STALE', 'Pasangan itu sudah mulai bertanding. Data diperbarui');
        break;
      case 'host': setHosts(S, d.hostId ? [d.hostId] : []); break;
      case 'hosts': setHosts(S, d.hosts || []); break;
      case 'rename': if (d.name) S.name = String(d.name).slice(0, 60); break;
      case 'end':
        Engine.liveMatches(S).forEach(function (x) { Engine.voidMatch(S, x.id); });
        S.status = 'done'; S.endedAt = now();
        if (A.notify) Object.keys(attendees(S)).forEach(function (pid) {
          A.notify(pid, { title: 'Terima kasih sudah bergabung! 🎾', body: 'Sampai jumpa di pertandingan selanjutnya, VAMOS!!! Ketuk untuk lihat podium ' + S.name + ' lalu beri kudos.',
            tag: 'kudos-' + S.id, url: '/?done=' + S.id });
        });
        break;
      case 'reopen': S.status = 'live'; fill(S, P); break;
      default: throw err('INVALID', 'Aksi tidak dikenal: ' + type);
    }
    return info;
  }

  function courtVal(v) { v = Math.round(Number(v)); return v >= 1 && v <= 9 ? v : null; }
  function applySettings(S, d) {
    var keep = {}, pc = Engine.isPC(S);
    (d.courts || []).forEach(function (c) { if (c.id) keep[c.id] = c; });
    S.courts.forEach(function (c) {
      if (keep[c.id]) {
        var k = keep[c.id];
        c.name = k.name || c.name; c.gender = k.gender || 'mix'; c.active = true;
        if (Engine.COURT_COLORS.indexOf(k.color) >= 0) c.color = k.color;
        if (k.hostId !== undefined) c.hostId = k.hostId || null;
        if (pc && k.value != null) c.value = courtVal(k.value) || c.value || null;
      }
      else if (c.active) {
        c.active = false;
        var lm = Engine.courtLive(S, c.id);
        if (lm && d.cancelLive) Engine.voidMatch(S, lm.id);
      }
    });
    var ordered = [];
    (d.courts || []).slice(0, 6).forEach(function (c) {
      if (c.id && S.courts.some(function (x) { return x.id === c.id; })) ordered.push(S.courts.filter(function (x) { return x.id === c.id; })[0]);
      else ordered.push({ id: Engine.uid('c_'), name: c.name || 'Court', gender: c.gender || 'mix', active: true,
        color: Engine.COURT_COLORS.indexOf(c.color) >= 0 ? c.color : 'blue', hostId: c.hostId || null, value: pc ? courtVal(c.value) || ordered.length + 1 : null });
    });
    S.courts = ordered.concat(S.courts.filter(function (c) { return ordered.indexOf(c) < 0; }));
    // Power Cup: format, skor 5 game, klasemen, dan cara mengundi tetap; format lain tidak bisa diubah jadi Power Cup
    if (pc) { setHosts(S, d.hosts || S.hosts || (S.hostId ? [S.hostId] : [])); return; }
    if (d.format && d.format !== 'powercup') S.format = d.format === 'mexicano' ? 'mexicano' : 'americano';
    if (d.sortBy) S.rules.sortBy = d.sortBy;
    if (d.maxStreak) S.rules.maxStreak = Number(d.maxStreak);
    if (d.catchUp != null) S.rules.catchUp = !!d.catchUp;
    if (d.drawMode) S.rules.drawMode = ['round', 'wait'].indexOf(d.drawMode) >= 0 ? d.drawMode : 'rolling';
    if (d.scoring) S.scoring = { type: d.scoring.type, mode: d.scoring.mode, n: Number(d.scoring.n) };
    if (d.deuce) S.rules.deuce = d.deuce === 'adv' ? 'adv' : 'golden';
    setHosts(S, d.hosts || S.hosts || (S.hostId ? [S.hostId] : []));
  }

  /* pintu tunggal: dipakai server Cloudflare (Durable Object) dan mode demo */
  var PUBLIC = { poll: poll, status: status, login: login, createAdmin: createAdmin, photoData: photoData, logout: logout, pushKey: pushKey, pushUnsubscribe: pushUnsubscribe };
  var PRIVATE = {
    me: me, changePin: changePin, updateMe: updateMe, listPeople: listPeople, savePerson: savePersonReq, resetPin: resetPin,
    generatePro: generatePro, listSessions: listSessions, openSession: openSession, deleteSession: deleteSession,
    createSession: createSession, act: act, importPerson: importPerson, importSession: importSession, markMigrated: markMigrated,
    pushSubscribe: pushSubscribe, venueSearch: venueSearch, generateChibi: generateChibi, saveSprite: saveSprite,
    saveTheme: saveTheme, deleteTheme: deleteTheme, kudosForm: kudosForm, giveKudos: giveKudos, myKudos: myKudos, kudosAdmin: kudosAdmin,
    payInfo: payInfo, pastSessions: pastSessions, pastSession: pastSession, pcHand: pcHand
  };
  function call(fn, req) {
    var f = PUBLIC[fn] || PRIVATE[fn];
    if (!f) throw err('INVALID', 'Fungsi tidak dikenal: ' + fn);
    return f(req || {});
  }

  /* mode main di lobi: siapa pemilik token & apakah ia sudah bergabung di lobi yang masih terbuka (dipanggil server mode main) */
  function playCheck(token, sid) {
    var p = null;
    try { p = auth(token); } catch (e) { return { pid: null, ok: false }; }
    var S = loadS(String(sid || ''));
    var ok = !!(S && S.status === 'plan' && S.plan && (S.plan.rsvp || []).some(function (x) { return x.pid === p.id; }));
    return { pid: p.id, ok: ok };
  }

  // pollAs, reminders & playCheck hanya dipanggil server (siaran WebSocket, alarm, mode main), tidak lewat API
  return { init: init, call: call, DEFAULT_PIN: DEFAULT_PIN, apply: apply, rowsFor: rowsFor,
    pollAs: function (member) { return poll({}, !!member); }, reminders: reminders, playCheck: playCheck };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Core;
