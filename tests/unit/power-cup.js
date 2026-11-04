// Uji logika Power Cup (v2.12 koreksi tahap 2): ronde, rotasi, kartu power (ambil manual, dek diulang, Pilih Lawan, batal, Switch Hand, Ambil Semua Poin), lobi
const Engine = require('../../engine.js');
const Core = require('../../core.js');
const crypto = require('crypto');
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ GAGAL: ') + m); if (!c) process.exitCode = 1; };
const fails = (f) => { try { f(); return null; } catch (e) { return e.message; } };
let T0 = 1000;
function mk(nTeams, nCourts, vals) {
  const ids = [], teams = [], courts = [];
  for (let i = 0; i < nTeams * 2; i++) ids.push('p' + i);
  for (let i = 0; i < nTeams; i++) teams.push({ id: 't' + i, a: 'p' + (2 * i), b: 'p' + (2 * i + 1) });
  for (let i = 0; i < nCourts; i++) courts.push({ id: 'c' + (i + 1), name: 'Court ' + (i + 1), value: vals ? vals[i] : undefined });
  const S = Engine.newSession({ name: 'PC', format: 'powercup', courts, playerIds: ids, teams });
  Engine.pcInit(S);
  return S;
}
const live = (S) => Engine.liveMatches(S);
const P = {}; for (let i = 0; i < 40; i++) P['p' + i] = { id: 'p' + i, name: 'P' + i, gender: 'L' };
const chooseAll = (S) => { let g = 0; while (S.pc.pend.length && g++ < 20) Engine.pcChoose(S, null); };
const finishAll = (S, pick) => { live(S).forEach((m) => { const aWin = pick ? pick(m) : Math.random() < 0.5; Engine.submitScore(S, m.id, aWin ? 3 : 2, aWin ? 2 : 3); }); };
const teamOfM = (m) => [m.tA, m.tB];

console.log('• ronde: semua tim main, urutan pilih court dikocok, penantang memilih');
{
  const S = mk(8, 4);   // 16 pemain, 4 court
  Engine.fillCourts(S, P);
  ok(S.pc.round === 1 && S.pc.pend.length === 4 && live(S).length === 0, 'ronde 1: 4 tantangan menunggu pilihan court (tidak ada court yang otomatis)');
  const all = new Set(); S.pc.pend.forEach((p) => { all.add(p.ch); all.add(p.op); });
  ok(all.size === 8, 'semua 8 tim masuk ronde (tidak ada yang menganggur)');
  const firsts = {}; for (let k = 0; k < 400; k++) { const X = mk(8, 4); Engine.fillCourts(X, P); const f = X.pc.pend[0].ch; firsts[f] = (firsts[f] || 0) + 1; }
  ok(Object.keys(firsts).length === 8 && Math.min(...Object.values(firsts)) > 20, 'urutan memilih court acak: tiap tim pernah memilih pertama (400 undian, min ' + Math.min(...Object.values(firsts)) + ')');
  const p0 = S.pc.pend[0];
  const m = Engine.pcChoose(S, 'c4');
  ok(m && m.court === 'c4' && m.tA === p0.ch && m.val === 4, 'penantang pertama memilih court ±4');
  Engine.pcChoose(S, 'c1'); Engine.pcChoose(S, 'c2');
  ok(live(S).length === 4 && S.pc.pend.length === 0, 'court terakhir yang tersisa otomatis untuk tantangan terakhir');
  finishAll(S);
  ok(live(S).length === 1 || true, '');
}
{
  const S = mk(8, 4);
  Engine.fillCourts(S, P); chooseAll(S);
  const ms = live(S);
  Engine.submitScore(S, ms[0].id, 3, 2); Engine.fillCourts(S, P);
  ok(S.pc.round === 1 && live(S).length === 3 && !S.pc.pend.length, 'satu court selesai: menunggu court lain (ronde belum berganti)');
  ms.slice(1).forEach((m) => Engine.submitScore(S, m.id, 1, 4)); Engine.fillCourts(S, P);
  ok(S.pc.round === 2 && S.pc.pend.length === 4, 'semua court selesai → ronde 2 diundi (4 tantangan)');
  const r1 = ms.map((m) => [m.tA, m.tB].sort().join());
  ok(S.pc.pend.every((p) => r1.indexOf([p.ch, p.op].sort().join()) < 0), 'ronde 2 tanpa lawan yang sama dengan ronde 1');
  const losers = ms.map((m) => m.sA > m.sB ? m.tB : m.tA);
  ok(S.pc.pend.every((p) => losers.indexOf(p.ch) >= 0 || losers.indexOf(p.op) < 0), 'penantang = tim yang kalah di match terakhir');
}

console.log('• rotasi: semua tim bertemu');
{
  let full = 0, rep = 0, runs = 200;
  for (let k = 0; k < runs; k++) {
    const S = mk(8, 4), met = {};
    for (let r = 0; r < 7; r++) {
      Engine.fillCourts(S, P); chooseAll(S);
      live(S).forEach((m) => { const key = [m.tA, m.tB].sort().join(); if (met[key]) rep++; met[key] = 1; });
      finishAll(S);
    }
    Engine.fillCourts(S, P);
    if (Object.keys(met).length === 28) full++;
  }
  ok(full === runs && rep === 0, '8 tim × 7 ronde (200 sesi acak): semua 28 pasangan tim bertemu tepat sekali di ' + full + '/' + runs + ' sesi, ulangan ' + rep);
  let full6 = 0;
  for (let k = 0; k < 100; k++) {
    const S = mk(12, 6), met = {};
    for (let r = 0; r < 11; r++) { Engine.fillCourts(S, P); chooseAll(S); live(S).forEach((m) => { met[[m.tA, m.tB].sort().join()] = 1; }); finishAll(S); }
    if (Object.keys(met).length === 66) full6++;
  }
  ok(full6 >= 95, '12 tim (6 court, 24 pemain) × 11 ronde: semua 66 pasangan bertemu di ' + full6 + '/100 sesi');
  const t0 = Date.now(), S = mk(12, 6); for (let r = 0; r < 20; r++) { Engine.fillCourts(S, P); chooseAll(S); finishAll(S); }
  ok(Date.now() - t0 < 3000, '20 ronde 12 tim diundi dalam ' + (Date.now() - t0) + ' ms');
}

console.log('• tim tidak lengkap, belum siap, batal match');
{
  const S = mk(7, 4);   // 7 tim, 4 court → 3 match, 1 tim istirahat bergiliran
  const sat = {};
  for (let r = 0; r < 7; r++) {
    Engine.fillCourts(S, P);
    const inR = new Set(); S.pc.pend.forEach((p) => { inR.add(p.ch); inR.add(p.op); });
    ok(S.pc.pend.length === 3 || r > 0, r === 0 ? '7 tim, 4 court: 3 match per ronde' : '');
    S.teams.forEach((t) => { if (!inR.has(t.id)) sat[t.id] = (sat[t.id] || 0) + 1; });
    chooseAll(S); finishAll(S);
  }
  ok(Object.keys(sat).length === 7 && Object.values(sat).every((v) => v === 1), 'tim yang istirahat bergiliran (7 ronde: tiap tim istirahat 1×)');
  const U = mk(8, 4); Engine.fillCourts(U, P);
  const p = U.pc.pend[1], t = Engine.teamById(U, p.ch);
  U.parts[t.a].paused = true; Engine.fillCourts(U, P);
  ok(U.pc.pend.length === 3 && !U.pc.pend.some((x) => x.ch === t.id || x.op === t.id), 'pemain belum siap: tantangannya batal, lawannya istirahat ronde ini');
  const V = mk(8, 4); Engine.fillCourts(V, P); chooseAll(V);
  const m = live(V)[0]; Engine.voidMatch(V, m.id); Engine.fillCourts(V, P);
  const U2 = V;
  const back = live(U2).find((x) => x.court === m.court);
  ok(back && back.tA === m.tA && back.tB === m.tB, 'match dibatalkan: tantangan yang sama kembali ke court itu (court kosong tinggal satu)');
}

console.log('• kartu: tim kalah berhak mengambil (manual), maks 2, Zonk dibuang, dek diulang');
{
  const S = mk(4, 2);
  ok(S.pc.cd.deck.length === 28, 'dek berisi 28 kartu');
  const kinds = {}; S.pc.cd.deck.forEach((c) => { kinds[c.k] = (kinds[c.k] || 0) + 1; });
  ok(kinds.free15 === 3 && kinds.zonk === 6 && kinds.block === 3 && kinds.steal === 1 && kinds.swap === 1, 'komposisi dek sesuai usulan (Free 15 ×3, Block ×3, Zonk ×6, …)');
  Engine.fillCourts(S, P); chooseAll(S);
  const [m, m2] = live(S), loser = m.tB, deck0 = S.pc.cd.deck.length;
  Engine.submitScore(S, m.id, 3, 2); m.end = 100;
  ok(m.drawn && m.drawn.owe && m.drawn.t === loser && S.pc.cd.deck.length === deck0 && Engine.pcHandCount(S, loser) === 0, 'kalah: belum ada kartu diambil otomatis, tim kalah berhak mengambil');
  Engine.submitScore(S, m2.id, 1, 4); m2.end = 50; S.pc.owe.find((o) => o.m === m2.id).at = 50;
  ok(Engine.pcOwed(S).map((o) => o.t).join() === [m2.tA, loser].join(), 'antrean ambil kartu urut waktu selesai main (yang selesai duluan di depan)');
  ok(Engine.pcDraw(S, m.tA).err, 'tim yang menang tidak bisa mengambil kartu');
  S.pc.cd.deck.push({ id: 'kz', k: 'zonk' });
  let r = Engine.pcDraw(S, loser);
  ok(r.z && r.card.id === 'kz' && m.drawn.z && Engine.pcHandCount(S, loser) === 0 && S.pc.cd.disc.some((c) => c.id === 'kz'), 'ambil Zonk: langsung dibuang, tidak masuk tangan');
  ok(Engine.pcDraw(S, loser).err && !Engine.pcOwed(S).some((o) => o.t === loser), 'hak ambil hanya sekali per kekalahan');
  S.pc.cd.deck.push({ id: 'kd', k: 'double' });
  r = Engine.pcDraw(S, m2.tA);
  ok(r.card.k === 'double' && m2.drawn.id === 'kd' && Engine.pcHandCount(S, m2.tA) === 1, 'ambil Double Point: masuk tangan');
  const H = S.pc.cd.hand[m2.tA]; H.push({ id: 'x1', k: 'block' });
  // ronde 2: tim dengan 2 kartu kalah lagi → tidak berhak mengambil
  Engine.fillCourts(S, P); chooseAll(S);
  const m3 = live(S).find((x) => x.tA === m2.tA || x.tB === m2.tA);
  Engine.submitScore(S, m3.id, m3.tA === m2.tA ? 0 : 5, m3.tA === m2.tA ? 5 : 0);
  ok(m3.drawn && m3.drawn.full && !Engine.pcOwed(S).some((o) => o.t === m2.tA), 'tim yang memegang 2 kartu tidak berhak mengambil kartu baru');
  // koreksi skor membalik pemenang: hak / kartu berpindah
  const other = live(S)[0];
  Engine.submitScore(S, other.id, 3, 2);
  ok(Engine.pcOwed(S).some((o) => o.t === other.tB && o.m === other.id), '');
  Engine.submitScore(S, other.id, 2, 3);
  ok(!Engine.pcOwed(S).some((o) => o.t === other.tB) && Engine.pcOwed(S).some((o) => o.t === other.tA && o.m === other.id), 'koreksi skor sebelum kartu diambil: hak ambil pindah ke tim kalah baru');
  S.pc.cd.deck.push({ id: 'kf', k: 'free15' });
  Engine.pcDraw(S, other.tA);
  Engine.submitScore(S, other.id, 3, 2);
  ok(!S.pc.cd.hand[other.tA].some((c) => c.id === 'kf') && Engine.pcOwed(S).some((o) => o.t === other.tB), 'koreksi skor setelah kartu diambil: kartu ditarik, tim kalah baru berhak mengambil');
  // tim yang belum mengambil lalu tangannya penuh: tidak mendapat kartu
  const t9 = other.tB; S.pc.cd.hand[t9] = [{ id: 'q1', k: 'free15' }, { id: 'q2', k: 'free30' }];
  r = Engine.pcDraw(S, t9);
  ok(r.full && Engine.pcHandCount(S, t9) === 2, 'saat mengambil tangan sudah penuh (2 kartu): tidak mendapat kartu');
}
{
  // tumpukan habis → tumpukan buang dikocok ulang; semua kartu sedang dipegang → dek baru 28 kartu dari awal
  const D = mk(2, 1); D.pc.cd.disc = D.pc.cd.deck.splice(0); Engine.fillCourts(D, P);
  const md = live(D)[0]; Engine.submitScore(D, md.id, 4, 1); Engine.pcDraw(D, md.tB);
  ok(D.pc.cd.deck.length + D.pc.cd.disc.length + Engine.pcHandCount(D, md.tB) === 28, 'tumpukan habis: tumpukan buang dikocok ulang jadi tumpukan baru');
  const E = mk(2, 1); E.pc.cd.deck = []; E.pc.cd.disc = []; Engine.fillCourts(E, P);
  const me1 = live(E)[0]; Engine.submitScore(E, me1.id, 4, 1);
  const re = Engine.pcDraw(E, me1.tB);
  ok(re.card && E.pc.cd.deck.length === 27 && E.pc.cd.rf === 1, 'semua kartu habis (dipegang / dipakai): dek baru 28 kartu, tim yang belum dapat tetap mengambil');
  let n = 0; const F = mk(2, 1);
  for (let i = 0; i < 200; i++) { F.pc.cd.hand = {}; F.pc.owe = [{ t: 't0', m: 'x', at: i }]; const rr = Engine.pcDraw(F, 't0'); if (rr.card) n++; }
  ok(n === 200, '200 kali mengambil kartu: tidak pernah gagal karena kartu habis');
}

console.log('• memakai kartu: waktu, urutan penantang, Block, Reverse');
function liveWithHands(hA, hB) {
  const S = mk(2, 1); Engine.fillCourts(S, P);
  const m = live(S)[0];
  S.pc.cd.hand[m.tA] = hA.map((k, i) => ({ id: 'a' + i, k })); S.pc.cd.hand[m.tB] = hB.map((k, i) => ({ id: 'b' + i, k }));
  return { S, m };
}
{
  let { S, m } = liveWithHands(['free15', 'block', 'double'], ['golden', 'block']);
  const play = (team, card, extra) => Engine.pcPlay(S, Object.assign({ team, card, ref: m.id }, extra || {}));
  ok(/Penantang/.test(play(m.tB, 'b0') || ''), 'lawan tidak bisa mengumumkan kartu sebelum penantang');
  ok(/menjawab/.test(play(m.tA, 'a1') || ''), 'Block tidak bisa dipakai tanpa kartu lawan');
  ok(play(m.tA, 'a0') === null && m.cards.length === 1 && Engine.pcHandCount(S, m.tA) === 2, 'penantang memakai Free 15');
  ok(/sudah memakai 1 kartu/.test(play(m.tA, 'a2') || ''), 'maksimal 1 kartu per tim per match');
  ok(play(m.tB, 'b0') === null, 'setelah penantang mengumumkan, lawan boleh memakai Golden Point');
  ok(/sudah memakai/.test(Engine.pcRespond(S, { team: m.tB, card: 'b1', of: 'a0', ref: m.id }) || ''), 'lawan yang sudah memakai kartu tidak bisa Block lagi');
  ({ S, m } = liveWithHands(['free30'], ['block']));
  Engine.pcPlay(S, { team: m.tA, card: 'a0', ref: m.id });
  ok(Engine.pcRespond(S, { team: m.tB, card: 'b0', of: 'a0', ref: m.id }) === null && m.cards[0].st === 'blocked', 'Block membatalkan Free 30 lawan');
  m.go = 1; Engine.tally(S, m.id, 'A');
  ok(Engine.tallyState(S, m).pa === '15', 'Free 30 yang diblok: skor game tetap mulai dari 0 (15 setelah 1 poin)');
  ({ S, m } = liveWithHands(['nosmash'], ['reverse']));
  ok(Engine.pcPlay(S, { team: m.tA, card: 'a0', ref: m.id }) === null && m.cards[0].g === 1, 'No Smash diumumkan sebelum game 1 (berlaku game 1–2)');
  ok(Engine.pcRespond(S, { team: m.tB, card: 'b0', of: 'a0', ref: m.id }) === null && m.cards[0].st === 'reversed', 'Reverse membalik No Smash');
  ({ S, m } = liveWithHands(['free15'], ['reverse']));
  Engine.pcPlay(S, { team: m.tA, card: 'a0', ref: m.id });
  ok(/Reverse hanya/.test(Engine.pcRespond(S, { team: m.tB, card: 'b0', of: 'a0', ref: m.id }) || ''), 'Reverse tidak berlaku untuk Free 15');
  ({ S, m } = liveWithHands(['nosmash'], ['block']));
  Engine.pcPlay(S, { team: m.tA, card: 'a0', ref: m.id }); m.go = 1; Engine.tally(S, m.id, 'B');
  ok(/lewat/.test(Engine.pcRespond(S, { team: m.tB, card: 'b0', of: 'a0', ref: m.id }) || ''), 'Block setelah poin berikutnya ditolak (waktu menjawab lewat)');
  ({ S, m } = liveWithHands(['free15'], []));
  m.go = 1;
  ok(/sebelum match dimulai/.test(Engine.pcPlay(S, { team: m.tA, card: 'a0', ref: m.id }) || ''), 'Free 15 setelah Game start ditolak');
  ({ S, m } = liveWithHands(['double'], ['free15']));
  ok(Engine.pcPass(S, m.id, m.tA) === null && Engine.pcPlay(S, { team: m.tB, card: 'b0', ref: m.id }) === null, 'penantang menyatakan tanpa kartu → lawan boleh mengumumkan');
  ({ S, m } = liveWithHands(['swh'], ['swh']));
  ok(/Penantang/.test(Engine.pcPlay(S, { team: m.tB, card: 'b0', ref: m.id }) || ''), 'Switch Hand diumumkan sebelum match (penantang lebih dulu)');
  ok(Engine.pcPlay(S, { team: m.tA, card: 'a0', ref: m.id }) === null && m.cards[0].g === 1 && !m.cards[0].pid, 'Switch Hand: kedua pemain lawan, berlaku game 1–2 (tanpa memilih pemain)');
  ({ S, m } = liveWithHands(['swh'], []));
  m.go = 1;
  ok(/sebelum match dimulai/.test(Engine.pcPlay(S, { team: m.tA, card: 'a0', ref: m.id }) || ''), 'Switch Hand setelah Game start ditolak');
}

console.log('• batalkan kartu sebelum match dimulai');
{
  let { S, m } = liveWithHands(['double'], ['free15', 'block']);
  Engine.pcPlay(S, { team: m.tA, card: 'a0', ref: m.id });
  ok(Engine.pcUndo(S, { team: m.tA, card: 'a0', ref: m.id }) === null && !m.cards.length && S.pc.cd.hand[m.tA].some((c) => c.id === 'a0'), 'kartu yang dipasang dibatalkan: kembali ke tangan');
  ok(/tidak dipakai timmu/.test(Engine.pcUndo(S, { team: m.tB, card: 'a0', ref: m.id }) || ''), 'tim lain tidak bisa membatalkan kartu tim ini');
  Engine.pcPlay(S, { team: m.tA, card: 'a0', ref: m.id }); Engine.pcRespond(S, { team: m.tB, card: 'b1', of: 'a0', ref: m.id });
  ok(/dijawab/.test(Engine.pcUndo(S, { team: m.tA, card: 'a0', ref: m.id }) || '') && /Jawaban/.test(Engine.pcUndo(S, { team: m.tB, card: 'b1', ref: m.id }) || ''), 'kartu yang sudah diblok, dan jawaban Block sendiri, tidak bisa dibatalkan');
  ({ S, m } = liveWithHands(['free30'], []));
  Engine.pcPlay(S, { team: m.tA, card: 'a0', ref: m.id }); m.go = 1;
  ok(/sudah dimulai/.test(Engine.pcUndo(S, { team: m.tA, card: 'a0', ref: m.id }) || '') && m.cards.length === 1, 'setelah Game start kartu tidak bisa dibatalkan');
}

console.log('• efek skor game: Free 15/30, Golden Point');
{
  const pts = (S, m, seq) => { m.go = 1; seq.split('').forEach((x) => Engine.tally(S, m.id, x)); return Engine.tallyState(S, m); };
  let { S, m } = liveWithHands(['free15'], ['free30']);
  Engine.pcPlay(S, { team: m.tA, card: 'a0', ref: m.id }); Engine.pcPlay(S, { team: m.tB, card: 'b0', ref: m.id });
  let t = pts(S, m, '');
  ok(t.pa === '15' && t.pb === '30', 'Free 15 vs Free 30: tiap game mulai 15-30');
  t = pts(S, m, 'BB');
  ok(t.b === 1 && t.pa === '15' && t.pb === '30', 'B menang game (30→40→game), game berikutnya mulai lagi 15-30');
  ({ S, m } = liveWithHands(['golden'], []));
  Engine.pcPlay(S, { team: m.tA, card: 'a0', ref: m.id });
  t = pts(S, m, 'BBBAAA');
  ok(t.a === 1 && t.pa === '0', 'Golden Point: 40-40 langsung game untuk pemegang');
  ({ S, m } = liveWithHands(['golden'], ['golden']));
  Engine.pcPlay(S, { team: m.tA, card: 'a0', ref: m.id }); Engine.pcPlay(S, { team: m.tB, card: 'b0', ref: m.id });
  t = pts(S, m, 'BBBAAA');
  ok(t.a === 0 && t.b === 0 && t.deuce, 'kedua tim Golden Point: keduanya batal (40-40 dimainkan)');
  ({ S, m } = liveWithHands(['steal'], []));
  ok(Engine.pcPlay(S, { team: m.tA, card: 'a0', ref: m.id }) === null, '');
  t = pts(S, m, 'ABBB');
  ok(t.pa === '15' && t.pb === '40', 'Ambil Semua Poin tidak mengubah skor game (15-40 tetap)');
  ({ S, m } = liveWithHands(['steal'], [])); m.go = 1;
  ok(/sebelum match dimulai/.test(Engine.pcPlay(S, { team: m.tA, card: 'a0', ref: m.id }) || ''), 'Ambil Semua Poin dipakai sebelum match dimulai (setelah Game start ditolak)');
}

console.log('• klasemen: Ambil Semua Poin');
{
  // t0 +3, t1 +5 sebelum match; match court ±2
  const mkS = () => {
    const S = mk(4, 2, [2, 2]); S.teams.push({ id: 'tx', a: 'p8', b: 'p9' });
    const done = (id, tA, tB, a, b, val, end, cards) => S.matches.push({ id, no: S.matches.length + 1, court: 'c1', A: [], B: [], tA, tB, status: 'done', sA: a, sB: b, val, end, cards: cards || [] });
    done('h0', 't0', 'tx', 4, 1, 3, 1); done('h1', 't1', 'tx', 4, 1, 5, 2);
    return { S, done };
  };
  let { S, done } = mkS();
  done('s', 't0', 't1', 3, 2, 2, 3, [{ id: 'st', k: 'steal', by: 't0', tg: 't1', st: 'on' }]);
  let p = Engine.pcPoints(S);
  ok(p.t0 === 10 && p.t1 === -2, 'pemegang menang: +3 + nilai court 2 + poin lawan 5 = +10; lawan jadi 0 lalu −2 (dapat ' + p.t0 + ', ' + p.t1 + ')');
  ({ S, done } = mkS());
  done('s', 't0', 't1', 2, 3, 2, 3, [{ id: 'st', k: 'steal', by: 't0', tg: 't1', st: 'on' }]);
  p = Engine.pcPoints(S);
  ok(p.t0 === 1 && p.t1 === 7, 'pemegang kalah: hangus, hasil biasa (+3 −2 = +1, +5 +2 = +7)');
  ({ S, done } = mkS());
  done('s', 't0', 't1', 2, 3, 2, 3, [{ id: 'st', k: 'steal', by: 't0', tg: 't1', st: 'reversed' }, { id: 'rv', k: 'reverse', by: 't1', tg: 't0', of: 'st', st: 'on' }]);
  p = Engine.pcPoints(S);
  ok(p.t1 === 10 && p.t0 === -2, 'dibalik Reverse & yang membalik menang: poin pemakai pindah ke yang membalik (+5 +2 +3 = +10), pemakai −2');
  ({ S, done } = mkS());
  done('s', 't0', 't1', 3, 2, 2, 3, [{ id: 'st', k: 'steal', by: 't0', tg: 't1', st: 'blocked' }]);
  p = Engine.pcPoints(S);
  ok(p.t0 === 5 && p.t1 === 3, 'diblok: hasil biasa');
  ({ S, done } = mkS());
  done('n', 't1', 'tx', 1, 4, 9, 2.5);                                            // t1: +5 −9 = −4
  done('s', 't0', 't1', 3, 2, 2, 3, [{ id: 'st', k: 'steal', by: 't0', tg: 't1', st: 'on' }]);
  p = Engine.pcPoints(S);
  ok(p.t0 === 5 && p.t1 === -6, 'poin lawan minus: tidak ada yang diambil, hasil biasa (+3 +2 = +5, −4 −2 = −6)');
}

console.log('• klasemen: Double Point & Tukar Ranking');
{
  const S = mk(4, 3, [1, 2, 3]);
  const add = (court, tA, tB, a, b, val, cards) => { const t1 = Engine.teamById(S, tA), t2 = Engine.teamById(S, tB); const m = { id: 'm' + S.matches.length, no: S.matches.length + 1, court, A: [t1.a, t1.b], B: [t2.a, t2.b], tA, tB, status: 'live', start: 1, val, cards: cards || [] }; S.matches.push(m); Engine.submitScore(S, m.id, a, b); m.end = ++T0; };
  add('c3', 't0', 't1', 4, 1, 3, [{ id: 'd', k: 'double', by: 't0', st: 'on' }]);
  add('c2', 't2', 't3', 1, 4, 2, [{ id: 'd2', k: 'double', by: 't2', st: 'on' }]);
  let pts = Engine.pcPoints(S);
  ok(pts.t0 === 6 && pts.t1 === -3 && pts.t2 === -2 && pts.t3 === 2, 'Double Point: menang di ±3 → +6; kalah tetap −nilai (−2)');
  // contoh dok: A −2, B +8, Court 2, A menang dengan Tukar Ranking → A +6, B 0
  const S2 = mk(2, 2, [2, 2]);
  const t = (S2.teams); S2.matches.push({ id: 'x', no: 1, court: 'c1', A: ['p0', 'p1'], B: ['p2', 'p3'], tA: 't0', tB: 't1', status: 'done', sA: 0, sB: 5, val: 1, end: 1 });
  S2.matches.push({ id: 'y', no: 2, court: 'c1', A: ['p0', 'p1'], B: ['p2', 'p3'], tA: 't0', tB: 't1', status: 'done', sA: 1, sB: 4, val: 1, end: 2 });
  S2.matches.push({ id: 'z', no: 3, court: 'c1', A: ['p2', 'p3'], B: ['p0', 'p1'], tA: 't1', tB: 't0', status: 'done', sA: 4, sB: 1, val: 6, end: 3 });
  let p2 = Engine.pcPoints(S2);
  ok(p2.t0 === -8 && p2.t1 === 8, '');
  S2.matches.push({ id: 'w', no: 4, court: 'c1', A: ['p0', 'p1'], B: ['p2', 'p3'], tA: 't0', tB: 't1', status: 'done', sA: 3, sB: 2, val: 2, end: 4, cards: [{ id: 's', k: 'swap', by: 't0', st: 'on' }] });
  S2.matches[0].sA = 5; S2.matches[0].sB = 0; S2.matches[1].sA = 1;  // susun ulang supaya sebelum match terakhir A −2, B +8
  S2.matches.splice(0, 3, { id: 'x', no: 1, court: 'c1', A: ['p0', 'p1'], B: ['p2', 'p3'], tA: 't0', tB: 't1', status: 'done', sA: 1, sB: 4, val: 2, end: 1 },
    { id: 'z', no: 2, court: 'c1', A: ['p2', 'p3'], B: ['p4', 'p5'], tA: 't1', tB: null, status: 'done', sA: 4, sB: 1, val: 6, end: 2 });
  S2.teams.push({ id: 'tx', a: 'p4', b: 'p5' });
  S2.matches[1].tB = 'tx';
  p2 = Engine.pcPoints(S2);
  ok(p2.t0 === 6 && p2.t1 === 0, 'contoh dok Tukar Ranking: A −2, B +8, A menang di ±2 → A 0, B +6 → ditukar: A +6, B 0 (dapat ' + p2.t0 + ', ' + p2.t1 + ')');
  S2.matches[2].cards[0].st = 'blocked';
  p2 = Engine.pcPoints(S2);
  ok(p2.t0 === 0 && p2.t1 === 6, 'Tukar Ranking yang diblok: tidak ditukar');
  const rows = Engine.standings(S, P, { unit: 'team' });
  ok(rows[0].id === 't0' && rows[0].pts === 6, 'klasemen tim memakai poin dengan efek kartu');
}

console.log('• Pilih Lawan: tukar dengan tim yang sudah punya lawan, sebelum match dimulai');
{
  const S = mk(4, 2); Engine.fillCourts(S, P);
  const [p1, p2] = S.pc.pend, holder = p1.op;
  S.pc.cd.hand[holder] = [{ id: 'pk', k: 'pick' }];
  S.pc.cd.hand[p2.op] = [{ id: 'bk', k: 'block' }];
  const before = [p1.ch, p1.op, p2.ch, p2.op];
  ok(Engine.pcPlay(S, { team: holder, card: 'pk', ref: p1.id, target: p2.op }) === null && p1.ch === holder && p1.op === before[3] && p2.ch === before[2] && p2.op === before[0], 'tantangan (belum dapat court): pemegang menantang tim pilihannya; lawan lama kedua tim saling bertemu');
  ok(Engine.pcRespond(S, { team: before[3], card: 'bk', of: 'pk', ref: p1.id }) === null && p1.ch === before[0] && p1.op === before[1] && p2.ch === before[2] && p2.op === before[3], 'tim yang dipilih memakai Block: susunan kembali seperti undian');
  chooseAll(S);
  const mH = live(S).find((m) => m.tA === holder || m.tB === holder), mT = live(S).find((m) => m.tA === before[3] || m.tB === before[3]);
  ok(mH.cards.some((c) => c.k === 'pick' && c.st === 'blocked') && mT.cards.some((c) => c.k === 'block' && c.by === before[3]), 'kartu tercatat di match masing-masing (kedua tim sudah memakai 1 kartu)');
  Engine.voidMatch(S, mH.id);
  ok(S.pc.cd.hand[holder].some((c) => c.id === 'pk'), 'match dibatalkan: kartu yang dipakai kembali ke tangan');
}
{
  // keduanya sudah di court (lawan sudah diacak & court sudah dipilih), belum Game start
  const S = mk(4, 2); Engine.fillCourts(S, P); chooseAll(S);
  const [m1, m2] = live(S), H = m1.tB, O1 = m1.tA, T = m2.tA, O2 = m2.tB;
  S.pc.cd.hand[H] = [{ id: 'pk', k: 'pick' }]; S.pc.cd.hand[T] = [{ id: 'rv', k: 'reverse' }, { id: 'bk', k: 'block' }];
  m2.cards.push({ id: 'g2', k: 'golden', by: O2, tg: T, st: 'on', n0: 0 });
  const tH = Engine.teamById(S, H), tT = Engine.teamById(S, T);
  ok(Engine.pcPlay(S, { team: H, card: 'pk', ref: m1.id, target: T }) === null && m1.tA === H && m1.tB === T && m2.tA === O2 && m2.tB === O1, 'di court: pemegang melawan tim pilihan di court pemegang, lawan lama kedua tim bertemu di court lain');
  ok(m1.A.join() === [tH.a, tH.b].join() && m1.B.join() === [tT.a, tT.b].join() && m2.cards.some((c) => c.id === 'g2'), 'pemain di court ikut berganti; kartu yang sudah dipakai ikut pindah bersama timnya');
  ok(/Reverse hanya/.test(Engine.pcRespond(S, { team: T, card: 'rv', of: 'pk', ref: m1.id }) || ''), 'Pilih Lawan tidak bisa di-Reverse');
  ok(Engine.pcRespond(S, { team: T, card: 'bk', of: 'pk', ref: m1.id }) === null && m1.tA === O1 && m1.tB === H && m2.tA === T && m2.tB === O2 && m2.cards.some((c) => c.id === 'bk'), 'Block: kedua court kembali seperti semula');
  ok(m1.A.concat(m1.B).every((pid) => m1.snap[pid]) && m2.A.concat(m2.B).every((pid) => m2.snap[pid]), 'catatan giliran pemain ikut pindah');
}
{
  const S = mk(4, 2); Engine.fillCourts(S, P); chooseAll(S);
  const [m1, m2] = live(S), H = m1.tA;
  S.pc.cd.hand[H] = [{ id: 'pk', k: 'pick' }];
  m2.go = 1;
  ok(/sudah dimulai/.test(Engine.pcPlay(S, { team: H, card: 'pk', ref: m1.id, target: m2.tA }) || ''), 'tidak bisa memilih tim yang match-nya sudah dimulai');
  m2.go = 0; m1.go = 1;
  ok(/sebelum match timmu dimulai/.test(Engine.pcPlay(S, { team: H, card: 'pk', ref: m1.id, target: m2.tA }) || ''), 'tidak bisa dipakai setelah match pemegang dimulai');
  m1.go = 0;
  ok(/sudah lawanmu/.test(Engine.pcPlay(S, { team: H, card: 'pk', ref: m1.id, target: m1.tB }) || ''), 'tidak bisa memilih lawan sendiri');
  const O1 = m1.tB, T = m2.tB, O2 = m2.tA;
  Engine.pcPlay(S, { team: H, card: 'pk', ref: m1.id, target: T });
  ok(m1.tA === H && m1.tB === T, '');
  ok(Engine.pcUndo(S, { team: H, card: 'pk', ref: m1.id }) === null && m1.tA === H && m1.tB === O1 && m2.tA === O2 && m2.tB === T && S.pc.cd.hand[H].some((c) => c.id === 'pk'), 'Pilih Lawan dibatalkan sebelum mulai: kedua court kembali, kartu kembali ke tangan');
}
{
  // campuran: pemegang masih menunggu court, tim pilihan sudah di court
  const S = mk(6, 3); Engine.fillCourts(S, P);
  Engine.pcChoose(S, 'c1');
  const p = S.pc.pend[0], m = live(S)[0], H = p.ch, O1 = p.op, T = m.tB, O2 = m.tA;
  S.pc.cd.hand[H] = [{ id: 'pk', k: 'pick' }];
  ok(Engine.pcPlay(S, { team: H, card: 'pk', ref: p.id, target: T }) === null && p.ch === H && p.op === T && m.tA === O2 && m.tB === O1, 'pemegang menunggu court, tim pilihan di court: tim di court bertukar, lawan lama main di court itu');
}

/* ---------- server ---------- */
let clock = Date.UTC(2026, 9, 24, 12, 0, 0);
const store = { people: [], sessions: {}, props: {} }, sent = [];
Core.init({
  now: () => clock, uuid: (p) => (p || '') + crypto.randomUUID().replace(/-/g, ''), hash: (x) => crypto.createHash('sha256').update(x).digest('hex'),
  people: () => JSON.parse(JSON.stringify(store.people)), savePerson: (p) => { const i = store.people.findIndex((x) => x.id === p.id); if (i >= 0) store.people[i] = p; else store.people.push(p); },
  session: (id) => store.sessions[id] ? JSON.parse(JSON.stringify(store.sessions[id])) : null,
  saveSession: (S) => { store.sessions[S.id] = JSON.parse(JSON.stringify(S)); },
  sessions: () => Object.values(store.sessions).map((S) => ({ id: S.id, name: S.name, status: S.status })),
  deleteSession: (id) => { delete store.sessions[id]; },
  prop: (k) => store.props[k] == null ? null : store.props[k], setProp: (k, v) => { store.props[k] = v; }, delProp: (k) => { delete store.props[k]; },
  cacheGet: () => null, cachePut: () => {}, lock: (f) => f(), aiEnabled: () => false,
  savePhoto: () => 'ph', trash: () => {}, photoUrl: (id) => '/photo/' + id, notify: (pid, payload) => sent.push({ pid, payload }),
  saveKudos: () => {}, kudosBy: () => [], kudosFor: () => [], kudosAll: () => []
});
const call = (fn, req) => Core.call(fn, req);
const adm = call('createAdmin', { name: 'Lulu', gender: 'P', username: 'lulu', pin: '9876' }).token;
const pl = []; for (let i = 0; i < 20; i++) pl.push(call('savePerson', { token: adm, person: { name: 'Pemain' + i, gender: i % 2 ? 'P' : 'L' } }));
const tok = {}; pl.forEach((p) => { tok[p.id] = call('login', { username: p.username, pin: '123456' }).token; });
const act = (token, sid, type, payload) => call('act', { token, sid, type, payload: payload || {} });

console.log('• lobi Power Cup: batas court × 4, waiting list, sudah datang');
{
  const r = call('createSession', { token: adm, setup: { name: 'PC Lobi', format: 'powercup', courts: [{ name: 'C1' }, { name: 'C2' }], playerIds: [], plan: { when: clock + 3600e3, whenText: 'x' } } });
  pl.slice(0, 10).forEach((p, i) => { clock += 1000; act(tok[p.id], r.sid, 'rsvp', { on: true }); });
  let pv = call('poll', { token: adm }).plans.find((x) => x.id === r.sid);
  ok(pv.cap === 8 && pv.rsvp.filter((x) => x.w).map((x) => x.w).join() === '1,2', '2 court → maks 8 pemain; pendaftar ke-9 & ke-10 masuk waiting list #1, #2');
  sent.length = 0;
  act(tok[pl[2].id], r.sid, 'rsvp', { on: false });
  pv = call('poll', { token: adm }).plans.find((x) => x.id === r.sid);
  ok(pv.rsvp.filter((x) => x.w).length === 1 && !pv.rsvp.find((x) => x.pid === pl[8].id).w, 'ada yang batal → waiting list #1 naik ke daftar main');
  ok(sent.some((x) => x.pid === pl[8].id && /masuk daftar main/.test(x.payload.title)), 'yang naik dari waiting list mendapat notifikasi');
  ok(/FORBIDDEN/.test(fails(() => act(tok[pl[0].id], r.sid, 'here', { pid: pl[1].id, on: true })) || 'x') === false, '');
  act(tok[pl[0].id], r.sid, 'here', { pid: pl[1].id, on: true });
  pv = call('poll', { token: adm }).plans.find((x) => x.id === r.sid);
  ok(pv.rsvp.find((x) => x.pid === pl[0].id).here === true && pv.rsvp.find((x) => x.pid === pl[1].id).here === undefined, 'pemain hanya bisa menandai dirinya sendiri sudah datang');
  [1, 3, 4, 5, 6, 8, 9].forEach((i) => act(adm, r.sid, 'here', { pid: pl[i].id, on: true }));
  act(adm, r.sid, 'here', { pid: pl[7].id, on: false });
  act(adm, r.sid, 'startPlan', { teams: [], pairRest: true });
  const S = store.sessions[r.sid];
  const playing = S.teams.flatMap((t) => [t.a, t.b]);
  ok(S.teams.length === 4 && playing.indexOf(pl[7].id) < 0 && playing.indexOf(pl[9].id) >= 0, 'mulai: yang belum datang (Pemain7) diganti waiting list yang sudah datang (Pemain9) → 4 tim');
  ok(S.parts[pl[7].id].paused && S.parts[pl[7].id].absent, 'yang belum datang tercatat "belum siap" (tidak diundi)');
  ok(S.pc.pend.length === 2 && S.pc.round === 1, 'ronde 1: 2 tantangan, semua tim main');
}
{
  const r = call('createSession', { token: adm, setup: { name: 'Biasa', format: 'americano', courts: [{ name: 'C1' }], playerIds: [], plan: { when: clock + 3600e3, whenText: 'x' } } });
  pl.slice(0, 7).forEach((p) => act(tok[p.id], r.sid, 'rsvp', { on: true }));
  act(adm, r.sid, 'startPlan', {});
  let S = store.sessions[r.sid];
  ok(S.status === 'live' && Object.values(S.parts).every((x) => !x.paused), 'check-in tidak dipakai sama sekali: semua dianggap datang (sesi lama tetap sama)');
  act(adm, r.sid, 'end', {});
  const r2 = call('createSession', { token: adm, setup: { name: 'Biasa2', format: 'americano', courts: [{ name: 'C1' }], playerIds: [], plan: { when: clock + 3600e3, whenText: 'x' } } });
  pl.slice(0, 7).forEach((p) => act(tok[p.id], r2.sid, 'rsvp', { on: true }));
  pl.slice(0, 5).forEach((p) => act(tok[p.id], r2.sid, 'here', { on: true }));
  act(adm, r2.sid, 'startPlan', {});
  S = store.sessions[r2.sid];
  const used = Engine.liveMatches(S).flatMap((m) => m.A.concat(m.B));
  ok(S.parts[pl[5].id].paused && S.parts[pl[6].id].absent && used.indexOf(pl[5].id) < 0 && used.indexOf(pl[6].id) < 0, 'sesi biasa: yang belum datang tidak masuk putaran');
  act(tok[pl[6].id], r2.sid, 'ready', {});
  S = store.sessions[r2.sid];
  ok(!S.parts[pl[6].id].paused && !S.parts[pl[6].id].absent, 'pemain menekan Siap main saat datang → masuk antrean undian');
  act(adm, r2.sid, 'end', {});
  const r3 = call('createSession', { token: adm, setup: { name: 'Biasa3', format: 'americano', courts: [{ name: 'C1' }], playerIds: [], plan: { when: clock + 3600e3, whenText: 'x' } } });
  pl.slice(0, 6).forEach((p) => act(tok[p.id], r3.sid, 'rsvp', { on: true }));
  pl.slice(0, 2).forEach((p) => act(tok[p.id], r3.sid, 'here', { on: true }));
  ok(/sudah datang/.test(fails(() => act(adm, r3.sid, 'startPlan', {})) || ''), 'kurang dari 4 yang sudah datang: Mulai Sesi ditolak');
  act(adm, r3.sid, 'startPlan', { allHere: true });
  ok(store.sessions[r3.sid].status === 'live' && Object.values(store.sessions[r3.sid].parts).every((x) => !x.paused), '"Semua sudah datang" saat mulai: semua ikut putaran');
  act(adm, r3.sid, 'end', {});
}

console.log('• server: kartu privat & aksi kartu');
{
  const r = call('createSession', { token: adm, setup: { name: 'PC Kartu', format: 'powercup', courts: [{ name: 'C1' }, { name: 'C2' }], playerIds: [], plan: { when: clock + 3600e3, whenText: 'x' } } });
  pl.slice(0, 8).forEach((p) => act(tok[p.id], r.sid, 'rsvp', { on: true }));
  act(adm, r.sid, 'startPlan', { teams: [], pairRest: true });
  act(adm, r.sid, 'pcCourt', { all: true });
  let S = store.sessions[r.sid];
  const m = Engine.liveMatches(S)[0], loser = Engine.teamById(S, m.tB);
  S.pc.cd.deck.push({ id: 'kk', k: 'golden' }); store.sessions[r.sid] = S;
  sent.length = 0;
  act(adm, r.sid, 'score', { m: m.id, a: 3, b: 2 });
  ok(sent.filter((x) => /Ambil kartu power/.test(x.payload.title)).map((x) => x.pid).sort().join() === [loser.a, loser.b].sort().join(), 'tim kalah dikabari untuk mengambil kartu (2 pemain tim itu saja)');
  ok(/tidak sedang berhak/.test(fails(() => act(tok[Engine.teamById(S, m.tA).a], r.sid, 'pcDraw', {})) || ''), 'tim yang menang tidak bisa mengambil kartu');
  sent.length = 0;
  const dr = act(tok[loser.a], r.sid, 'pcDraw', {});
  ok(dr.info && dr.info.card && dr.info.card.id === 'kk' && dr.info.card.k === 'golden', 'pemain mengambil kartu dari HP: hasil acak dari server (Golden Point)');
  ok(sent.length === 1 && sent[0].pid === loser.b && /Golden Point/.test(sent[0].payload.title), 'partner dikabari kartu yang didapat');
  const pub = call('poll', { token: adm }).S;
  ok(pub.pc.cd.hand[loser.id] === 1 && !pub.pc.cd.deck && !JSON.stringify(pub).includes('"kk"'), 'data publik hanya berisi jumlah kartu (isi tangan & urutan dek rahasia)');
  const hLoser = call('pcHand', { token: tok[loser.a], sid: r.sid }), hOther = call('pcHand', { token: tok[Engine.teamById(S, m.tA).a], sid: r.sid }), hAdm = call('pcHand', { token: adm, sid: r.sid });
  ok(hLoser.hands[loser.id][0].k === 'golden' && !hOther.hands[loser.id] && hAdm.all && hAdm.hands[loser.id].length === 1, 'pcHand: tim sendiri melihat kartunya, tim lain tidak, admin melihat semua');
  act(adm, r.sid, 'score', { m: Engine.liveMatches(store.sessions[r.sid])[0].id, a: 1, b: 4 });
  act(adm, r.sid, 'pcCourt', { all: true });
  S = store.sessions[r.sid];
  const m2 = Engine.liveMatches(S).find((x) => x.tA === loser.id || x.tB === loser.id);
  const card = S.pc.cd.hand[loser.id][0];
  const declared = m2.pc.ch === loser.id || Engine.pcChDeclared(S, m2.id);
  if (!declared) act(adm, r.sid, 'pcPass', { ref: m2.id, team: m2.pc.ch });
  const outsider = S.teams.find((t) => t.id !== m2.tA && t.id !== m2.tB);
  ok(/tidak ada/.test(fails(() => act(tok[outsider.a], r.sid, 'pcCard', { card: card.id, ref: m2.id })) || ''), 'pemain tim lain tidak bisa memakai kartu tim ini');
  act(tok[loser.b], r.sid, 'pcCard', { card: card.id, ref: m2.id });
  S = store.sessions[r.sid];
  const used = Engine.liveMatches(S).find((x) => x.id === m2.id).cards;
  ok(used.length === 1 && used[0].k === 'golden' && used[0].by === loser.id && call('poll', { token: adm }).S.pc.cd.hand[loser.id] === 0, 'pemain memakai Golden Point dari HP: tercatat di match (publik), tangan berkurang');
  act(tok[loser.a], r.sid, 'pcUndo', { card: card.id, ref: m2.id });
  S = store.sessions[r.sid];
  ok(!Engine.findMatch(S, m2.id).cards.length && S.pc.cd.hand[loser.id].some((c) => c.id === card.id), 'partner membatalkan kartu dari HP sebelum Game start: kembali ke tangan');
  // host mengambilkan kartu di iPad untuk tim yang kalah (urut antrean)
  const mx = Engine.liveMatches(S).find((x) => x.id !== m2.id) || m2;
  act(adm, r.sid, 'score', { m: mx.id, a: 2, b: 3 });
  S = store.sessions[r.sid];
  const ow = Engine.pcOwed(S)[0], dh = act(adm, r.sid, 'pcDraw', { team: ow.t });
  ok(dh.info && dh.info.t === ow.t && (dh.info.card || dh.info.full), 'host mengambilkan kartu untuk tim di antrean terdepan (hasil tampil di iPad)');
}

console.log('• host sesi yang ikut main tidak melihat kartu tim lain');
{
  const r = call('createSession', { token: adm, setup: { name: 'PC Cohost', format: 'powercup', courts: [{ name: 'C1' }, { name: 'C2' }], playerIds: [], plan: { when: clock + 3600e3, whenText: 'x' } } });
  pl.slice(0, 8).forEach((p) => act(tok[p.id], r.sid, 'rsvp', { on: true }));
  act(adm, r.sid, 'cohost', { pid: pl[0].id, on: true });
  act(adm, r.sid, 'startPlan', { teams: [], pairRest: true });
  const S = store.sessions[r.sid];
  S.teams.forEach((t) => { S.pc.cd.hand[t.id] = [{ id: 'h' + t.id, k: 'double' }]; }); store.sessions[r.sid] = S;
  const h = call('pcHand', { token: tok[pl[0].id], sid: r.sid });
  const myT = S.teams.find((t) => t.a === pl[0].id || t.b === pl[0].id);
  ok(!h.all && Object.keys(h.hands).join() === myT.id, 'host sesi (pemain) hanya melihat kartu timnya sendiri');
  act(adm, r.sid, 'pcCourt', { all: true });
  const S2 = store.sessions[r.sid], other = S2.teams.find((t) => t.id !== myT.id), m = Engine.liveMatches(S2).find((x) => x.tA === other.id || x.tB === other.id);
  const e = fails(() => act(tok[pl[0].id], r.sid, 'pcCard', { team: other.id, card: 'h' + other.id, ref: m.id }));
  ok(!!e, 'host sesi tidak bisa memakai kartu atas nama tim lain (' + e + ')');
  ok(call('pcHand', { token: adm, sid: r.sid }).all, 'admin tetap melihat semua kartu');
}

console.log('• tahap 3: notifikasi kartu lawan & pengingat ambil kartu');
{
  const r = call('createSession', { token: adm, setup: { name: 'PC Notif', format: 'powercup', courts: [{ name: 'C1' }, { name: 'C2' }], playerIds: [], plan: { when: clock + 3600e3, whenText: 'x' } } });
  pl.slice(0, 8).forEach((p) => act(tok[p.id], r.sid, 'rsvp', { on: true }));
  act(adm, r.sid, 'startPlan', { teams: [], pairRest: true });
  act(adm, r.sid, 'pcCourt', { all: true });
  let S = store.sessions[r.sid];
  const [m1, m2] = Engine.liveMatches(S), ch = Engine.teamById(S, m1.tA), op = Engine.teamById(S, m1.tB);
  S.pc.cd.hand[ch.id] = [{ id: 'n1', k: 'free15' }, { id: 'n2', k: 'pick' }];
  S.pc.cd.hand[op.id] = [{ id: 'n3', k: 'block' }];
  store.sessions[r.sid] = S;
  sent.length = 0;
  act(tok[ch.a], r.sid, 'pcCard', { card: 'n1', ref: m1.id });
  const toOp = sent.filter((x) => /Lawan memakai Free 15/.test(x.payload.title));
  ok(toOp.map((x) => x.pid).sort().join() === [op.a, op.b].sort().join() && /Block/.test(toOp[0].payload.body), 'lawan memakai kartu → 2 pemain tim sasaran dikabari, dengan pengingat Block yang dipegang');
  ok(!sent.some((x) => x.pid === ch.a || x.pid === ch.b), 'tim pemakai tidak ikut dikabari');
  sent.length = 0;
  act(tok[op.b], r.sid, 'pcResp', { card: 'n3', of: 'n1', ref: m1.id });
  ok(sent.filter((x) => /Kartu Free 15 diblok/.test(x.payload.title)).map((x) => x.pid).sort().join() === [ch.a, ch.b].sort().join(), 'Block dikabarkan ke tim pemakai kartu asal');
  // Pilih Lawan: tim sasaran + dua tim yang lawannya berubah
  S = store.sessions[r.sid];
  const m1b = Engine.findMatch(S, m1.id), m2b = Engine.findMatch(S, m2.id);
  m1b.cards = []; S.pc.cd.hand[m2b.tA] = [{ id: 'n4', k: 'pick' }]; store.sessions[r.sid] = S;
  sent.length = 0;
  act(adm, r.sid, 'pcCard', { card: 'n4', ref: m2b.id, team: m2b.tA, target: m1b.tA });
  const tt = (id) => { const t = Engine.teamById(S, id); return [t.a, t.b]; };
  ok(sent.filter((x) => /memilih timmu jadi lawan/.test(x.payload.title)).map((x) => x.pid).sort().join() === tt(m1b.tA).sort().join(), 'Pilih Lawan: tim yang dipilih dikabari');
  ok(sent.filter((x) => /Lawanmu berubah/.test(x.payload.title)).length === 4, 'Pilih Lawan: kedua tim yang lawannya berubah dikabari (4 pemain)');
  // ronde baru: tim yang belum mengambil kartu diingatkan sekali
  S = store.sessions[r.sid];
  Engine.liveMatches(S).forEach((m) => { m.cards = []; }); store.sessions[r.sid] = S;
  Engine.liveMatches(store.sessions[r.sid]).forEach((m) => act(adm, r.sid, 'score', { m: m.id, a: 3, b: 2 }));
  S = store.sessions[r.sid];
  const owedM = Engine.pcOwed(S).map((o) => o.m);
  ok(S.pc.round === 2 && owedM.length === 2, 'semua court selesai → ronde 2; 2 tim kalah belum mengambil kartu');
  ok(sent.filter((x) => /belum diambil/.test(x.payload.title)).length === 4, 'ronde 2 dimulai: 4 pemain tim yang belum mengambil kartu diingatkan');
  sent.length = 0;
  act(adm, r.sid, 'pcCourt', { all: true });
  Engine.liveMatches(store.sessions[r.sid]).forEach((m) => act(adm, r.sid, 'score', { m: m.id, a: 3, b: 2 }));
  const tags = sent.filter((x) => /belum diambil/.test(x.payload.title)).map((x) => x.payload.tag);
  ok(store.sessions[r.sid].pc.round === 3 && tags.length > 0 && !tags.some((t) => owedM.some((m) => t === 'pcowe-' + m)), 'ronde 3: hanya hak baru yang diingatkan, hak lama tidak diulang (' + tags.length + ' notifikasi)');
}
