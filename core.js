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
    return { id: p.id, name: p.name, gender: p.gender, role: p.role, archived: !!p.archived, photoUrl: fid ? A.photoUrl(fid) : '', fid: fid };
  }
  function fullPerson(p) {
    var o = publicPerson(p);
    o.username = p.username; o.hijab = !!p.hijab; o.photoPref = p.photoPref || 'pro';
    o.photoId = p.photoId || ''; o.proId = p.proId || '';
    o.asliUrl = p.photoId ? A.photoUrl(p.photoId) : ''; o.proUrl = p.proId ? A.photoUrl(p.proId) : '';
    o.aiStatus = p.aiStatus || (p.proId ? 'done' : 'none'); o.aiNote = p.aiNote || ''; o.pinDefault = !!p.pinDefault;
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
    return { hasAdmin: hasAdmin, needCode: !hasAdmin && !!A.prop('APP_PIN'), ai: A.aiEnabled(), version: '2.3', migrated: !!A.prop('MIGRATED_AT') };
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
    return o;
  }

  /* dashboard publik: tanpa login. Dipanggil berkala oleh semua perangkat. */
  function poll(r) {
    r = r || {};
    var sid = A.prop('ACTIVE_SID') || '';
    var out = { now: now(), sid: sid, pv: peopleVersion() };
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
      Engine.fillCourts(S, P);
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

  var SELF_ACTIONS = { skip: 1, ready: 1, leave: 1 };
  function act(r) {
    var actor = auth(r.token);
    var type = r.type, d = r.payload || {};
    var staff = actor.role === 'admin' || actor.role === 'host';
    if (!staff && !SELF_ACTIONS[type]) throw err('FORBIDDEN', 'Aksi ini khusus admin atau host');
    if (!staff) d.pid = actor.id;
    return A.lock(function () {
      var S = loadS(r.sid || A.prop('ACTIVE_SID'));
      if (!S) throw err('NOT_FOUND', 'Sesi tidak ditemukan');
      var P = playersMap();
      var info = apply(S, P, type, d, actor);
      saveS(S, P);
      return { sid: S.id, v: S.v, S: publicS(S), info: info || null };
    });
  }

  function findM(S, id, needLive) {
    var m = Engine.findMatch(S, id);
    if (!m) throw err('STALE', 'Match sudah berubah. Data diperbarui');
    if (needLive && m.status !== 'live') throw err('STALE', 'Match sudah selesai atau dibatalkan');
    return m;
  }
  function fill(S, P) { if (S.status === 'live') Engine.fillCourts(S, P); }

  function apply(S, P, type, d, actor) {
    S.calls = S.calls || {}; S.lastDone = S.lastDone || {};
    var m, info = null;
    switch (type) {
      case 'fill': if (S.status === 'live') Engine.fillCourts(S, P, null, !!d.force); break;
      case 'score':
        m = findM(S, d.m);
        var wasLive = m.status === 'live';
        Engine.submitScore(S, m.id, Number(d.a), Number(d.b));
        if (wasLive) { S.lastDone[m.court] = { m: m.id, at: now() }; fill(S, P); }
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
        S.parts[d.pid].paused = false;
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
        S.status = 'done';
        break;
      case 'reopen': S.status = 'live'; fill(S, P); break;
      default: throw err('INVALID', 'Aksi tidak dikenal: ' + type);
    }
    return info;
  }

  function applySettings(S, d) {
    var keep = {};
    (d.courts || []).forEach(function (c) { if (c.id) keep[c.id] = c; });
    S.courts.forEach(function (c) {
      if (keep[c.id]) {
        var k = keep[c.id];
        c.name = k.name || c.name; c.gender = k.gender || 'mix'; c.active = true;
        if (Engine.COURT_COLORS.indexOf(k.color) >= 0) c.color = k.color;
        if (k.hostId !== undefined) c.hostId = k.hostId || null;
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
        color: Engine.COURT_COLORS.indexOf(c.color) >= 0 ? c.color : 'blue', hostId: c.hostId || null });
    });
    S.courts = ordered.concat(S.courts.filter(function (c) { return ordered.indexOf(c) < 0; }));
    if (d.format) S.format = d.format;
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
    pushSubscribe: pushSubscribe
  };
  function call(fn, req) {
    var f = PUBLIC[fn] || PRIVATE[fn];
    if (!f) throw err('INVALID', 'Fungsi tidak dikenal: ' + fn);
    return f(req || {});
  }

  return { init: init, call: call, DEFAULT_PIN: DEFAULT_PIN, apply: apply, rowsFor: rowsFor };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Core;
