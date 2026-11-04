// Uji Core Tahap 4/5: tema admin, pasangan tetap saat mulai, kudos
const Core = require('../../core.js');
const crypto = require('crypto');
let clock = Date.UTC(2026, 9, 20, 3, 0, 0);
const store = { people: [], sessions: {}, props: {}, photos: {}, kudos: [] }, sent = [];
const A = {
  now: () => clock, uuid: (p) => (p || '') + crypto.randomUUID().replace(/-/g, ''), hash: (x) => crypto.createHash('sha256').update(x).digest('hex'),
  people: () => JSON.parse(JSON.stringify(store.people)), savePerson: (p) => { const i = store.people.findIndex((x) => x.id === p.id); if (i >= 0) store.people[i] = p; else store.people.push(p); },
  session: (id) => store.sessions[id] ? JSON.parse(JSON.stringify(store.sessions[id])) : null,
  saveSession: (S) => { store.sessions[S.id] = JSON.parse(JSON.stringify(S)); },
  sessions: () => Object.values(store.sessions).map((S) => ({ id: S.id, name: S.name, status: S.status })),
  deleteSession: (id) => { delete store.sessions[id]; },
  prop: (k) => store.props[k] == null ? null : store.props[k], setProp: (k, v) => { store.props[k] = v; }, delProp: (k) => { delete store.props[k]; },
  cacheGet: () => null, cachePut: () => {}, lock: (f) => f(), aiEnabled: () => false,
  savePhoto: (d) => { const id = 'ph' + Object.keys(store.photos).length; store.photos[id] = d; return id; }, trash: (id) => { delete store.photos[id]; },
  photoUrl: (id) => '/photo/' + id, notify: (pid, payload) => sent.push({ pid, payload }),
  saveKudos: (sid, giver, rows, at) => { store.kudos = store.kudos.filter((k) => !(k.sid === sid && k.giver === giver)).concat(rows.map((r) => ({ sid, giver, target: r.target, k: r.k, at }))); },
  kudosBy: (sid, giver) => store.kudos.filter((k) => k.sid === sid && k.giver === giver),
  kudosFor: (t) => store.kudos.filter((k) => k.target === t), kudosAll: () => store.kudos.slice()
};
Core.init(A);
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ GAGAL: ') + m); if (!c) process.exitCode = 1; };
const call = (fn, req) => Core.call(fn, req);
const fails = (f) => { try { f(); return null; } catch (e) { return e.message; } };
const adm = call('createAdmin', { name: 'Lulu', gender: 'P', username: 'lulu', pin: '9876' }).token;
const host = call('savePerson', { token: adm, person: { name: 'Rudi', gender: 'L', role: 'host' } });
const pl = ['Andi', 'Budi', 'Citra', 'Dewi', 'Eko', 'Fajar', 'Gita', 'Hana'].map((n, i) => call('savePerson', { token: adm, person: { name: n, gender: i % 2 ? 'P' : 'L' } }));
const login = (u) => call('login', { username: u, pin: '123456' }).token;
const tHost = login(host.username), t = pl.map((p) => login(p.username));
const IMG = 'data:image/jpeg;base64,' + 'B'.repeat(500);
const when = clock + 30 * 3600000;
const r = call('createSession', { token: tHost, setup: { name: 'Rabu Malam', format: 'americano', teamMode: 'random', courts: [{ name: 'C1' }, { name: 'C2' }], playerIds: pl.map((p) => p.id),
  plan: { when, whenText: 'x', venue: { name: 'Arena' }, theme: 'court' } } });
const sid = r.sid;
const act = (tok, type, payload) => call('act', { token: tok, sid, type, payload });

console.log('• host sesi dari pemain');
ok(/FORBIDDEN/.test(fails(() => act(t[1], 'cohost', { pid: pl[0].id }))), 'pemain tidak bisa menunjuk host sesi');
ok(/akun pemain/.test(fails(() => act(tHost, 'cohost', { pid: host.id }))), 'host/admin tidak perlu ditunjuk (hanya akun pemain)');
act(tHost, 'cohost', { pid: pl[0].id });
ok(sent.some((x) => x.pid === pl[0].id && x.payload.tag === 'cohost-' + sid), 'pemain yang ditunjuk mendapat notifikasi');
ok(call('poll', {}).plans[0].cohosts[0] === pl[0].id, 'daftar host sesi terlihat di lobi');
act(t[0], 'rsvp', { pid: host.id, on: true });
ok(call('poll', {}).plans[0].rsvp.some((x) => x.pid === host.id), 'host sesi bisa menambah yang hadir di lobi');
ok(/FORBIDDEN/.test(fails(() => act(t[0], 'theme', { theme: 'beach' }))) && /FORBIDDEN/.test(fails(() => act(t[0], 'startPlan', {}))), 'host sesi tidak bisa ganti tema / mulai sesi');
let S = act(tHost, 'startPlan', {}).S;
const m1 = S.matches.find((m) => m.status === 'live');
act(t[0], 'go', { m: m1.id });
S = act(t[0], 'score', { m: m1.id, a: 15, b: 6 }).S;
ok(S.matches.find((m) => m.id === m1.id).status === 'done', 'host sesi bisa Game start & memasukkan skor');
act(t[0], 'kick', { pid: pl[7].id });
ok(!call('poll', {}).S.parts[pl[7].id].active, 'host sesi bisa mengeluarkan pemain lain');
act(t[0], 'join', { pid: pl[7].id });
ok(/FORBIDDEN/.test(fails(() => act(t[0], 'end', {}))) && /FORBIDDEN/.test(fails(() => act(t[0], 'settings', { courts: [] }))) && /FORBIDDEN/.test(fails(() => act(t[0], 'hosts', { hosts: [] }))),
  'host sesi tidak bisa mengakhiri sesi, mengatur court, atau mengganti host');
ok(/FORBIDDEN/.test(fails(() => act(t[1], 'score', { m: m1.id, a: 10, b: 11 }))), 'pemain biasa tetap tidak bisa memasukkan skor');
ok(/FORBIDDEN/.test(fails(() => call('listPeople', { token: t[0] }))), 'host sesi tidak mendapat akses database');
const r2 = call('createSession', { token: tHost, setup: { name: 'Lain', format: 'americano', courts: [{ name: 'C1' }], playerIds: pl.slice(0, 4).map((p) => p.id), plan: { when, whenText: 'x', venue: {}, theme: 'court' } } });
ok(/FORBIDDEN/.test(fails(() => call('act', { token: t[0], sid: r2.sid, type: 'rsvp', payload: { pid: pl[5].id, on: true } }))) || !call('poll', {}).plans.find((p) => p.id === r2.sid).rsvp.some((x) => x.pid === pl[5].id && x.pid !== pl[0].id),
  'hak host sesi hanya untuk sesi itu');

console.log('• pembayaran');
ok(/FORBIDDEN/.test(fails(() => act(t[1], 'payCollector', { pid: pl[1].id }))) && /FORBIDDEN/.test(fails(() => act(t[0], 'payCollector', { pid: pl[1].id }))), 'pemain & host sesi tidak bisa menentukan collector');
act(tHost, 'payCollector', { pid: pl[2].id, amount: 75000 });
ok(sent.some((x) => x.pid === pl[2].id && x.payload.tag === 'paycol-' + sid), 'collector diberi tahu');
ok(/FORBIDDEN/.test(fails(() => act(t[1], 'payBank', { holder: 'X', bank: 'BCA', number: '1234567' }))), 'pemain lain tidak bisa mengisi rekening');
ok(/nomor rekening/.test(fails(() => act(t[2], 'payBank', { holder: 'Citra', bank: 'BCA', number: '12' }))), 'nomor rekening terlalu pendek ditolak');
act(t[2], 'payBank', { holder: ' Citra  Lestari ', bank: 'BCA', number: '123-456 7890' });
let pub = call('poll', {}).S;
ok(pub.pay.collector === pl[2].id && pub.pay.amount === 75000 && pub.pay.hasBank && !pub.pay.bank && !JSON.stringify(pub).includes('7890'), 'data publik: collector & nominal tanpa nomor rekening');
let info = call('payInfo', { token: t[1], sid });
ok(info.bank.number === '123-456 7890' && info.bank.holder === 'Citra Lestari' && !info.canManage && info.isPayer, 'pemain yang ikut melihat rekening lengkap');
const outsider = call('savePerson', { token: adm, person: { name: 'Tamu', gender: 'L' } });
ok(/FORBIDDEN/.test(fails(() => call('payInfo', { token: login(outsider.username), sid }))), 'yang tidak ikut sesi tidak bisa melihat rekening');
ok(/tidak valid/.test(fails(() => act(t[1], 'payProof', { data: 'data:text/plain;base64,AAAA' }))), 'bukti bayar harus gambar');
act(t[1], 'payProof', { data: IMG });
ok(call('poll', {}).S.pay.paid[pl[1].id] === 'proof', 'unggah bukti langsung jadi hijau');
ok(sent.some((x) => x.pid === pl[2].id && /Bukti bayar: Budi/.test(x.payload.title)), 'collector mendapat notifikasi bukti bayar');
info = call('payInfo', { token: t[3], sid });
ok(!info.list.find((x) => x.pid === pl[1].id).proofUrl && info.list.find((x) => x.pid === pl[1].id).paid, 'pemain lain melihat status hijau, bukan foto buktinya');
info = call('payInfo', { token: t[2], sid });
ok(info.canManage && info.isCollector && info.list.find((x) => x.pid === pl[1].id).proofUrl, 'collector melihat foto bukti');
ok(/FORBIDDEN/.test(fails(() => act(t[3], 'payMark', { pid: pl[1].id, paid: false }))), 'pemain lain tidak bisa membatalkan');
act(t[2], 'payMark', { pid: pl[1].id, paid: false, note: 'Belum masuk' });
info = call('payInfo', { token: t[1], sid });
const me1 = info.list.find((x) => x.pid === pl[1].id);
ok(!me1.paid && me1.rejected && me1.note === 'Belum masuk' && me1.proofUrl, 'collector membatalkan: merah lagi dengan alasan, bukti tetap tersimpan');
ok(sent.some((x) => x.pid === pl[1].id && x.payload.title === 'Pembayaran belum diterima'), 'pemain diberi tahu pembatalan');
act(t[2], 'payMark', { pid: pl[4].id, paid: true });
ok(call('poll', {}).S.pay.paid[pl[4].id] === 'ok', 'collector menandai bayar tunai (tanpa bukti)');
act(t[1], 'payProof', { data: IMG });
ok(Object.keys(store.photos).length === 1, 'bukti lama diganti, tidak menumpuk');

console.log('• koreksi skor');
const outM = pl.find((p) => !m1.A.concat(m1.B).includes(p.id) && p.id !== pl[0].id);   // bukan host sesi (pl[0])
ok(/hanya untuk pemain di match/.test(fails(() => act(t[pl.indexOf(outM)], 'dispute', { m: m1.id, a: 10, b: 11 })) || ''), 'pemain yang tidak main tidak bisa protes');
const inM = pl.find((p) => m1.A.concat(m1.B).includes(p.id)), tIn = t[pl.indexOf(inM)];
ok(/Jumlah skor/.test(fails(() => act(tIn, 'dispute', { m: m1.id, a: 10, b: 10 }))), 'skor usulan mengikuti aturan skor sesi');
const dr = act(tIn, 'dispute', { m: m1.id, a: 11, b: 10, note: 'harusnya 11-10' });
ok(dr.info.dispute && sent.some((x) => x.payload.tag === 'dispute-' + dr.info.dispute && x.pid === host.id), 'protes diteruskan ke host (dan admin)');
ok(sent.some((x) => x.payload.tag === 'dispute-' + dr.info.dispute && x.pid === store.people.find((p) => p.role === 'admin').id), 'admin juga diberi tahu');
ok(/sedang direview/.test(fails(() => act(tIn, 'dispute', { m: m1.id, a: 12, b: 9 }))), 'satu protes terbuka per match');
ok(/FORBIDDEN/.test(fails(() => act(t[pl.indexOf(outM)], 'disputeDone', { id: dr.info.dispute, ok: true }))), 'pemain biasa tidak bisa menyetujui');
S = act(tHost, 'disputeDone', { id: dr.info.dispute, ok: true, reply: 'Sudah dicek' }).S;
const fixedM = S.matches.find((m) => m.id === m1.id);
ok(fixedM.sA === 11 && fixedM.sB === 10 && S.disputes[0].st === 'fixed', 'host menyetujui: skor diperbaiki, klasemen ikut berubah');
ok(sent.some((x) => x.pid === inM.id && /diperbaiki/.test(x.payload.title)), 'pemain diberi tahu hasil review');
const d2 = act(tIn, 'dispute', { m: m1.id, a: 15, b: 6 });
act(t[0], 'disputeDone', { id: d2.info.dispute, ok: false, reply: 'Skor sudah benar' });
ok(call('poll', {}).S.disputes[1].st === 'rejected', 'host sesi (pemain) bisa menolak koreksi');

console.log('• riwayat sesi');
act(tHost, 'end', {});
const past = call('pastSessions', { token: t[5] });
ok(past.length === 1 && past[0].mine && past[0].matches >= 1 && past[0].top.length === 3 && past[0].venue.name === 'Arena', 'pemain melihat daftar sesi selesai + podium');
ok(!call('pastSessions', { token: login(outsider.username) })[0].mine, 'penanda "kamu ikut" sesuai orangnya');
const ps = call('pastSession', { token: t[5], sid });
ok(ps.S.matches.length >= 1 && !JSON.stringify(ps.S).includes('7890'), 'detail sesi: match lengkap, tanpa nomor rekening');
ok(/AUTH_REQUIRED/.test(fails(() => call('pastSessions', {}))), 'riwayat butuh login');
act(t[1], 'payProof', { data: IMG });
ok(call('payInfo', { token: t[2], sid }).list.find((x) => x.pid === pl[1].id).paid, 'bayar tetap bisa setelah sesi selesai');
