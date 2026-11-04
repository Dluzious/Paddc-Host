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
const Engine = require('../../engine.js');
const adm = call('createAdmin', { name: 'Lulu', gender: 'P', username: 'lulu', pin: '9876' }).token;
const pl = ['Andi', 'Budi', 'Citra', 'Dewi'].map((n, i) => call('savePerson', { token: adm, person: { name: n, gender: i % 2 ? 'P' : 'L' } }));

console.log('• urutan klasemen: menang, lalu selisih poin');
// contoh dok: A main 3-2 (menang, +1), 1-4 (kalah, -3), 5-0 (menang, +5) → 2 menang, selisih +3
const S = Engine.newSession({ name: 'x', format: 'americano', courts: [{ name: 'C1' }], playerIds: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] });
const P = {}; 'ABCDEFGH'.split('').forEach((k) => { P[k] = { id: k, name: k, gender: 'L' }; });
const play = (a, b, sa, sb) => { const m = { id: 'm' + S.matches.length, no: S.matches.length + 1, court: S.courts[0].id, A: a, B: b, status: 'live', start: 1 }; S.matches.push(m); Engine.submitScore(S, m.id, sa, sb); };
play(['A', 'E'], ['F', 'G'], 3, 2); play(['A', 'H'], ['F', 'G'], 1, 4); play(['A', 'E'], ['F', 'H'], 5, 0);    // A: 2 menang, +3
play(['B', 'G'], ['C', 'D'], 10, 0); play(['B', 'G'], ['C', 'D'], 0, 1); play(['B', 'C'], ['D', 'H'], 1, 0);   // B: 2 menang, +10
play(['C', 'D'], ['E', 'H'], 9, 0);
const rows = Engine.standings(S, P, { sortBy: 'wins' });
const rA = rows.find((r) => r.id === 'A'), rB = rows.find((r) => r.id === 'B');
ok(rA.w === 2 && rA.diff === 3, 'contoh dok: A 3-2, 1-4, 5-0 → 2 menang, selisih +3 (dapat ' + rA.w + ', ' + rA.diff + ')');
ok(rB.w === 2 && rB.diff === 10 && rB.rank < rA.rank, 'menang sama → selisih lebih besar di atas (B +10 di atas A +3)');
const rC = rows.find((r) => r.id === 'C');
ok(rC.w === 3 && rC.rank < rB.rank, 'C 3 menang (selisih lebih kecil, ' + rC.diff + ') tetap di atas B: menang lebih dulu');
ok(rows.every((r, i) => i === 0 || rows[i - 1].w > r.w || (rows[i - 1].w === r.w && rows[i - 1].diff >= r.diff) || rows[i - 1].played === 0 || r.played === 0), 'seluruh klasemen urut menang lalu selisih');
ok(Engine.newSession({ name: 'y', courts: [{ name: 'C1' }], playerIds: [] }).rules.sortBy === 'wins', 'sesi baru: klasemen utama = menang');

(async () => {
  console.log('• ucapan terima kasih');
  const r = call('createSession', { token: adm, setup: { name: 'Sesi Seru', format: 'americano', courts: [{ name: 'C1' }], playerIds: pl.map((x) => x.id) } });
  sent.length = 0;
  call('act', { token: adm, sid: r.sid, type: 'end', payload: {} });
  const n = sent.filter((x) => x.payload.tag === 'kudos-' + r.sid);
  ok(n.length === 4 && /Terima kasih sudah bergabung/.test(n[0].payload.title) && /VAMOS!!!/.test(n[0].payload.body) && n[0].payload.url === '/?done=' + r.sid,
    'sesi ditutup: notifikasi terima kasih + VAMOS!!! → buka podium lalu kudos');
})().catch((e) => { console.error(e); process.exitCode = 1; });
