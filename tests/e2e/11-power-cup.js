// Uji browser v2.12 + koreksi tahap 2: kartu bergambar & animasi, ambil kartu manual (acak) di HP & iPad, batal kartu, Pilih Lawan antar court
const L = require('../lib');
const { chromium } = require('playwright');
const Engine = require('../../engine.js');
const fs = require('fs'), path = require('path');
const B = 'http://127.0.0.1:8789', OUT = L.out('11-power-cup');
const api = async (fn, req) => { const r = await fetch(B + '/api', { method: 'POST', body: JSON.stringify({ fn, req }) }); const j = await r.json(); if (!j.ok) throw new Error(fn + ': ' + j.error); return j.data; };
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ GAGAL: ') + m); if (!c) process.exitCode = 1; };
const step = (t) => console.log('•', t);
(async () => {
  const adm = await api('createAdmin', { code: '2468', name: 'Lulu Admin', gender: 'P', username: 'lulu', pin: '9876' }), token = adm.token;
  const host = await api('savePerson', { token, person: { name: 'Rudi Hartono', gender: 'L', role: 'host' } });
  const names = ['Andi', 'Bayu', 'Citra', 'Dewi', 'Eko', 'Fajar', 'Gita', 'Hana', 'Indra', 'Joko'];
  const pl = []; for (let i = 0; i < names.length; i++) pl.push(await api('savePerson', { token, person: { name: names[i], gender: [2, 3, 6, 7].includes(i) ? 'P' : 'L' } }));
  const tok = {}; for (const p of pl) tok[p.id] = (await api('login', { username: p.username, pin: '123456' })).token;
  const loginOf = async (p) => api('login', { username: p.username, pin: '123456' });
  const act = (t, sid, type, payload) => api('act', { token: t, sid, type, payload: payload || {} });
  const b = await chromium.launch(), errs = [];
  const watch = (p, tag) => { p.on('pageerror', (e) => errs.push(tag + ': ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|navigator\.vibrate|WebSocket/.test(m.text())) errs.push(tag + ' console: ' + m.text()); }); };
  const open = async (vp, auth, tag, url) => {
    const ctx = await L.ctx(b, { viewport: vp, deviceScaleFactor: 2, timezoneId: 'Asia/Jakarta', locale: 'id-ID' });
    await ctx.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '#turn-alert{display:none!important}'; document.head.appendChild(st); }); });
    await ctx.addInitScript(() => { window.__pka = []; new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => { if (n.classList && n.classList.contains('pka')) window.__pka.push({ cls: n.className, t: (n.querySelector('.pka-cap') || n).textContent, me: !!n.querySelector('li.me'), at: Date.now() }); }))).observe(document, { childList: true, subtree: true }); });
    const pg = await ctx.newPage(); watch(pg, tag);
    await pg.goto(B + '/'); if (auth) await pg.evaluate((a) => { localStorage.setItem('paddoc_auth', JSON.stringify(a)); localStorage.setItem('paddoc_boardpref', 'true'); }, auth);
    await pg.goto(B + (url || '/')); return pg;
  };
  const toDash = async (pg) => { await pg.waitForSelector('.v-home, .v-dash, .v-board', { timeout: 15000 }); if (await pg.$('.v-home')) { await pg.evaluate(() => document.querySelector('.topbar .brand').click()); await pg.waitForSelector('.v-dash, .v-board', { timeout: 10000 }); } };
  const poll = async () => (await api('poll', { token })).S;
  const drawAll = async (sid) => { const S1 = await poll(); for (const o of Engine.pcOwed(S1)) { try { await act(token, sid, 'pcDraw', { team: o.t }); } catch (e) { /* sudah diambil */ } } };

  step('lobi Power Cup: maks court × 4, waiting list antre di luar court');
  const r = await api('createSession', { token, setup: { name: 'Power Cup Kartu', format: 'powercup', hosts: [host.id], courts: [{ name: 'Court 1', color: 'green', value: 1 }, { name: 'Court 2', color: 'orange', value: 2 }],
    playerIds: [], plan: { when: Date.now() + 3600e3, whenText: 'Malam ini', venue: { name: 'Padel Doc Arena' }, theme: 'court' } } });
  const sid = r.sid;
  for (const p of pl) { await act(tok[p.id], sid, 'rsvp', { on: true }); await new Promise((x) => setTimeout(x, 15)); }
  const ha = await open({ width: 1180, height: 820 }, adm, 'admin-ipad', '/?lobby=' + sid);
  await ha.waitForSelector('.lb-sprite', { timeout: 15000 }); await ha.waitForTimeout(1800);
  const lb = await ha.evaluate(() => {
    const sp = [...document.querySelectorAll('.lb-sprite')].map((e) => ({ wl: e.classList.contains('wl'), y: e.getBoundingClientRect().bottom, tag: e.querySelector('.tag').textContent }));
    return { kick: document.querySelector('.lb-kick').textContent, cnt: document.querySelector('[data-k="cnt"]').textContent, txt: document.querySelector('[data-k="cntTxt"]').textContent, sp,
      rows: [...document.querySelectorAll('.lb-roster .lb-row small')].map((x) => x.textContent) };
  });
  const wl = lb.sp.filter((x) => x.wl), court = lb.sp.filter((x) => !x.wl && !/HOST/.test(x.tag));
  ok(/maks 8 pemain/.test(lb.kick) && lb.cnt === '8/8' && /2 antre/.test(lb.txt), 'lobi: ' + lb.kick + ' · ' + lb.cnt + ' ' + lb.txt);
  ok(wl.length === 2 && /#1 /.test(wl.map((x) => x.tag).join()) && lb.rows.filter((x) => /Waiting list #/.test(x)).length === 2, 'Indra & Joko di waiting list (#1, #2)');
  ok(wl.every((x) => x.y > Math.max(...court.map((c) => c.y))), 'avatar waiting list berbaris di luar court (di belakang garis belakang)');
  await ha.screenshot({ path: OUT + '/01-lobi-antre.png' });

  step('status sudah datang: pemain sendiri dan admin');
  const hp = await open({ width: 390, height: 844 }, await loginOf(pl[0]), 'hp-andi', '/?lobby=' + sid);
  await hp.waitForSelector('[data-lb="hereMe"]', { timeout: 15000 });
  await hp.waitForTimeout(1500); await hp.screenshot({ path: OUT + '/02a-hp-lobi-antre.png' });
  await hp.click('[data-lb="hereMe"]');
  await ha.waitForFunction(() => [...document.querySelectorAll('.lb-roster .lb-row')].some((r) => /Andi/.test(r.textContent) && r.querySelector('.lb-here.on')), null, { timeout: 8000 });
  ok(true, 'Andi menekan "Saya sudah datang" di HP → tampil Datang ✓ di iPad');
  await hp.screenshot({ path: OUT + '/02-hp-lobi-datang.png' });
  const toMark = ['Bayu', 'Citra', 'Dewi', 'Eko', 'Fajar', 'Gita', 'Indra', 'Joko'];
  for (const n of toMark) {
    await ha.evaluate((nm) => { const row = [...document.querySelectorAll('.lb-roster .lb-row')].find((r) => r.querySelector('.lb-nm').firstChild.textContent === nm); row.querySelector('[data-lb="here"]').click(); }, n);
    await ha.waitForFunction((nm) => [...document.querySelectorAll('.lb-roster .lb-row')].some((r) => r.querySelector('.lb-nm').firstChild.textContent === nm && r.querySelector('.lb-here.on')), n, { timeout: 8000 });
  }
  let plan = (await api('poll', { token })).plans.find((x) => x.id === sid);
  ok(plan.rsvp.filter((x) => x.here).length === 9 && !plan.rsvp.find((x) => x.pid === pl[7].id).here, 'admin menandai 8 pemain lain (Hana belum datang; Indra & Joko dari waiting list sudah datang)');
  ok(/datang/i.test(await hp.textContent('.lb-controls')), 'HP Andi: tombol berubah jadi "Sudah datang"');

  step('mulai: yang belum datang diganti waiting list yang sudah datang');
  await ha.click('[data-lb="start"]'); await ha.waitForSelector('.pm-modes');
  const pmTxt = await ha.textContent('#modals .modal-b');
  ok(/Belum ditandai datang \(1\):\s*Hana/.test(pmTxt) && /Cadangan \(waiting list, 1\):\s*Joko/.test(pmTxt) && /8 pemain ikut putaran/.test(pmTxt), 'modal mulai: 8 ikut putaran, Hana belum datang, Joko cadangan');
  await ha.screenshot({ path: OUT + '/03-mulai.png' });
  await ha.click('#pm-go');
  await ha.waitForSelector('.court', { timeout: 15000 });
  let S = await poll();
  const playing = S.teams.flatMap((t) => [t.a, t.b]);
  ok(S.teams.length === 4 && playing.includes(pl[8].id) && !playing.includes(pl[7].id) && S.parts[pl[7].id].absent && S.parts[pl[9].id].wl, '4 tim: Indra main menggantikan Hana; Hana "belum datang", Joko cadangan');
  ok(S.pc.round === 1 && S.pc.pend.length === 2, 'ronde 1: kedua tantangan memilih court');
  await ha.waitForTimeout(600);
  ok(/Ronde 1/.test(await ha.textContent('.bench')), 'bar bawah: Ronde 1 + urutan pilih court');

  step('ronde 1 dimainkan (server), yang kalah mengambil kartu');
  let found = null;
  for (let round = 0; round < 10 && !found; round++) {
    S = await poll();
    if (S.pc.pend.length) await act(token, sid, 'pcCourt', { all: true });
    S = await poll();
    for (const m of Engine.liveMatches(S)) { const aw = Math.random() < 0.5; await act(token, sid, 'score', { m: m.id, a: aw ? 3 : 2, b: aw ? 2 : 3 }); }
    await drawAll(sid);                                              // tim kalah mengambil kartu (host mengambilkan)
    S = await poll();
    const hands = await api('pcHand', { token, sid });
    const simple = ['free15', 'free30', 'golden', 'double', 'swap', 'nosmash', 'noglass'];
    for (const tid of Object.keys(hands.hands)) { const c = hands.hands[tid].find((x) => simple.includes(x.k)); if (c) { found = { tid, card: c }; break; } }
  }
  ok(!!found, 'ada tim kalah yang memegang kartu yang bisa langsung dipakai (' + (found && found.card.k) + ')');
  S = await poll();
  ok(S.pc.round >= 2 && S.pc.pend.length === 2 && !S.pc.cd.deck, 'ronde berikutnya diundi; data publik tanpa isi dek');

  step('kartu dipakai dari HP penantang / tim pemegang, tampil di court iPad');
  const team = S.teams.find((t) => t.id === found.tid), holder = pl.find((p) => p.id === team.a) || pl.find((p) => p.id === team.b);
  const hp2 = await open({ width: 390, height: 844 }, await loginOf(holder), 'hp-kartu'); await toDash(hp2);
  await act(token, sid, 'pcCourt', { all: true });
  S = await poll();
  const m = Engine.liveMatches(S).find((x) => x.tA === team.id || x.tB === team.id);
  if (m.pc.ch !== team.id) { try { await act(token, sid, 'pcPass', { ref: m.id, team: m.pc.ch }); } catch (e) { /* penantang tanpa kartu */ } }
  await hp2.waitForSelector('.mystatus [data-act="pkOpen"][data-card="' + found.card.id + '"]', { timeout: 10000 });
  const hcard = await hp2.textContent('.mystatus .pc-hand');
  ok(new RegExp(Engine.PC_CARDS[found.card.k].name, 'i').test(hcard) && /Kartu power timmu \(\d\/2\)/.test(hcard), 'HP tim pemegang: kartu di tangan tampil (' + Engine.PC_CARDS[found.card.k].name + ')');
  await hp2.waitForFunction(() => [...document.querySelectorAll('.mystatus .pc-hand button.pkc img')].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 8000 });
  const himg = await hp2.evaluate((id) => { const i = document.querySelector('.mystatus [data-card="' + id + '"] img'); return { src: i.getAttribute('src'), w: i.getBoundingClientRect().width, nw: i.naturalWidth }; }, found.card.id);
  ok(himg.src === 'img/cards/' + found.card.k + '.webp' && himg.nw === 600 && himg.w >= 80, 'HP: kartu di tangan berupa gambar (' + himg.src + ', ' + Math.round(himg.w) + 'px)');
  await hp2.screenshot({ path: OUT + '/04-hp-kartu.png' });
  await hp2.click('.mystatus [data-act="pkOpen"][data-card="' + found.card.id + '"]');
  await hp2.waitForSelector('#pk-go');
  await hp2.waitForFunction(() => { const i = document.querySelector('#modals .pkbig'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 8000 });
  ok((await hp2.getAttribute('#modals .pkbig', 'src')) === 'img/cards/' + found.card.k + '.webp', 'HP: modal kartu menampilkan gambar besar');
  await hp2.waitForTimeout(700); await hp2.screenshot({ path: OUT + '/05-hp-pakai.png' });
  await hp2.click('#pk-go');
  const nm = Engine.PC_CARDS[found.card.k].name;
  await ha.waitForSelector('.pka.play', { timeout: 20000 });
  // selama kartu besar tampil, gambar kecil di court belum terlihat (court mungkin masih menampilkan hasil match sebelumnya)
  const ov = await ha.evaluate((c) => new Promise((res) => { const out = { cap: document.querySelector('.pka-cap').textContent, n: 0, seen: 0, bad: 0 };
    const f = () => { const e = document.querySelector('.court[data-court="' + c + '"] .pcuse .pkc'); out.n++; if (e) { out.seen++; if (!e.classList.contains('hold')) out.bad++; }
      if (document.querySelector('.pka') && out.n < 25) setTimeout(f, 100); else res(out); }; f(); }), m.court);
  ok(ov.cap.includes('memakai ' + nm) && ov.bad === 0, 'iPad: animasi "' + ov.cap.split('ketuk')[0].trim() + '"; gambar di court menunggu kartu mendarat (' + ov.seen + '/' + ov.n + ' sampel tersembunyi)');
  await ha.screenshot({ path: OUT + '/06a-ipad-animasi.png' });
  await ha.waitForFunction(() => { const a = document.querySelector('.pka-cap'); return !a || getComputedStyle(a).opacity < 0.7; }, null, { timeout: 8000, polling: 30 });
  await ha.screenshot({ path: OUT + '/06b-ipad-terbang.png' });
  await ha.waitForSelector('.pka', { state: 'detached', timeout: 10000 });
  const chip = await ha.evaluate((c) => { const e = document.querySelector('.court[data-court="' + c + '"] .pcuse .pkc'); const r = e.getBoundingClientRect(), p = e.closest('.pitch').getBoundingClientRect(), i = e.querySelector('img');
    return { src: i.getAttribute('src'), nw: i.naturalWidth, w: r.width, cls: e.className, vis: getComputedStyle(e).visibility, inside: r.left >= p.left - 1 && r.right <= p.right + 1 && r.top >= p.top - 1 && r.bottom <= p.bottom + 1 }; }, m.court);
  ok(chip.src === 'img/cards/' + found.card.k + '.webp' && chip.nw === 600 && chip.vis === 'visible' && !/hold/.test(chip.cls) && chip.inside, 'iPad: gambar ' + nm + ' mendarat di court (' + Math.round(chip.w) + 'px, di dalam lapangan)');
  const hlog = await hp2.evaluate(() => window.__pka);
  ok(hlog.some((x) => /play/.test(x.cls) && x.t.includes('Timmu memakai ' + nm)), 'HP pemegang: animasi "Timmu memakai ' + nm + '"');
  // batalkan dari HP sebelum Game start, lalu dipakai lagi
  await hp2.waitForSelector('.pka', { state: 'detached', timeout: 15000 }).catch(() => {});
  await hp2.waitForSelector('.mystatus [data-act="pkUndo"][data-card="' + found.card.id + '"]', { timeout: 10000 });
  await hp2.screenshot({ path: OUT + '/05b-hp-batalkan.png' });
  await hp2.click('.mystatus [data-act="pkUndo"][data-card="' + found.card.id + '"]');
  await hp2.waitForSelector('.mystatus [data-act="pkOpen"][data-card="' + found.card.id + '"]', { timeout: 10000 });
  const gone = await ha.waitForFunction((a) => !document.querySelector('.court[data-court="' + a.c + '"] .pkc[data-cid="' + a.id + '"]'), { c: m.court, id: found.card.id }, { timeout: 10000 }).then(() => true, () => false);
  ok(gone, 'HP: "Batalkan ' + nm + '" sebelum Game start → kartu kembali ke tangan, hilang dari court iPad');
  await act(token, sid, 'pcCard', { card: found.card.id, ref: m.id, team: team.id });
  await ha.waitForSelector('.court[data-court="' + m.court + '"] .pkc[data-cid="' + found.card.id + '"]', { timeout: 10000 });
  ok(/Kartu \d · \d/.test(await ha.textContent('.court[data-court="' + m.court + '"] .ctags')), 'iPad: jumlah kartu di tangan kedua tim tampil');
  await ha.waitForTimeout(1200);                                   // animasi pembagian kartu pemain selesai
  ok((await ha.$$('.court[data-court="' + m.court + '"] .pcard')).length === 4, 'court tetap menampilkan 4 pemain');
  await ha.screenshot({ path: OUT + '/06-ipad-kartu.png' });
  const others = Engine.liveMatches(S).find((x) => x.id !== m.id);
  const opp = S.teams.find((t) => t.id === (m.tA === team.id ? m.tB : m.tA));
  const oppP = pl.find((p) => p.id === opp.a) || pl.find((p) => p.id === opp.b);
  const hOpp = await api('pcHand', { token: (await loginOf(oppP)).token, sid });
  ok(!hOpp.hands[team.id], 'tim lawan tidak bisa melihat isi kartu tim pemegang');

  step('host mengelola kartu di iPad');
  await ha.click('.court[data-court="' + m.court + '"] [data-act="pkManage"]');
  await ha.waitForSelector('#modals .pc-hand', { timeout: 8000 });
  const mg = await ha.textContent('#modals .modal-b');
  ok(/Dipakai di match ini/.test(mg) && mg.includes(Engine.PC_CARDS[found.card.k].name), 'modal Kartu (host): kartu yang dipakai & tangan kedua tim');
  await ha.screenshot({ path: OUT + '/07-host-kartu.png' });
  await ha.click('#modals .modal-wrap:last-child [data-act="close"]');

  step('riwayat match & klasemen');
  const holderA = m.tA === team.id;
  await act(token, sid, 'score', { m: m.id, a: holderA ? 2 : 3, b: holderA ? 3 : 2 });      // tim pemegang kalah → mengambil kartu
  if (others) await act(token, sid, 'score', { m: others.id, a: 2, b: 3 });
  S = await poll();
  const P = {}; (await api('poll', {})).people.forEach((x) => { P[x.id] = x; });
  const rows = Engine.standings(S, P, { unit: 'team' });
  ok(rows.every((x, i) => i === 0 || rows[i - 1].pts > x.pts || (rows[i - 1].pts === x.pts && rows[i - 1].diff >= x.diff)), 'klasemen urut poin court (dengan efek kartu) lalu selisih game');
  await ha.waitForSelector('.pka', { state: 'detached', timeout: 20000 });
  await ha.click('[data-act="history"] >> nth=0'); await ha.waitForSelector('#modals .hist');
  ok((await ha.$$('#modals .hist .pk')).length >= 1, 'riwayat match menampilkan kartu yang dipakai');
  await ha.click('#modals .modal-wrap:last-child [data-act="close"]');

  step('tim kalah mengambil kartu: diacak di HP (rahasia) & di iPad (terbuka)');
  S = await poll();
  ok(Engine.pcOwed(S).some((o) => o.t === team.id) && !(Engine.findMatch(S, m.id).drawn || {}).id, 'kalah: kartu tidak otomatis diambil, tim berhak mengambil (antrean ' + Engine.pcOwed(S).length + ' tim)');
  await hp2.waitForSelector('.mystatus [data-act="pkDraw"]', { timeout: 10000 });
  const n0 = await hp2.evaluate(() => window.__pka.length);
  await hp2.click('.mystatus [data-act="pkDraw"]');
  await hp2.waitForSelector('.pka.roul', { timeout: 5000 });
  const spin = await hp2.evaluate(() => new Promise((res) => { const seen = new Set(), t0 = Date.now(); const f = () => { const i = document.querySelector('.pka.roul .main img'); if (i) seen.add(i.getAttribute('src')); if (Date.now() - t0 < 1200) setTimeout(f, 30); else res(seen.size); }; f(); }));
  await hp2.waitForFunction(() => /ketuk untuk menutup/.test((document.querySelector('.pka.roul .pka-cap') || {}).textContent || ''), null, { timeout: 10000 });
  await hp2.waitForTimeout(700); await hp2.screenshot({ path: OUT + '/09-hp-ambil-kartu.png' });
  const rcap = await hp2.textContent('.pka.roul .pka-cap');
  ok(spin >= 5 && /Kartu baru untuk timmu|Timmu mendapat Zonk|Tangan penuh/.test(rcap), 'HP: kartu diacak (' + spin + ' gambar berganti) lalu berhenti — "' + rcap.split('ketuk')[0].trim() + '"');
  await hp2.click('.pka.roul'); await hp2.waitForSelector('.pka', { state: 'detached', timeout: 8000 });
  await hp2.waitForTimeout(2500);
  const extra = await hp2.evaluate((n) => window.__pka.slice(n).filter((x) => !/roul/.test(x.cls)).map((x) => x.cls), n0);
  ok(!extra.length, 'tidak ada animasi ganda setelah mengambil kartu (' + (extra.join() || 'bersih') + ')');
  ok(!(await hp2.$('.mystatus [data-act="pkDraw"]')), 'HP: tombol Ambil kartu hilang setelah diambil');
  let alog = await ha.evaluate(() => window.__pka);
  ok(!alog.some((x) => /\b(new|roul)\b/.test(x.cls)), 'iPad tidak menampilkan kartu yang diambil di HP (rahasia)');
  S = await poll();
  const nextO = Engine.pcOwed(S)[0];
  ok(!!nextO, 'masih ada tim lain di antrean ambil kartu');
  if (nextO) {
    await ha.waitForSelector('.pka', { state: 'detached', timeout: 30000 }).catch(() => {});
    await ha.waitForSelector('.bench [data-act="pkDraw"][data-team="' + nextO.t + '"]', { timeout: 10000 });
    ok(/Ambil kartu · urut selesai main/.test(await ha.textContent('.bench .pcq')), 'iPad: antrean "Ambil kartu · urut selesai main", tombol untuk tim terdepan');
    await ha.click('.bench [data-act="pkDraw"][data-team="' + nextO.t + '"]');
    await ha.waitForFunction(() => /ketuk untuk menutup/.test((document.querySelector('.pka.roul .pka-cap') || {}).textContent || ''), null, { timeout: 10000 });
    await ha.waitForTimeout(700); await ha.screenshot({ path: OUT + '/12-ipad-ambil-kartu.png' });
    const icap = await ha.textContent('.pka.roul .pka-cap'), isrc = await ha.getAttribute('.pka.roul .main img', 'src');
    ok(/mendapat|Tangan penuh/.test(icap) && (/Tangan penuh/.test(icap) || !/back\.webp/.test(isrc)), 'iPad: host mengambilkan, kartu tampil terbuka — "' + icap.split('ketuk')[0].trim() + '" (' + isrc + ')');
    await ha.click('.pka.roul'); await ha.waitForSelector('.pka.roul', { state: 'detached', timeout: 8000 });
  }

  step('tahap 3: pergantian ronde, court menyala saat dipilih');
  S = await poll();
  if (S.pc.pend.length) { await act(token, sid, 'pcCourt', { all: true }); S = await poll(); }
  const rd0 = S.pc.round;
  await ha.waitForSelector('.pka', { state: 'detached', timeout: 40000 }).catch(() => {});
  await hp2.waitForSelector('.pka', { state: 'detached', timeout: 40000 }).catch(() => {});
  for (const lm of Engine.liveMatches(S)) await act(token, sid, 'score', { m: lm.id, a: 3, b: 2 });
  await drawAll(sid);
  S = await poll();
  ok(S.pc.round === rd0 + 1 && S.pc.pend.length === 2, 'semua court selesai → ronde ' + S.pc.round + ' (2 tantangan memilih court)');
  const rset = (pg) => pg.waitForFunction((r) => { const e = document.querySelector('.pka.round.set'); return e && e.textContent.includes('Ronde ' + r); }, S.pc.round, { timeout: 45000, polling: 50 }).then(() => true, () => false);
  const [rA, rH] = await Promise.all([rset(ha), rset(hp2)]);
  if (rA) await ha.screenshot({ path: OUT + '/14-ipad-ronde.png' });
  if (rH) await hp2.screenshot({ path: OUT + '/15-hp-ronde.png' });
  const rinfoA = rA && await ha.evaluate(() => ({ n: document.querySelectorAll('.pka.round .pkr-list li').length, nums: [...document.querySelectorAll('.pka.round .no')].map((x) => x.textContent).join() }));
  ok(rA && rinfoA.n === 2 && rinfoA.nums === '1,2', 'iPad: animasi "Ronde ' + S.pc.round + '" + urutan memilih court diacak lalu berhenti (' + (rinfoA && rinfoA.n) + ' baris)');
  const rinfoH = rH && await hp2.evaluate(() => ({ me: !!document.querySelector('.pka.round li.me'), s: document.querySelector('.pkr-s').textContent }));
  ok(rH && rinfoH.me && /Timmu memilih court urutan ke-\d/.test(rinfoH.s), 'HP: animasi ronde, baris timku disorot — "' + (rinfoH && rinfoH.s) + '"');
  const rlog = await ha.evaluate(() => window.__pka.filter((x) => /round/.test(x.cls)).length);
  ok(rlog >= 1, 'animasi ronde tercatat di iPad (' + rlog + '×)');
  await ha.waitForSelector('.pka', { state: 'detached', timeout: 30000 }).catch(() => {});
  await act(token, sid, 'pcCourt', { all: true });
  const lit = await ha.waitForSelector('.court.pcpick .pc-picked', { timeout: 10000 }).then(() => true, () => false);
  await ha.waitForTimeout(500);
  if (lit) await ha.screenshot({ path: OUT + '/16-ipad-court-dipilih.png' });
  const litN = await ha.evaluate(() => document.querySelectorAll('.court.pcpick').length);
  ok(lit && litN === 2 && /memilih court ini/.test(await ha.textContent('.pc-picked')), 'iPad: court yang dipilih menyala + "… memilih court ini ±N" (' + litN + ' court)');
  await ha.waitForTimeout(3800);
  const faded = await ha.evaluate(() => [...document.querySelectorAll('.pc-picked')].every((e) => +getComputedStyle(e).opacity < 0.05));
  ok(faded, 'sorotan court & tulisan "memilih court ini" memudar sendiri setelah ±3 detik');

  step('Block / Reverse: animasi di iPad');
  await ha.waitForSelector('.pka', { state: 'detached', timeout: 20000 });
  const done = {};
  for (let r = 0; r < 60 && !(done.block && done.reverse && done.pick); r++) {
    let acted = false;
    S = await poll();
    if (S.pc.pend.length) await act(token, sid, 'pcCourt', { all: true });
    S = await poll();
    const hands = (await api('pcHand', { token, sid })).hands;
    if (!done.pick) for (const lm of Engine.liveMatches(S)) {
      // Pilih Lawan lewat tombol Kartu host: tim pilihan sudah di court lain (lawan sudah diacak), belum Game start
      const x = [lm.tA, lm.tB].find((t) => (hands[t] || []).some((c) => c.k === 'pick'));
      const other = Engine.liveMatches(S).find((o) => o.id !== lm.id && !(o.cards || []).length);
      if (!x || !other || (lm.cards || []).length) continue;
      const pk = hands[x].find((c) => c.k === 'pick'), opp0 = x === lm.tA ? lm.tB : lm.tA;
      await ha.waitForSelector('.pka', { state: 'detached', timeout: 60000 }).catch(() => {});
      await ha.click('.court[data-court="' + lm.court + '"] [data-act="pkManage"]');
      await ha.click('#modals [data-act="pkOpen"][data-card="' + pk.id + '"]');
      await ha.waitForSelector('#modals [data-pkt="' + other.tA + '"]', { timeout: 8000 });
      await ha.screenshot({ path: OUT + '/13-ipad-pilih-lawan.png' });
      await ha.click('#modals [data-pkt="' + other.tA + '"]');
      await ha.waitForTimeout(1000);
      const S2 = await poll(), a = Engine.findMatch(S2, lm.id), b = Engine.findMatch(S2, other.id);
      ok(a.tA === x && a.tB === other.tA && [b.tA, b.tB].sort().join() === [other.tB, opp0].sort().join(), 'iPad (host, tombol Kartu): Pilih Lawan ke tim yang sudah di court lain → lawan bertukar antar court');
      if (await ha.$('#modals .modal-wrap')) await ha.click('#modals .modal-wrap:last-child [data-act="close"]');
      done.pick = true; acted = true;
      break;
    }
    for (const lm of Engine.liveMatches(S)) {
      if ((lm.cards || []).length) continue;
      for (const [x, y] of [[lm.tA, lm.tB], [lm.tB, lm.tA]]) {
        const hy = hands[y] || [], hx = hands[x] || [];
        const blk = !done.block && hy.find((c) => c.k === 'block'), rev = !done.reverse && hy.find((c) => c.k === 'reverse');
        const def = blk || rev; if (!def) continue;
        const atk = hx.find((c) => ['nosmash', 'noglass'].includes(c.k) || (blk && ['free15', 'free30', 'golden', 'double', 'swap'].includes(c.k)));
        if (!atk || acted) continue;
        await ha.waitForSelector('.pka', { state: 'detached', timeout: 60000 });
        if (Engine.PC_CARDS[atk.k].when === 'pre' && x !== lm.pc.ch) { try { await act(token, sid, 'pcPass', { ref: lm.id, team: lm.pc.ch }); } catch (e) {} }
        try { await act(token, sid, 'pcCard', { card: atk.id, ref: lm.id, team: x }); } catch (e) { console.log('    (lewati: ' + e.message + ')'); continue; }
        await act(token, sid, 'pcResp', { card: def.id, of: atk.id, ref: lm.id, team: y });
        done[def.k] = { m: lm, atk, def, x, y }; acted = true;
        const want = def.k === 'block' ? 'DIBLOK!' : 'DIBALIK!';
        await ha.waitForFunction((w) => [...document.querySelectorAll('.pka-stamp')].some((s) => s.textContent === w && getComputedStyle(s).opacity > 0.9), want, { timeout: 30000 });
        await ha.waitForTimeout(300); await ha.screenshot({ path: OUT + '/10-ipad-' + def.k + '.png' });
        const cap = await ha.textContent('.pka-cap');
        ok(cap.includes((def.k === 'block' ? 'memblok ' : 'membalik ') + Engine.PC_CARDS[atk.k].name), 'iPad: animasi ' + def.k + ' — "' + cap.split('ketuk')[0].trim() + '"');
        await ha.waitForSelector('.pka', { state: 'detached', timeout: 20000 });
        const st = await ha.evaluate((a) => { const c = document.querySelector('.court[data-court="' + a.c + '"] .pkc[data-cid="' + a.atk + '"]'), d = document.querySelector('.court[data-court="' + a.c + '"] .pkc[data-cid="' + a.def + '"]');
          return { atk: c && c.querySelector('.pkc-st') && c.querySelector('.pkc-st').textContent, def: d && getComputedStyle(d).visibility, src: d && d.querySelector('img').getAttribute('src') }; }, { c: lm.court, atk: atk.id, def: def.id });
        ok(st.atk === (def.k === 'block' ? 'diblok' : 'dibalik') && st.def === 'visible' && st.src === 'img/cards/' + def.k + '.webp', 'court: kartu lawan bercap "' + st.atk + '", kartu ' + def.k + ' mendarat di sisi tim penjawab');
        if (def.k === 'block') await ha.screenshot({ path: OUT + '/11-ipad-court-diblok.png' });
        break;
      }
    }
    if (!acted) for (const lm of Engine.liveMatches(S)) {           // tidak ada skenario: tim memakai kartunya supaya dek berputar
      for (const x of [lm.pc.ch, lm.pc.ch === lm.tA ? lm.tB : lm.tA]) {
        const c = (hands[x] || []).find((k) => ['pre', 'game'].includes(Engine.PC_CARDS[k.k].when) && k.k !== 'swh');
        try { if (c) await act(token, sid, 'pcCard', { card: c.id, ref: lm.id, team: x }); else if (x === lm.pc.ch) await act(token, sid, 'pcPass', { ref: lm.id, team: x }); } catch (e) {}
      }
    }
    S = await poll();
    for (const lm of Engine.liveMatches(S)) { const aw = Math.random() < 0.5; await act(token, sid, 'score', { m: lm.id, a: aw ? 3 : 2, b: aw ? 2 : 3 }); }
    await drawAll(sid);
  }
  ok(!!done.pick, 'skenario Pilih Lawan ditemukan & diuji');
  ok(!!done.block, 'skenario Block ditemukan & diuji' + (done.reverse ? ' (Reverse juga)' : ' (Reverse tidak muncul di undian ini)'));
  await ha.waitForSelector('.pka', { state: 'detached', timeout: 30000 }).catch(() => {});
  const zl = (await ha.evaluate(() => window.__pka)).filter((x) => /zonk/.test(x.cls));
  console.log('    (info) animasi di iPad: ' + (await ha.evaluate(() => window.__pka.length)) + ', di antaranya Zonk ' + zl.length);

  step('HP pemain yang belum datang & cadangan');
  const hpH = await open({ width: 390, height: 844 }, await loginOf(pl[7]), 'hp-hana'); await toDash(hpH);
  await hpH.waitForSelector('.mystatus', { timeout: 10000 });
  ok(/Belum ditandai datang/.test(await hpH.textContent('.mystatus')), 'Hana: "Belum ditandai datang — tidak diundi" + tombol Saya sudah datang');
  await hpH.click('.mystatus [data-act="selfReady"]'); await hpH.waitForTimeout(800);
  S = await poll();
  ok(!S.parts[pl[7].id].paused && !S.parts[pl[7].id].absent, 'Hana menekan Saya sudah datang → aktif (menunggu dipasangkan host)');
  const hpJ = await open({ width: 390, height: 844 }, await loginOf(pl[9]), 'hp-joko'); await toDash(hpJ);
  await hpJ.waitForSelector('.mystatus', { timeout: 10000 });
  ok(/Cadangan/.test(await hpJ.textContent('.mystatus')), 'Joko: status Cadangan (waiting list)');
  await act(token, sid, 'end', {});
  const cer = await ha.waitForSelector('.cer canvas', { timeout: 15000 }).then(() => true, () => false);
  await ha.waitForTimeout(2600);
  if (cer) await ha.screenshot({ path: OUT + '/17-podium.png' });
  ok(cer, 'sesi selesai: podium Power Cup tampil di iPad');

  step('sesi biasa: yang belum datang tidak masuk putaran');
  const r2 = await api('createSession', { token, setup: { name: 'Americano Selasa', format: 'americano', hosts: [host.id], courts: [{ name: 'Court 1' }], playerIds: [], plan: { when: Date.now() + 3600e3, whenText: 'x', theme: 'court' } } });
  for (const p of pl.slice(0, 6)) await act(tok[p.id], r2.sid, 'rsvp', { on: true });
  for (const p of pl.slice(0, 5)) await act(tok[p.id], r2.sid, 'here', { on: true });
  await ha.goto(B + '/?lobby=' + r2.sid); await ha.waitForSelector('.lb-sprite', { timeout: 15000 }); await ha.waitForTimeout(800);
  await ha.click('[data-lb="start"]'); await ha.waitForSelector('.lb-modal');
  const mt = await ha.textContent('.lb-modal');
  ok(/Belum datang \(1\):\s*Fajar/.test(mt) && /Semua sudah datang/.test(mt), 'modal mulai: Fajar belum datang; pilihan "Semua sudah datang" / "Mulai tanpa mereka"');
  await ha.screenshot({ path: OUT + '/08-mulai-biasa.png' });
  await ha.click('.lb-modal [data-i="2"]');
  await ha.waitForTimeout(1500);
  S = await poll();
  const used = Engine.liveMatches(S).flatMap((x) => x.A.concat(x.B));
  ok(S.status === 'live' && S.parts[pl[5].id].absent && !used.includes(pl[5].id), 'Fajar tidak masuk putaran pertama');
  ok(errs.length === 0, 'tanpa error JS' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close();
})().catch((e) => { console.error(e); process.exitCode = 1; process.exit(1); });
