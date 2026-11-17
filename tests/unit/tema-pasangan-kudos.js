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
const tHost = login(host.username), t0 = login(pl[0].username), t1 = login(pl[1].username), t7 = login(pl[7].username);
const IMG = 'data:image/jpeg;base64,' + 'A'.repeat(400);
const fl = { tl: [300, 200], tr: [900, 200], br: [1100, 700], bl: [100, 700] };

console.log('• tema');
ok(/FORBIDDEN/.test(fails(() => call('saveTheme', { token: tHost, theme: { name: 'X' } }))), 'host tidak bisa mengubah tema (hanya admin)');
ok(/minimal satu gambar/.test(fails(() => call('saveTheme', { token: adm, theme: { name: 'Kosong' } }))), 'tema baru tanpa gambar ditolak');
ok(/4 sudut/.test(fails(() => call('saveTheme', { token: adm, theme: { name: 'Rusak', land: { data: IMG, size: [1200, 800], floor: { tl: [1, 1] } } } }))), 'sudut lantai tidak lengkap ditolak');
let list = call('saveTheme', { token: adm, theme: { name: 'Agustusan', land: { data: IMG, size: [1200, 800], floor: fl, host: [0.5, 1.1] }, port: { data: IMG, size: [1080, 1920], floor: fl } } });
const ev = list.find((t) => t.name === 'Agustusan');
ok(ev && /^t_[0-9a-f]{8}$/.test(ev.id) && ev.land.url.startsWith('/photo/') && ev.port.size[1] === 1920 && ev.land.host[1] === 1.1, 'tema event tersimpan dengan gambar lebar + tegak');
ok(Object.keys(store.photos).length === 2, '2 gambar tersimpan');
ok(call('poll', {}).themes.length === 1, 'daftar tema ikut di poll (publik)');
list = call('saveTheme', { token: adm, theme: { id: ev.id, name: 'Agustusan 2026', land: { size: [1200, 800], floor: Object.assign({}, fl, { tl: [320, 210] }) } } });
const ev2 = list.find((t) => t.id === ev.id);
ok(ev2.name === 'Agustusan 2026' && ev2.land.url === ev.land.url && ev2.land.floor.tl[0] === 320 && ev2.port, 'ubah kalibrasi tanpa unggah ulang: gambar lama tetap');
list = call('saveTheme', { token: adm, theme: { id: ev.id, name: 'Agustusan 2026', port: null } });
ok(!list.find((t) => t.id === ev.id).port && Object.keys(store.photos).length === 1, 'hapus gambar HP: berkasnya ikut dihapus');
list = call('saveTheme', { token: adm, theme: { id: 'beach', name: '', hidden: true } });
ok(list.find((t) => t.id === 'beach').builtin && list.find((t) => t.id === 'beach').hidden, 'tema bawaan bisa disembunyikan tanpa gambar');
list = call('saveTheme', { token: adm, theme: { id: 'court', name: '', port: { data: IMG, size: [1080, 1920], floor: fl } } });
ok(list.find((t) => t.id === 'court').port && !list.find((t) => t.id === 'court').land, 'tema bawaan: tambah gambar HP tegak saja');
list = call('deleteTheme', { token: adm, id: 'court' });
ok(!list.find((t) => t.id === 'court'), 'kembalikan tema bawaan');
list = call('deleteTheme', { token: adm, id: ev.id });
ok(!list.find((t) => t.id === ev.id) && Object.keys(store.photos).length === 0, 'hapus tema event: semua gambarnya terhapus');

console.log('• pasangan tetap saat Mulai Sesi');
const when = clock + 30 * 3600000;
const mk = (teams) => {
  const r = call('createSession', { token: tHost, setup: { name: 'Pasangan', format: 'americano', teamMode: 'fixed', courts: [{ name: 'C1' }, { name: 'C2' }], playerIds: pl.map((p) => p.id), teams: teams || [],
    plan: { when, whenText: 'x', venue: {}, theme: 'court' } } });
  return r.sid;
};
let sid = mk([{ a: pl[0].id, b: pl[1].id }]);
ok(call('poll', { token: tHost }).plans.find((p) => p.id === sid).teams.length === 1, 'pasangan dari rencana terlihat di lobi (untuk diisi ulang)');
let S = call('act', { token: tHost, sid, type: 'startPlan', payload: { teams: [{ a: pl[0].id, b: pl[2].id }, { a: pl[1].id, b: pl[3].id }], pairRest: false } }).S;
ok(S.teams.length === 2 && S.teams[0].a === pl[0].id && S.teams[0].b === pl[2].id, 'manual tanpa sisa: hanya tim yang diatur host');
call('act', { token: tHost, sid, type: 'end' });
sid = mk();
S = call('act', { token: tHost, sid, type: 'startPlan', payload: { teams: [{ a: pl[0].id, b: pl[2].id }, { a: pl[0].id, b: pl[4].id }, { a: pl[5].id, b: 'orang-luar' }], pairRest: true } }).S;
const used = S.teams.flatMap((t) => [t.a, t.b]);
ok(S.teams.length === 4 && new Set(used).size === 8 && S.teams[0].a === pl[0].id && S.teams[0].b === pl[2].id, 'tim tidak valid/dobel dibuang, sisanya dipasangkan otomatis (' + S.teams.length + ' tim)');
call('act', { token: tHost, sid, type: 'end' });
sid = mk();
S = call('act', { token: tHost, sid, type: 'startPlan' }).S;
ok(S.teams.length === 4 && S.teams.every((t) => t.a && t.b), 'tanpa pilihan: semua dipasangkan acak');

console.log('• kudos');
ok(sent.filter((x) => x.payload.tag === 'kudos-' + sid).length === 0, 'belum ada ajakan kudos sebelum sesi selesai');
ok(/belum selesai/.test(fails(() => call('kudosForm', { token: t0, sid }))), 'kudos sebelum sesi selesai ditolak');
call('act', { token: tHost, sid, type: 'end' });
const kn = sent.filter((x) => x.payload.tag === 'kudos-' + sid);
ok(kn.length === 9 && kn.some((x) => x.pid === host.id) && kn[0].payload.url === '/?done=' + sid, 'sesi diakhiri: ajakan kudos ke 8 pemain + host (' + kn.length + ')');
const f0 = call('kudosForm', { token: t0, sid });
ok(f0.open && f0.people.length === 8 && !f0.people.some((p) => p.id === pl[0].id) && f0.people.find((p) => p.id === host.id).role === 'host', 'form: semua yang hadir kecuali diri sendiri, host ditandai host');
ok(f0.lists.player.length === 21 && f0.lists.host.length === 6 && f0.lists.host.includes('game_day_hero'), '21 kudos pemain, 6 kudos host');
ok(/Maksimal 2/.test(fails(() => call('giveKudos', { token: t0, sid, gifts: { [pl[1].id]: ['wall_master', 'predator', 'smash_machine'] } }))), 'lebih dari 2 kudos untuk satu orang ditolak');
ok(/tidak dikenal/.test(fails(() => call('giveKudos', { token: t0, sid, gifts: { [host.id]: ['wall_master'] } }))), 'kudos pemain untuk host ditolak');
ok(/hadir/.test(fails(() => call('giveKudos', { token: t0, sid, gifts: { [pl[0].id]: ['wall_master'] } }))), 'tidak bisa memberi ke diri sendiri');
call('giveKudos', { token: t0, sid, gifts: { [pl[1].id]: ['wall_master', 'dream_partner'], [host.id]: ['super_host'] } });
call('giveKudos', { token: t7, sid, gifts: { [pl[1].id]: ['wall_master'] } });
call('giveKudos', { token: tHost, sid, gifts: { [pl[1].id]: ['silent_killer'] } });
ok(call('kudosForm', { token: t0, sid }).given[pl[1].id].length === 2, 'kudos yang sudah diberi terisi lagi saat membuka form');
call('giveKudos', { token: t0, sid, gifts: { [pl[1].id]: ['wall_master'], [host.id]: ['super_host'] } });
let mine = call('myKudos', { token: t1 });
ok(mine.list.length === 3 && mine.totals.wall_master === 2 && mine.totals.silent_killer === 1 && !mine.totals.dream_partner, 'ubah kudos: pemberian lama diganti, tidak dobel (' + JSON.stringify(mine.totals) + ')');
ok(mine.list.some((x) => x.from === 'Andi' && x.session === 'Pasangan'), 'penerima melihat nama pemberi & sesi');
ok(call('myKudos', { token: t0 }).list.length === 0, 'orang lain tidak melihat kudos milik orang lain');
ok(/FORBIDDEN/.test(fails(() => call('kudosAdmin', { token: tHost }))) && /FORBIDDEN/.test(fails(() => call('kudosAdmin', { token: t0 }))), 'hanya admin yang bisa melihat semua kudos');
const all = call('kudosAdmin', { token: adm });
ok(all[0].id === pl[1].id && all[0].total === 3 && all.find((x) => x.id === host.id).total === 1 && all[0].list[0].fromId, 'admin: semua penerima urut terbanyak, lengkap pemberinya');
// akumulasi lintas sesi
const sid2 = mk(); call('act', { token: tHost, sid: sid2, type: 'startPlan' }); call('act', { token: tHost, sid: sid2, type: 'end' });
call('giveKudos', { token: t0, sid: sid2, gifts: { [pl[1].id]: ['wall_master'] } });
ok(call('myKudos', { token: t1 }).totals.wall_master === 3, 'kudos terakumulasi lintas sesi');
const outsider = call('savePerson', { token: adm, person: { name: 'Tamu', gender: 'L' } });
ok(/FORBIDDEN/.test(fails(() => call('kudosForm', { token: login(outsider.username), sid }))), 'yang tidak hadir tidak bisa memberi kudos');
clock += 8 * 864e5;
ok(!call('kudosForm', { token: t0, sid }).open && /lewat/.test(fails(() => call('giveKudos', { token: t0, sid, gifts: {} }))), 'setelah 7 hari kudos ditutup');
