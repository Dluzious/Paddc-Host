// Uji Core: rencana sesi, hadir, chat, mulai, kembali ke lobi, pengingat
const Core = require('../../core.js');
const crypto = require('crypto');
let clock = Date.UTC(2026, 9, 20, 3, 0, 0);
const store = { people: [], sessions: {}, props: {}, cache: {} }, sent = [];
const A = {
  now: () => clock, uuid: (p) => (p || '') + crypto.randomUUID().replace(/-/g, ''), hash: (x) => crypto.createHash('sha256').update(x).digest('hex'),
  people: () => JSON.parse(JSON.stringify(store.people)), savePerson: (p) => { const i = store.people.findIndex((x) => x.id === p.id); if (i >= 0) store.people[i] = p; else store.people.push(p); },
  session: (id) => store.sessions[id] ? JSON.parse(JSON.stringify(store.sessions[id])) : null,
  saveSession: (S) => { store.sessions[S.id] = JSON.parse(JSON.stringify(S)); },
  sessions: () => Object.values(store.sessions).map((S) => ({ id: S.id, name: S.name, status: S.status })),
  deleteSession: (id) => { delete store.sessions[id]; },
  prop: (k) => store.props[k] == null ? null : store.props[k], setProp: (k, v) => { store.props[k] = v; }, delProp: (k) => { delete store.props[k]; },
  cacheGet: () => null, cachePut: () => {}, lock: (f) => f(), photoUrl: (id) => '/photo/' + id, aiEnabled: () => false,
  notify: (pid, payload) => sent.push({ pid, payload }), geocode: (q) => Promise.resolve([{ name: q, address: 'Jl. Uji', lat: -7.3, lng: 108.2, maps: 'https://www.google.com/maps/search/?api=1&query=-7.3%2C108.2' }])
};
Core.init(A);
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ GAGAL: ') + m); if (!c) process.exitCode = 1; };
const call = (fn, req) => Core.call(fn, req);
const adm = call('createAdmin', { name: 'Lulu', gender: 'P', username: 'lulu', pin: '9876' }).token;
const host = call('savePerson', { token: adm, person: { name: 'Rudi', gender: 'L', role: 'host' } });
const pl = ['Andi', 'Budi', 'Citra', 'Dewi', 'Eko', 'Fajar'].map((n, i) => call('savePerson', { token: adm, person: { name: n, gender: i % 2 ? 'P' : 'L' } }));
const login = (u) => call('login', { username: u, pin: '123456' }).token;
const tPl = login(pl[0].username), tHost = login(host.username), tOther = login(pl[1].username);
const when = clock + 30 * 3600000;
const r = call('createSession', { token: tHost, setup: { name: 'Selasa Malam', format: 'americano', teamMode: 'random', courts: [{ name: 'C1' }, { name: 'C2' }], playerIds: [pl[2].id],
  plan: { when, whenText: 'Rabu, 21 Oktober 2026 · 19.00 WIB', venue: { name: 'Padel Doc Arena', address: 'Tasik', maps: 'https://maps.app.goo.gl/x' }, theme: 'beach' } } });
const sid = r.sid;
ok(r.S.status === 'plan' && r.plan && r.plan.rsvp.length === 1, 'rencana dibuat: status plan, pemain pilihan host langsung hadir');
ok(store.props.ACTIVE_SID === undefined, 'rencana tidak langsung jadi sesi aktif');
ok(sent.filter((x) => x.payload.tag === 'plan-' + sid).length === 7 && !sent.some((x) => x.pid === host.id), 'notifikasi sesi baru ke semua kecuali pembuat: ' + sent.length);
ok(sent[0].payload.url === '/?lobby=' + sid && sent[0].payload.join, 'notifikasi membawa link lobi + tombol ikut');
call('act', { token: tPl, sid, type: 'rsvp', payload: { on: true } });
call('act', { token: tOther, sid, type: 'rsvp', payload: { on: true, pid: pl[5].id } }); // pemain tidak bisa mendaftarkan orang lain: pid dipaksa diri sendiri
let v = call('poll', {}).plans[0];
ok(v.rsvp.some((x) => x.pid === pl[0].id) && v.rsvp.some((x) => x.pid === pl[1].id) && !v.rsvp.some((x) => x.pid === pl[5].id), 'pemain hadir sendiri; tidak bisa mendaftarkan orang lain');
call('act', { token: tPl, sid, type: 'chat', payload: { text: '  Halo   semua  ' } });
ok(call('poll', {}).plans[0].chat === undefined && call('poll', {}).plans[0].chatN === 1, 'publik: chat tidak terlihat, hanya jumlah');
ok(call('poll', { token: tOther }).plans[0].chat[0].text === 'Halo semua', 'anggota: chat terlihat dan dirapikan');
ok(Core.pollAs(true).plans[0].chat.length === 1 && !Core.pollAs(false).plans[0].chat, 'siaran WebSocket: anggota dengan chat, publik tanpa');
ok(!call('poll', {}).S || !JSON.stringify(call('poll', {})).includes('Halo semua'), 'chat tidak bocor di data sesi publik');
let e = null; try { call('act', { token: tPl, sid, type: 'theme', payload: { theme: 'court' } }); } catch (x) { e = x.message; }
ok(/FORBIDDEN/.test(e), 'pemain tidak bisa ganti tema');
call('act', { token: tHost, sid, type: 'theme', payload: { theme: 'court' } });
e = null; try { call('act', { token: tHost, sid, type: 'startPlan' }); } catch (x) { e = x.message; }
ok(/minimal 4/.test(e), 'Mulai Sesi ditolak bila pemain < 4: ' + e);
call('act', { token: tHost, sid, type: 'rsvp', payload: { pid: pl[3].id, on: true } });
call('act', { token: tHost, sid, type: 'rsvp', payload: { pid: host.id, on: true } });
e = null; try { call('act', { token: tHost, sid, type: 'fill' }); } catch (x) { e = x.message; }
ok(/ruang tunggu/.test(e), 'aksi sesi berjalan ditolak selama di lobi');
const st = call('act', { token: tHost, sid, type: 'startPlan' });
ok(st.S.status === 'live' && store.props.ACTIVE_SID === sid && st.S.matches.filter((m) => m.status === 'live').length === 1, 'Mulai Sesi: sesi aktif, court terisi');
ok(Object.keys(st.S.parts).length === 4 && st.S.hosts.includes(host.id) && !st.S.parts[host.id], 'host hadir jadi host, bukan pemain');
ok(!call('poll', {}).plans.length, 'rencana hilang dari daftar setelah mulai');
const back = call('act', { token: tHost, sid, type: 'backToLobby' });
ok(back.S.status === 'plan' && !store.props.ACTIVE_SID && back.plan.rsvp.length === 5 && back.plan.chatN === 1, 'Kembali ke Lobi: daftar hadir & chat tetap');
call('act', { token: tHost, sid, type: 'startPlan' });
const m = store.sessions[sid].matches[0];
call('act', { token: tHost, sid, type: 'go', payload: { m: m.id } });
e = null; try { call('act', { token: tHost, sid, type: 'backToLobby' }); } catch (x) { e = x.message; }
ok(/sudah ada match/i.test(e), 'Kembali ke Lobi ditolak setelah ada match dimulai');
// pengingat
const r2 = call('createSession', { token: tHost, setup: { name: 'Jumat', courts: [{ name: 'C1' }], playerIds: [pl[0].id, pl[1].id], plan: { when: clock + 20 * 3600000, whenText: 'Jumat 23.00', venue: { name: 'Arena', maps: 'https://maps.app.goo.gl/y' } } } });
sent.length = 0;
let next = Core.reminders(clock);
ok(next === clock + 8 * 3600000, 'pengingat berikutnya 12 jam sebelum main');
clock = next + 60000; next = Core.reminders(clock);
ok(sent.length === 2 && /12 jam lagi main: Jumat/.test(sent[0].payload.title) && sent[0].payload.maps, 'pengingat 12 jam ke yang hadir, dengan link Maps: ' + (sent[0] || {}).payload?.title);
ok(next === clock - 60000 + 9 * 3600000, 'berikutnya pengingat 3 jam');
clock = next + 1000; sent.length = 0; Core.reminders(clock);
ok(sent.length === 2 && /3 jam lagi/.test(sent[0].payload.title), 'pengingat 3 jam terkirim');
sent.length = 0; Core.reminders(clock + 60000);
ok(sent.length === 0, 'tidak terkirim dua kali');
const r3 = call('createSession', { token: tHost, setup: { name: 'Mendadak', courts: [{ name: 'C1' }], playerIds: [pl[0].id], plan: { when: clock + 5 * 3600000, whenText: 'x' } } });
sent.length = 0; Core.reminders(clock + 1000);
ok(!sent.some((x) => /Mendadak/.test(x.payload.title)), 'rencana dibuat 5 jam sebelum: pengingat 12 jam dilewati');
call('act', { token: tHost, sid: r3.sid, type: 'editPlan', payload: { name: 'Mendadak', when: clock + 30 * 3600000, whenText: 'baru', venue: { maps: 'javascript:alert(1)' } } });
ok(store.sessions[r3.sid].plan.venue.maps === '' && store.sessions[r3.sid].plan.whenText === 'baru', 'ubah rencana: link Maps tidak sah ditolak');
call('venueSearch', { token: tHost, q: 'Padel Doc' }).then((list) => ok(list[0].maps.startsWith('https://'), 'cari venue lewat adaptor'));
