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
const H = 3600000, when = clock + 10 * H, until = when + 3 * H;
const r = call('createSession', { token: tHost, setup: { name: 'Booking 3 Jam', format: 'americano', courts: [{ name: 'C1' }, { name: 'C2' }], playerIds: [],
  plan: { when, until, whenText: 'x', venue: {}, theme: 'court' } } });
const sid = r.sid, act = (tok, type, payload) => call('act', { token: tok, sid, type, payload });
const plan = () => call('poll', {}).plans.find((p) => p.id === sid);

console.log('• rencana dengan jam selesai & jam hadir');
ok(plan().until === until, 'jam selesai booking tersimpan');
ok(/di dalam jam booking/.test(fails(() => act(t[0], 'rsvp', { on: true, from: when - H, to: when })) || ''), 'jam hadir di luar booking ditolak');
for (let i = 0; i < 5; i++) act(t[i], 'rsvp', { on: true });                                   // 5 full
act(t[5], 'rsvp', { on: true, from: when, to: when + H });                                      // 1 jam pertama
act(t[6], 'rsvp', { on: true, from: when + H, to: when + 3 * H });                              // 2 jam terakhir
act(t[7], 'rsvp', { on: true, from: when + 2 * H, to: when + 3 * H });                          // 1 jam terakhir
act(t[0], 'rsvp', { on: true, from: when, to: until });                                         // sama dengan full
const rs = plan().rsvp;
ok(!rs.find((x) => x.pid === pl[0].id).from && rs.find((x) => x.pid === pl[6].id).from === when + H, 'pilihan jam tersimpan; full = tanpa jam');
act(tHost, 'rsvp', { pid: host.id, on: true });
ok(!plan().rsvp.find((x) => x.pid === host.id).from, 'host selalu full');

console.log('• mulai & masuk/keluar otomatis');
clock = when - 2 * 60000;
let S = act(tHost, 'startPlan', {}).S;
const P = (i) => S.parts[pl[i].id];
ok(P(5).active && !P(5).paused && P(6).paused && P(6).timeOff === 'wait' && P(7).paused, 'mulai: jam pertama main, jam berikutnya dijeda (menunggu jamnya)');
ok(S.matches.filter((m) => m.status === 'live').every((m) => !m.A.concat(m.B).some((x) => x === pl[6].id || x === pl[7].id)), 'pemain jam berikutnya tidak diundi');
ok(S.avail[pl[6].id].st === 'wait' && S.avail[pl[5].id].st === 'in', 'status jam tersimpan di sesi');
let next = Core.reminders(clock);
ok(next === when + H - 10 * 60000 || next === when + H - 5 * 60000, 'alarm berikutnya di batas jam terdekat: ' + new Date(next).toISOString());
clock = when + H - 11 * 60000; Core.reminders(clock); S = call('poll', {}).S;
ok(S.parts[pl[5].id].active && S.parts[pl[6].id].paused, 'sebelum batas: belum ada perubahan');
sent.length = 0;
clock = when + H - 9 * 60000; Core.reminders(clock); S = call('poll', {}).S;
ok(!S.parts[pl[5].id].active && S.parts[pl[5].id].timeOff === 'done', '10 menit sebelum jamnya habis: Fajar berhenti diundi');
ok(sent.some((x) => x.pid === pl[5].id && /selesai/.test(x.payload.title)), 'Fajar diberi tahu jam mainnya selesai');
clock = when + H - 4 * 60000; Core.reminders(clock); S = call('poll', {}).S;
ok(S.parts[pl[6].id].active && !S.parts[pl[6].id].paused && !S.parts[pl[6].id].timeOff, '5 menit sebelum jamnya: Gita masuk antrean');
ok(sent.some((x) => x.pid === pl[6].id && /Waktunya main/.test(x.payload.title)), 'Gita diberi tahu waktunya main');
ok(S.parts[pl[7].id].paused, 'Hana (jam terakhir) masih menunggu');
act(t[7], 'ready', {}); S = call('poll', {}).S;
ok(!S.parts[pl[7].id].paused && S.avail[pl[7].id].st === 'in', 'Hana datang lebih awal: tekan Siap main → ikut diundi');
sent.length = 0; clock = when + 2 * H - 4 * 60000; Core.reminders(clock);
ok(!sent.some((x) => x.pid === pl[7].id && /Waktunya/.test(x.payload.title)), 'tidak ada notifikasi dobel untuk yang sudah siap');
clock = until - 9 * 60000; Core.reminders(clock); S = call('poll', {}).S;
ok(!S.parts[pl[6].id].active && !S.parts[pl[7].id].active && S.parts[pl[0].id].active, 'akhir booking: pemain sebagian berhenti, pemain full tetap');
act(t[6], 'ready', {}); S = call('poll', {}).S;
ok(S.parts[pl[6].id].active && !S.parts[pl[6].id].timeOff, 'jam habis tapi mau lanjut: Siap main → ikut lagi');
ok(call('payInfo', { token: tHost, sid }).list.length === 8, 'semua pemain (termasuk sebagian) ada di daftar bayar');

console.log('• mulai terlalu awal');
const r2 = call('createSession', { token: tHost, setup: { name: 'Awal', format: 'americano', courts: [{ name: 'C1' }], playerIds: [],
  plan: { when: clock + 5 * H, until: clock + 7 * H, whenText: 'x', venue: {}, theme: 'court' } } });
[1, 2, 3].forEach((i) => call('act', { token: t[i], sid: r2.sid, type: 'rsvp', payload: { on: true } }));
call('act', { token: t[4], sid: r2.sid, type: 'rsvp', payload: { on: true, from: clock + 6 * H, to: clock + 7 * H } });
ok(/minimal 4 pemain yang jam hadirnya sudah mulai/.test(fails(() => call('act', { token: tHost, sid: r2.sid, type: 'startPlan', payload: {} })) || ''), 'mulai ditolak bila pemain yang jamnya sudah mulai < 4');
call('act', { token: tHost, sid: r2.sid, type: 'editPlan', payload: { name: 'Awal', when: clock + 5 * H, until: clock + 8 * H, whenText: 'x', venue: {}, theme: 'court' } });
ok(!call('poll', {}).plans.find((p) => p.id === r2.sid).rsvp.some((x) => x.from), 'jadwal diubah: jam hadir sebagian kembali ke full');
