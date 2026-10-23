/* ============================================================
   Paddoc Host — mesin rotasi & klasemen
   Dipakai bersama oleh aplikasi (index.html) dan server (Cloudflare Worker).
   ============================================================ */
var Engine = (function () {
  'use strict';

  var COURT_COLORS = ['blue', 'orange', 'green', 'black'];
  function uid(p) {
    return (p || '') + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  }
  function now() { return Date.now(); }
  function pairKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }

  /* ---------- sesi baru ---------- */
  function newSession(o) {
    var pc = o.format === 'powercup';
    var S = {
      id: uid('s_'),
      name: o.name || 'Sesi Paddoc',
      date: new Date().toISOString(),
      status: 'live',
      format: pc ? 'powercup' : o.format === 'mexicano' ? 'mexicano' : 'americano',   // americano | mexicano | powercup
      teamMode: pc ? 'fixed' : o.teamMode || 'random',                               // random | fixed (Power Cup selalu pasangan tetap)
      // Power Cup: 5 game selalu dimainkan penuh, skor 15-30-40, 40-40 = poin penentu dimainkan
      scoring: pc ? { type: 'tennis', mode: 'total', n: 5 } : o.scoring || { type: 'points', mode: 'total', n: 21 },
      rules: Object.assign({ maxStreak: 2, catchUp: true, sortBy: 'wins', drawMode: 'rolling', deuce: 'golden' }, o.rules || {}, pc ? { sortBy: 'pc', drawMode: 'rolling', deuce: 'golden' } : {}),
      courts: (o.courts || []).map(function (c, i) {
        var v = Math.round(Number(c.value));
        return {
          id: c.id || uid('c_'), name: c.name || ('Court ' + (i + 1)), gender: pc ? 'mix' : c.gender || 'mix', active: c.active !== false,
          color: COURT_COLORS.indexOf(c.color) >= 0 ? c.color : 'blue', hostId: c.hostId || null,
          value: v >= 1 && v <= 9 ? v : pc ? i + 1 : null          // Power Cup: nilai court (menang +nilai, kalah −nilai)
        };
      }),
      parts: {},
      teams: [],
      matches: [],
      seq: 0
    };
    (o.playerIds || []).forEach(function (pid) {
      S.parts[pid] = { active: true, offset: 0, skips: 1, streak: 0, joinedAt: now() };
    });
    if (S.teamMode === 'fixed') {
      S.teams = (o.teams || []).map(function (t) { return { id: t.id || uid('t_'), a: t.a, b: t.b }; });
    }
    return S;
  }

  /* ---------- helper status ---------- */
  function liveMatches(S) { return S.matches.filter(function (m) { return m.status === 'live'; }); }
  function doneMatches(S) { return S.matches.filter(function (m) { return m.status === 'done'; }); }
  function matchPlayers(m) { return m.A.concat(m.B); }

  function busySet(S) {
    var b = {};
    liveMatches(S).forEach(function (m) { matchPlayers(m).forEach(function (p) { b[p] = 1; }); });
    return b;
  }
  function playedCount(S) {
    var c = {};
    S.matches.forEach(function (m) {
      if (m.status === 'void') return;
      matchPlayers(m).forEach(function (p) { c[p] = (c[p] || 0) + 1; });
    });
    return c;
  }
  function effGames(S, pid, played) {
    return (played[pid] || 0) + ((S.parts[pid] && S.parts[pid].offset) || 0);
  }
  function mustRest(S, pid) {
    var p = S.parts[pid];
    return !!p && p.streak >= S.rules.maxStreak && p.skips === 0;
  }
  /* ---------- match menunggu (cara mengundi 'wait', khusus Americano) ----------
     Court yang selesai boleh memilih maksimal 2 pemain yang masih bermain di court lain, kalau itu membuat
     jumlah main lebih rata dan mempertemukan pemain yang belum pernah bertemu. Match seperti itu "menunggu"
     (start = null): belum bisa diisi skor, dan otomatis mulai begitu semua pemainnya selesai di court lain. */
  var MAX_WAIT = 2;     // paling banyak 2 pemain yang ditunggu per match
  var WAIT_COST = 80;   // biaya per pemain yang ditunggu (bandingkan: 1 main lebih banyak = 100)
  var WAIT_MIN = 12;    // biaya per menit perkiraan sisa match yang ditunggu
  var MEET = 20;        // Americano: biaya bila dua pemain dalam satu match sudah pernah bertemu (partner/lawan)
  var MEET_REP = 2;     // tambahan per pertemuan berikutnya
  var WAIT_MAX_MIN = 6; // hanya menunggu match yang diperkirakan selesai dalam 6 menit
  function canWait(S) { return S.format !== 'mexicano' && !!S.rules && S.rules.drawMode === 'wait'; }
  function isWaiting(m) { return m.status === 'live' && !m.start; }
  /* pid -> match yang sedang benar-benar dimainkan */
  function playingMap(S) {
    var b = {};
    liveMatches(S).forEach(function (m) { if (m.start) matchPlayers(m).forEach(function (p) { b[p] = m; }); });
    return b;
  }
  /* pid -> match menunggu tempat pemain itu sudah dijadwalkan */
  function reservedMap(S) {
    var b = {};
    liveMatches(S).forEach(function (m) { if (!m.start) matchPlayers(m).forEach(function (p) { b[p] = m; }); });
    return b;
  }
  /* pemain di match menunggu yang masih bermain di court lain */
  function waitingFor(S, m) {
    if (!isWaiting(m)) return [];
    var pl = playingMap(S);
    return matchPlayers(m).filter(function (p) { return pl[p] && pl[p] !== m; });
  }
  /* mulai match menunggu yang semua pemainnya sudah bebas */
  function release(S) {
    var out = [];
    liveMatches(S).forEach(function (m) {
      if (isWaiting(m) && !waitingFor(S, m).length) { m.start = now(); out.push(m); }
    });
    return out;
  }
  function playingMatchOf(S, pid) { return playingMap(S)[pid] || null; }
  function nextMatchOf(S, pid) { return reservedMap(S)[pid] || null; }
  /* lama match biasa di sesi ini (median), untuk menaksir sisa waktu court lain */
  function typicalDuration(S) {
    var d = doneMatches(S).filter(function (m) { return (m.go || m.start) && m.end > (m.go || m.start); })
      .map(function (m) { return m.end - (m.go || m.start); }).sort(function (a, b) { return a - b; });
    var med = d.length ? d[Math.floor(d.length / 2)] : 12 * 60000;
    return Math.max(5 * 60000, Math.min(30 * 60000, med));
  }
  /* perkiraan sisa menit match yang sedang dimainkan (dihitung dari Game start bila ada) */
  function remaining(ctx, m) { return Math.max(0, ctx.dur - (ctx.now - (m.go || m.start))) / 60000; }
  function meetCost(st, a, b) {
    var k = pairKey(a, b), n = (st.partner[k] || 0) + (st.opp[k] || 0);
    return n ? MEET + MEET_REP * (n - 1) : 0;
  }

  function isAvailable(S, pid, busy) {
    var p = S.parts[pid];
    return !!p && p.active && !p.paused && !busy[pid];
  }
  function teamOf(S, pid) {
    for (var i = 0; i < S.teams.length; i++) {
      var t = S.teams[i];
      if (t.a === pid || t.b === pid) return t;
    }
    return null;
  }
  function teamActive(S, t) {
    return S.parts[t.a] && S.parts[t.b] && S.parts[t.a].active && S.parts[t.b].active;
  }
  function unpairedPlayers(S) {
    return Object.keys(S.parts).filter(function (pid) {
      if (!S.parts[pid].active) return false;
      var t = teamOf(S, pid);
      return !t || !teamActive(S, t);
    });
  }

  /* ---------- statistik ---------- */
  function stats(S) {
    var pl = {}, tm = {}, partner = {}, opp = {}, teamOpp = {};
    function P(id) {
      return pl[id] || (pl[id] = { id: id, played: 0, w: 0, d: 0, l: 0, pf: 0, pa: 0, pts: 0 });
    }
    function T(id) {
      return tm[id] || (tm[id] = { id: id, played: 0, w: 0, d: 0, l: 0, pf: 0, pa: 0, pts: 0 });
    }
    var pcv = isPC(S);
    Object.keys(S.parts).forEach(P);
    S.teams.forEach(function (t) { T(t.id); });
    S.matches.forEach(function (m) {
      if (m.status === 'void') return;
      // pertemuan dihitung sejak match dibuat (agar match live juga tercatat)
      partner[pairKey(m.A[0], m.A[1])] = (partner[pairKey(m.A[0], m.A[1])] || 0) + 1;
      partner[pairKey(m.B[0], m.B[1])] = (partner[pairKey(m.B[0], m.B[1])] || 0) + 1;
      m.A.forEach(function (a) { m.B.forEach(function (b) { opp[pairKey(a, b)] = (opp[pairKey(a, b)] || 0) + 1; }); });
      if (m.tA && m.tB) teamOpp[pairKey(m.tA, m.tB)] = (teamOpp[pairKey(m.tA, m.tB)] || 0) + 1;
      if (m.status !== 'done') return;
      var sides = [[m.A, m.sA, m.sB, m.tA], [m.B, m.sB, m.sA, m.tB]];
      sides.forEach(function (s) {
        var res = s[1] > s[2] ? 'w' : (s[1] < s[2] ? 'l' : 'd');
        s[0].forEach(function (pid) {
          var x = P(pid);
          x.played++; x[res]++; x.pf += s[1]; x.pa += s[2];
        });
        if (s[3]) {
          var t = T(s[3]);
          t.played++; t[res]++; t.pf += s[1]; t.pa += s[2];
        }
      });
    });
    function fin(x) { x.diff = x.pf - x.pa; x.avg = x.played ? x.pf / x.played : 0; }
    if (pcv) {                                                     // Power Cup: poin court tim (dengan efek kartu); pemain ikut timnya
      var pts = pcPoints(S);
      Object.keys(tm).forEach(function (k) { tm[k].pts = pts[k] || 0; });
      Object.keys(pl).forEach(function (k) { var tt = teamOf(S, k); pl[k].pts = tt ? pts[tt.id] || 0 : 0; });
    }
    Object.keys(pl).forEach(function (k) { fin(pl[k]); });
    Object.keys(tm).forEach(function (k) { fin(tm[k]); });
    return { players: pl, teams: tm, partner: partner, opp: opp, teamOpp: teamOpp };
  }

  function sorter(sortBy, nameOf) {
    return function (a, b) {
      // Power Cup: poin boleh minus, jadi tim yang belum main (0) tetap di atas tim minus
      if (sortBy !== 'pc' && (a.played > 0) !== (b.played > 0)) return a.played > 0 ? -1 : 1;
      var k;
      // utama: jumlah menang; sama → selisih poin (poin dapat − poin kebobolan, dijumlah tiap match)
      if (sortBy === 'pc') k = (b.pts - a.pts) || (b.diff - a.diff) || (b.w - a.w);      // Power Cup: poin court, lalu selisih game
      else if (sortBy === 'wins') k = (b.w - a.w) || (b.diff - a.diff) || (b.pf - a.pf);
      else if (sortBy === 'avg') k = (b.avg - a.avg) || (b.diff - a.diff) || (b.w - a.w);
      else k = (b.pf - a.pf) || (b.diff - a.diff) || (b.w - a.w);
      if (k) return k;
      return String(nameOf(a.id)).localeCompare(String(nameOf(b.id)));
    };
  }

  /* standings: unit 'player' | 'team'; group 'all' | 'L' | 'P' */
  function standings(S, players, opt) {
    opt = opt || {};
    var st = stats(S);
    var sortBy = isPC(S) ? 'pc' : opt.sortBy || S.rules.sortBy || 'wins';
    var nameOf = function (id) {
      if (opt.unit === 'team') {
        var t = S.teams.filter(function (x) { return x.id === id; })[0];
        return t ? ((players[t.a] || {}).name + ' & ' + (players[t.b] || {}).name) : id;
      }
      return (players[id] || {}).name || id;
    };
    var rows;
    if (opt.unit === 'team') {
      rows = S.teams.map(function (t) { return Object.assign({ team: t, active: teamActive(S, t) }, st.teams[t.id]); });
    } else {
      rows = Object.keys(S.parts).map(function (pid) {
        return Object.assign({ active: S.parts[pid].active }, st.players[pid]);
      }).filter(function (r) {
        if (!opt.group || opt.group === 'all') return true;
        return (players[r.id] || {}).gender === opt.group;
      });
    }
    rows.sort(sorter(sortBy, nameOf));
    rows.forEach(function (r, i) { r.rank = i + 1; });
    return rows;
  }

  /* ---------- kombinatorik ---------- */
  function combos(arr, k) {
    var out = [];
    (function rec(start, cur) {
      if (cur.length === k) { out.push(cur.slice()); return; }
      for (var i = start; i < arr.length; i++) { cur.push(arr[i]); rec(i + 1, cur); cur.pop(); }
    })(0, []);
    return out;
  }
  var SPLITS = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];

  /* ---------- pemilihan untuk satu court ---------- */
  function genderOf(players, pid) { return (players[pid] || {}).gender; }

  function pickRandomTeams(S, players, court, ctx) {
    var busy = ctx.busy, played = ctx.played, st = ctx.st;
    // mode 'wait': pemain yang sedang bermain di court lain (belum dijadwalkan di match menunggu) ikut jadi kandidat
    var wait = canWait(S) && !ctx.noWait;
    var avail = Object.keys(S.parts).filter(function (pid) {
      var p = S.parts[pid];
      if (!p || !p.active || p.paused) return false;
      // yang boleh ditunggu: sedang bermain di court lain, belum dijadwalkan lagi, dan match-nya hampir selesai
      if (busy[pid] && !(wait && ctx.playing[pid] && !ctx.reserved[pid] && remaining(ctx, ctx.playing[pid]) <= WAIT_MAX_MIN)) return false;
      if (court.gender === 'L' || court.gender === 'P') return genderOf(players, pid) === court.gender;
      return true;
    });
    var minFree = 4 - (wait ? MAX_WAIT : 0);
    var nFree = function (arr) { return arr.filter(function (pid) { return !busy[pid]; }).length; };
    if (avail.length < 4 || nFree(avail) < minFree) return null;
    // pemain yang sudah main beruntun wajib istirahat, kecuali pemain bebas tidak cukup
    // (aturan istirahat tidak boleh membuat court menunggu)
    var rested = avail.filter(function (pid) { return busy[pid] || !mustRest(S, pid); });
    if (nFree(rested) >= 4) avail = rested;

    var pri = {}, rem = {};
    avail.forEach(function (pid) {
      var p = S.parts[pid];
      pri[pid] = effGames(S, pid, played) * 100 - Math.min(p.skips, 6) * 8 + (mustRest(S, pid) ? 600 : 0) + Math.random() * 4;
      if (busy[pid]) rem[pid] = remaining(ctx, ctx.playing[pid]);
    });
    var sorted = avail.slice().sort(function (a, b) { return pri[a] - pri[b]; });
    var cand = sorted.slice(0, wait ? 12 : 10);
    var mixCourt = court.gender !== 'L' && court.gender !== 'P';
    var aL = avail.filter(function (p) { return genderOf(players, p) === 'L'; }).length;
    var aP = avail.length - aL;
    if (mixCourt) {
      ['L', 'P'].forEach(function (g) {
        sorted.filter(function (p) { return genderOf(players, p) === g; }).slice(0, 2).forEach(function (p) {
          if (cand.indexOf(p) < 0) cand.push(p);
        });
      });
    }

    var mex = S.format === 'mexicano' && ctx.hasResults;
    var rank = {};
    if (mex) {
      // peringkat di antara pemain yang sedang tersedia
      var order = ctx.rankOrder.filter(function (pid) { return avail.indexOf(pid) >= 0; });
      order.forEach(function (pid, i) { rank[pid] = i; });
    }
    var minPri = pri[sorted[0]];
    var best = null, bestCost = Infinity;

    var meet = S.format !== 'mexicano';
    combos(cand, 4).forEach(function (four) {
      var base = 0, nBusy = 0, remMax = 0;
      four.forEach(function (p) {
        base += pri[p] - minPri;
        if (busy[p]) { nBusy++; remMax = Math.max(remMax, rem[p]); }
      });
      if (nBusy > MAX_WAIT) return;
      if (nBusy) base += WAIT_COST * nBusy + WAIT_MIN * remMax;
      // Americano: utamakan empat pemain yang paling jarang bertemu (sebagai partner atau lawan)
      if (meet) for (var i = 0; i < 3; i++) for (var j = i + 1; j < 4; j++) base += meetCost(st, four[i], four[j]);
      if (base >= bestCost) return;
      var nL = four.filter(function (p) { return genderOf(players, p) === 'L'; }).length;
      var gCost = 0;
      if (mixCourt && aL >= 2 && aP >= 2) gCost += 70 * Math.abs(nL - 2);
      var spreadCost = 0, r4 = null;
      if (mex) {
        var rs = four.map(function (p) { return rank[p]; });
        spreadCost = 25 * (Math.max.apply(null, rs) - Math.min.apply(null, rs) - 3);
        r4 = four.slice().sort(function (a, b) { return rank[a] - rank[b]; });
      }
      SPLITS.forEach(function (sp) {
        var A = [four[sp[0][0]], four[sp[0][1]]], B = [four[sp[1][0]], four[sp[1][1]]];
        var c = base + gCost + spreadCost;
        if (mixCourt && nL === 2) {
          var mixed = genderOf(players, A[0]) !== genderOf(players, A[1]);
          if (!mixed) c += 400;
        }
        if (mex) {
          // 1+3 vs 2+4
          var ideal1 = [r4[0], r4[2]];
          var okSplit = (A.indexOf(ideal1[0]) >= 0 && A.indexOf(ideal1[1]) >= 0) ||
                        (B.indexOf(ideal1[0]) >= 0 && B.indexOf(ideal1[1]) >= 0);
          if (!okSplit) c += 150;
          c += 15 * ((st.partner[pairKey(A[0], A[1])] || 0) + (st.partner[pairKey(B[0], B[1])] || 0));
        } else {
          c += 50 * ((st.partner[pairKey(A[0], A[1])] || 0) + (st.partner[pairKey(B[0], B[1])] || 0));
          A.forEach(function (a) { B.forEach(function (b) { c += 12 * (st.opp[pairKey(a, b)] || 0); }); });
        }
        if (ctx.avoid && sameSet(ctx.avoid, A, B)) c += 300;
        c += Math.random() * 3;
        if (c < bestCost) { bestCost = c; best = { A: A, B: B }; }
      });
    });
    if (best && mex) {
      // tim berperingkat lebih tinggi di sisi A
      var ra = Math.min(rank[best.A[0]], rank[best.A[1]]), rb = Math.min(rank[best.B[0]], rank[best.B[1]]);
      if (rb < ra) best = { A: best.B, B: best.A };
    }
    return best;
  }

  function sameSet(prev, A, B) {
    function eq(x, y) { return pairKey(x[0], x[1]) === pairKey(y[0], y[1]); }
    return (eq(prev.A, A) && eq(prev.B, B)) || (eq(prev.A, B) && eq(prev.B, A));
  }

  function teamGender(players, t) {
    var g = [genderOf(players, t.a), genderOf(players, t.b)].sort().join('');
    return g; // 'LL' | 'LP' | 'PP'
  }

  function pickFixedTeams(S, players, court, ctx) {
    var busy = ctx.busy, played = ctx.played, st = ctx.st;
    var wait = canWait(S) && !ctx.noWait;
    var tBusy = function (t) { return !!(busy[t.a] || busy[t.b]); };
    var avail = S.teams.filter(function (t) {
      if (!teamActive(S, t)) return false;
      if (S.parts[t.a].paused || S.parts[t.b].paused) return false;
      // mode 'wait': satu pasangan boleh masih bermain di court lain
      var free = function (pid) { return !busy[pid] || (wait && ctx.playing[pid] && !ctx.reserved[pid] && remaining(ctx, ctx.playing[pid]) <= WAIT_MAX_MIN); };
      if (!free(t.a) || !free(t.b)) return false;
      var g = teamGender(players, t);
      if (court.gender === 'L') return g === 'LL';
      if (court.gender === 'P') return g === 'PP';
      return true;
    });
    var freeTeams = function (arr) { return arr.filter(function (t) { return !tBusy(t); }).length; };
    if (avail.length < 2 || freeTeams(avail) < 1) return null;
    var restedT = avail.filter(function (t) { return tBusy(t) || (!mustRest(S, t.a) && !mustRest(S, t.b)); });
    if (freeTeams(restedT) >= 2) avail = restedT;
    var pri = {}, rem = {};
    avail.forEach(function (t) {
      var e = Math.max(effGames(S, t.a, played), effGames(S, t.b, played));
      var sk = Math.min(S.parts[t.a].skips, S.parts[t.b].skips);
      pri[t.id] = e * 100 - Math.min(sk, 6) * 8 + ((mustRest(S, t.a) || mustRest(S, t.b)) ? 600 : 0) + Math.random() * 4;
      if (tBusy(t)) {
        rem[t.id] = remaining(ctx, ctx.playing[t.a] || ctx.playing[t.b]);
      }
    });
    var sorted = avail.slice().sort(function (a, b) { return pri[a.id] - pri[b.id]; });
    var cand = sorted.slice(0, 12);
    var mex = S.format === 'mexicano' && ctx.hasResults;
    var rank = {};
    if (mex) {
      ctx.teamRankOrder.filter(function (id) { return avail.some(function (t) { return t.id === id; }); })
        .forEach(function (id, i) { rank[id] = i; });
    }
    var mixCourt = court.gender !== 'L' && court.gender !== 'P';
    var minPri = pri[sorted[0].id];
    var best = null, bestCost = Infinity;
    combos(cand, 2).forEach(function (two) {
      var t1 = two[0], t2 = two[1];
      if (tBusy(t1) && tBusy(t2)) return; // paling banyak satu pasangan (2 pemain) yang ditunggu
      var c = pri[t1.id] - minPri + pri[t2.id] - minPri;
      [t1, t2].forEach(function (t) { if (tBusy(t)) c += WAIT_COST * 2 + WAIT_MIN * rem[t.id]; });
      if (mixCourt) {
        var g1 = teamGender(players, t1), g2 = teamGender(players, t2);
        if ((g1 === 'LL' && g2 === 'PP') || (g1 === 'PP' && g2 === 'LL')) c += 300;
        else if (g1 !== 'LP' || g2 !== 'LP') c += 40;
      }
      if (mex) c += 40 * (Math.abs(rank[t1.id] - rank[t2.id]) - 1);
      else c += 80 * (st.teamOpp[pairKey(t1.id, t2.id)] || 0);
      if (ctx.avoid && sameSet(ctx.avoid, [t1.a, t1.b], [t2.a, t2.b])) c += 300;
      c += Math.random() * 3;
      if (c < bestCost) { bestCost = c; best = [t1, t2]; }
    });
    if (!best) return null;
    if (mex && rank[best[1].id] < rank[best[0].id]) best = [best[1], best[0]];
    return { A: [best[0].a, best[0].b], B: [best[1].a, best[1].b], tA: best[0].id, tB: best[1].id };
  }

  function buildCtx(S, players) {
    var st = stats(S);
    var hasResults = doneMatches(S).length > 0;
    var ctx = {
      busy: busySet(S), played: playedCount(S), st: st, hasResults: hasResults,
      playing: playingMap(S), reserved: reservedMap(S), dur: typicalDuration(S), now: now()
    };
    if (S.format === 'mexicano' && hasResults) {
      ctx.rankOrder = standings(S, players, { sortBy: S.rules.sortBy }).map(function (r) { return r.id; });
      if (S.teamMode === 'fixed') {
        ctx.teamRankOrder = standings(S, players, { unit: 'team', sortBy: S.rules.sortBy }).map(function (r) { return r.id; });
      }
    }
    return ctx;
  }

  function commitMatch(S, court, pick, deferRest) {
    var chosen = pick.A.concat(pick.B);
    var busy = busySet(S);
    var snap = {};
    // pemain lain yang tersedia dihitung "istirahat satu giliran"
    if (!deferRest) Object.keys(S.parts).forEach(function (pid) {
      var p = S.parts[pid];
      if (!p.active || p.paused || busy[pid]) return;
      if (chosen.indexOf(pid) >= 0) return;
      p.skips++;
    });
    chosen.forEach(function (pid) {
      var p = S.parts[pid];
      snap[pid] = { skips: p.skips, streak: p.streak };
      applyChosen(S, pid);
    });
    S.seq++;
    var playing = playingMap(S);
    var m = {
      id: uid('m_'), no: S.seq, court: court.id,
      A: pick.A, B: pick.B, tA: pick.tA || null, tB: pick.tB || null,
      // ada pemain yang masih bermain di court lain: match menunggu, start diisi saat semuanya bebas
      sA: null, sB: null, status: 'live', start: chosen.some(function (p) { return playing[p]; }) ? null : now(), end: null, snap: snap
    };
    S.matches.push(m);
    return m;
  }
  function applyChosen(S, pid) {
    var p = S.parts[pid];
    var playedBefore = S.matches.some(function (m) { return m.status !== 'void' && matchPlayers(m).indexOf(pid) >= 0; });
    if (p.skips === 0 && playedBefore) p.streak++;
    else p.streak = 1;
    p.skips = 0;
  }

  function courtLive(S, courtId) {
    return S.matches.filter(function (m) { return m.status === 'live' && m.court === courtId; })[0] || null;
  }

  /* isi semua court aktif yang kosong. onlyCourt: id court tertentu */
  /* Mode undian:
     - 'rolling' : court yang selesai langsung diisi dari pemain yang sedang menunggu.
     - 'round'   : court yang selesai menunggu sampai semua court selesai, lalu semua court diundi
                   bersamaan dari seluruh pemain (lebih adil, semua bisa bertemu). force = undi sekarang. */
  function fillCourts(S, players, onlyCourt, force) {
    if (isPC(S)) return pcAdvance(S);
    var created = [];
    var roundMode = S.rules && S.rules.drawMode === 'round';
    var anyLive = liveMatches(S).length > 0;
    if (roundMode && anyLive && !force) return created;
    if (roundMode && !anyLive) onlyCourt = null; // ronde baru: semua court diundi bersamaan
    var order = S.courts.filter(function (c) {
      return c.active && !courtLive(S, c.id) && (!onlyCourt || c.id === onlyCourt);
    }).sort(function (a, b) {
      var ga = a.gender === 'mix' ? 1 : 0, gb = b.gender === 'mix' ? 1 : 0;
      return ga - gb;
    });
    if (!order.length) return created;
    if (roundMode && !anyLive) S.round = (S.round || 0) + 1;
    var ctx0 = buildCtx(S, players);
    var mexBlocks = roundMode && !anyLive && S.format === 'mexicano' && ctx0.hasResults &&
      order.every(function (c) { return c.gender !== 'L' && c.gender !== 'P'; });
    if (mexBlocks) {
      // Mexicano per ronde: peringkat 1-4 di court pertama, 5-8 di court kedua, dst.
      mexicanoRound(S, players, order, ctx0).forEach(function (x) { created.push(commitMatch(S, x.court, x.pick, true)); });
    } else {
      order.forEach(function (court) {
        var ctx = buildCtx(S, players);
        var pick = S.teamMode === 'fixed' ? pickFixedTeams(S, players, court, ctx) : pickRandomTeams(S, players, court, ctx);
        if (pick) created.push(commitMatch(S, court, pick, true));
      });
    }
    if (created.length) {
      var busy = busySet(S);
      Object.keys(S.parts).forEach(function (pid) {
        var p = S.parts[pid];
        if (p.active && !p.paused && !busy[pid]) p.skips++;
      });
      if (roundMode) created.forEach(function (m) { m.round = S.round || 1; });
    }
    return created;
  }

  function mexicanoRound(S, players, courts, ctx) {
    var busy = ctx.busy, played = ctx.played, out = [];
    function pri(pid) {
      var p = S.parts[pid];
      return effGames(S, pid, played) * 100 - Math.min(p.skips, 6) * 8 + (mustRest(S, pid) ? 600 : 0) + Math.random() * 4;
    }
    if (S.teamMode === 'fixed') {
      var teams = S.teams.filter(function (t) { return teamActive(S, t) && isAvailable(S, t.a, busy) && isAvailable(S, t.b, busy); });
      var tp = {}; teams.forEach(function (t) { tp[t.id] = Math.max(pri(t.a), pri(t.b)); });
      var nT = Math.min(courts.length * 2, teams.length - teams.length % 2);
      var chosenT = teams.sort(function (a, b) { return tp[a.id] - tp[b.id]; }).slice(0, nT);
      var tr = {}; ctx.teamRankOrder.forEach(function (id, i) { tr[id] = i; });
      chosenT.sort(function (a, b) { return tr[a.id] - tr[b.id]; });
      for (var i = 0; i + 1 < chosenT.length && out.length < courts.length; i += 2) {
        var t1 = chosenT[i], t2 = chosenT[i + 1];
        out.push({ court: courts[out.length], pick: { A: [t1.a, t1.b], B: [t2.a, t2.b], tA: t1.id, tB: t2.id } });
      }
      return out;
    }
    var avail = Object.keys(S.parts).filter(function (pid) { return isAvailable(S, pid, busy); });
    var rested = avail.filter(function (pid) { return !mustRest(S, pid); });
    var need = courts.length * 4;
    if (rested.length >= Math.min(need, avail.length - avail.length % 4)) avail = rested.length >= 4 ? rested : avail;
    var pv = {}; avail.forEach(function (pid) { pv[pid] = pri(pid); });
    var n = Math.min(need, avail.length - avail.length % 4);
    var chosen = avail.sort(function (a, b) { return pv[a] - pv[b]; }).slice(0, n);
    var rk = {}; ctx.rankOrder.forEach(function (id, i) { rk[id] = i; });
    chosen.sort(function (a, b) { return rk[a] - rk[b]; });
    for (var j = 0; j + 3 < chosen.length; j += 4) {
      var f = chosen.slice(j, j + 4); // urutan peringkat: 1+3 lawan 2+4
      out.push({ court: courts[out.length], pick: { A: [f[0], f[2]], B: [f[1], f[3]] } });
    }
    return out;
  }

  function findMatch(S, id) { return S.matches.filter(function (m) { return m.id === id; })[0]; }

  function restoreSnap(S, m, pid, extraSkip) {
    var p = S.parts[pid];
    if (!p) return;
    if (m.snap && m.snap[pid]) { p.skips = m.snap[pid].skips; p.streak = m.snap[pid].streak; }
    if (extraSkip) p.skips++;
  }

  function voidMatch(S, id) {
    var m = findMatch(S, id);
    if (!m || m.status !== 'live') return;
    if (isPC(S)) pcVoid(S, m);
    m.status = 'void';
    matchPlayers(m).forEach(function (pid) { restoreSnap(S, m, pid, false); });
    release(S);
  }

  /* acak ulang satu court, hindari susunan yang sama */
  function reshuffle(S, players, id) {
    var m = findMatch(S, id);
    if (!m || m.status !== 'live' || isPC(S)) return null;      // Power Cup: batalkan match, lalu penantang mengundi ulang
    var prev = { A: m.A.slice(), B: m.B.slice() };
    voidMatch(S, id);
    S.matches = S.matches.filter(function (x) { return x.id !== id; });
    S.seq--;
    var court = S.courts.filter(function (c) { return c.id === m.court; })[0];
    var ctx = buildCtx(S, players);
    ctx.avoid = prev;
    var pick = S.teamMode === 'fixed' ? pickFixedTeams(S, players, court, ctx) : pickRandomTeams(S, players, court, ctx);
    if (!pick) return null;
    var nm = commitMatch(S, court, pick);
    release(S);
    return nm;
  }

  function swapPlayer(S, id, outId, inId) {
    var m = findMatch(S, id);
    if (!m || m.status !== 'live') return;
    var arr = m.A.indexOf(outId) >= 0 ? m.A : m.B;
    var inArr = m.A.indexOf(inId) >= 0 ? m.A : (m.B.indexOf(inId) >= 0 ? m.B : null);
    if (inArr) {
      // tukar posisi dua pemain di court yang sama
      var i1 = arr.indexOf(outId), i2 = inArr.indexOf(inId);
      arr[i1] = inId; inArr[i2] = outId;
      m.tA = m.tB = m.tA && null;
      return;
    }
    // pemain yang masih bermain di court lain tidak dihitung istirahat
    var stillPlaying = (playingMap(S)[outId] || m) !== m;
    arr[arr.indexOf(outId)] = inId;
    restoreSnap(S, m, outId, !stillPlaying);
    delete m.snap[outId];
    var p = S.parts[inId];
    m.snap[inId] = { skips: p.skips, streak: p.streak };
    applyChosen(S, inId);
    if (S.teamMode === 'fixed') {
      var tA = teamOf(S, m.A[0]), tB = teamOf(S, m.B[0]);
      m.tA = tA && (tA.a === m.A[1] || tA.b === m.A[1]) ? tA.id : null;
      m.tB = tB && (tB.a === m.B[1] || tB.b === m.B[1]) ? tB.id : null;
    }
    release(S);
  }

  /* fixed: ganti satu tim penuh */
  function swapTeam(S, id, side, teamId) {
    var m = findMatch(S, id);
    if (!m || m.status !== 'live') return;
    var t = S.teams.filter(function (x) { return x.id === teamId; })[0];
    if (!t) return;
    var old = side === 'A' ? m.A : m.B, pl = playingMap(S);
    old.forEach(function (pid) { restoreSnap(S, m, pid, (pl[pid] || m) === m); delete m.snap[pid]; });
    [t.a, t.b].forEach(function (pid) {
      var p = S.parts[pid];
      m.snap[pid] = { skips: p.skips, streak: p.streak };
      applyChosen(S, pid);
    });
    if (side === 'A') { m.A = [t.a, t.b]; m.tA = t.id; } else { m.B = [t.a, t.b]; m.tB = t.id; }
    release(S);
  }

  /* host tidak mau menunggu: pemain yang masih bermain di court lain diganti pemain terbaik yang sedang menunggu */
  function freeWaiting(S, players, id) {
    var m = findMatch(S, id), out = { replaced: [], missing: [] };
    if (!m || !isWaiting(m)) return out;
    var court = S.courts.filter(function (c) { return c.id === m.court; })[0] || { gender: 'mix' };
    var single = court.gender === 'L' || court.gender === 'P';
    if (S.teamMode === 'fixed') {
      ['A', 'B'].forEach(function (side) {
        var ids = (side === 'A' ? m.A : m.B).slice();
        if (!waitingFor(S, m).some(function (p) { return ids.indexOf(p) >= 0; })) return;
        var ctx = buildCtx(S, players), other = side === 'A' ? m.tB : m.tA;
        var best = null, bc = Infinity;
        S.teams.forEach(function (t) {
          if (!teamActive(S, t) || !isAvailable(S, t.a, ctx.busy) || !isAvailable(S, t.b, ctx.busy)) return;
          var g = teamGender(players, t);
          if ((court.gender === 'L' && g !== 'LL') || (court.gender === 'P' && g !== 'PP')) return;
          var c = Math.max(effGames(S, t.a, ctx.played), effGames(S, t.b, ctx.played)) * 100 +
            ((mustRest(S, t.a) || mustRest(S, t.b)) ? 600 : 0) + (other ? 80 * (ctx.st.teamOpp[pairKey(t.id, other)] || 0) : 0);
          if (c < bc) { bc = c; best = t; }
        });
        if (best) { swapTeam(S, m.id, side, best.id); out.replaced.push(ids); } else out.missing = out.missing.concat(ids);
      });
    } else {
      waitingFor(S, m).forEach(function (pid) {
        var ctx = buildCtx(S, players), st = ctx.st;
        var others = matchPlayers(m).filter(function (x) { return x !== pid; });
        var side = m.A.indexOf(pid) >= 0 ? m.A : m.B, mate = side[0] === pid ? side[1] : side[0];
        var best = null, bc = Infinity;
        Object.keys(S.parts).forEach(function (cand) {
          if (!isAvailable(S, cand, ctx.busy)) return;
          if (single && genderOf(players, cand) !== court.gender) return;
          var p = S.parts[cand];
          var c = effGames(S, cand, ctx.played) * 100 - Math.min(p.skips, 6) * 8 + (mustRest(S, cand) ? 600 : 0);
          if (!single && genderOf(players, cand) !== genderOf(players, pid)) c += 400; // jaga susunan putra/putri
          others.forEach(function (o) { c += meetCost(st, cand, o); });
          c += 50 * (st.partner[pairKey(cand, mate)] || 0);
          if (c < bc) { bc = c; best = cand; }
        });
        if (best) { swapPlayer(S, m.id, pid, best); out.replaced.push([pid, best]); } else out.missing.push(pid);
      });
    }
    release(S);
    return out;
  }

  function submitScore(S, id, a, b) {
    var m = findMatch(S, id);
    if (!m) return;
    m.sA = a; m.sB = b;
    var first = m.status === 'live';
    if (first) {
      m.status = 'done'; m.end = now();
      if (!m.start) m.start = m.end; // skor dipaksa sebelum match menunggu sempat mulai
    }
    if (isPC(S) && m.status === 'done') pcResult(S, m, first);
    return release(S);
  }

  function validateScore(S, a, b) {
    var sc = S.scoring, n = sc.n;
    if (!(a >= 0 && b >= 0) || isNaN(a) || isNaN(b)) return { ok: false, msg: 'Skor belum diisi.' };
    if (sc.mode === 'total') {
      if (a + b !== n) return { ok: false, msg: 'Jumlah skor harus ' + n + ' (sekarang ' + (a + b) + ').' };
    } else {
      if (Math.max(a, b) !== n || Math.min(a, b) >= n) return { ok: false, msg: 'Salah satu tim harus tepat ' + n + '.' };
    }
    return { ok: true };
  }

  function addParticipant(S, pid, catchUp) {
    var played = playedCount(S);
    var p = S.parts[pid];
    var others = Object.keys(S.parts).filter(function (x) { return x !== pid && S.parts[x].active; });
    var minEff = others.length ? Math.min.apply(null, others.map(function (x) { return effGames(S, x, played); })) : 0;
    if (!p) {
      p = S.parts[pid] = { active: true, offset: 0, skips: 1, streak: 0, joinedAt: now() };
    } else {
      p.active = true; p.paused = false; p.skips = Math.max(p.skips, 1); p.streak = 0;
    }
    var mine = played[pid] || 0;
    if (!catchUp) p.offset = Math.max(0, minEff - mine);
    else p.offset = Math.min(p.offset || 0, 0);
    p.joinedLate = S.seq > 0;
  }

  function removeParticipant(S, pid) {
    var p = S.parts[pid];
    if (!p) return;
    p.active = false;
    p.leftAt = now();
  }

  function scoringLabel(sc) {
    var unit = sc.type === 'tennis' ? 'game' : 'poin';
    return (sc.mode === 'race' ? 'Race to ' + sc.n : 'Total ' + sc.n) + ' ' + unit;
  }

  /* ---------- hitung skor langsung oleh host ----------
     m.tally = urutan poin yang dimenangkan ('A' / 'B'). Keadaan skor selalu dihitung ulang dari urutan itu,
     jadi tombol batal cukup membuang poin terakhir. Tenis/padel: 0-15-30-40-game; deuce memakai golden point
     (poin berikutnya menang) atau advantage (harus unggul 2), sesuai S.rules.deuce. */
  var TENNIS_PTS = ['0', '15', '30', '40'];
  function tallyState(S, m) {
    var h = m.tally || [], sc = S.scoring || {}, n = sc.n || 21, race = sc.mode === 'race';
    if (sc.type !== 'tennis') {
      var a = 0, b = 0;
      h.forEach(function (x) { if (x === 'A') a++; else if (x === 'B') b++; });
      return { a: a, b: b, done: race ? Math.max(a, b) >= n : a + b >= n, n: h.length };
    }
    var adv = S.rules && S.rules.deuce === 'adv', cards = m.cards || [];
    // Power Cup: Free 15 / Free 30 = skor awal tiap game, Golden Point = 40-40 langsung untuk pemegang (keduanya → batal)
    var on = function (k, t) { return !!t && cards.some(function (c) { return c.k === k && c.by === t && c.st === 'on'; }); };
    var sA = (on('free15', m.tA) ? 1 : 0) + (on('free30', m.tA) ? 2 : 0), sB = (on('free15', m.tB) ? 1 : 0) + (on('free30', m.tB) ? 2 : 0);
    var gA = on('golden', m.tA), gB = on('golden', m.tB);
    if (gA && gB) gA = gB = false;
    var ga = 0, gb = 0, pa = sA, pb = sB;
    h.forEach(function (x) {
      if (x === 'A') pa++;
      else if (x === 'B') pb++;
      else {                                                       // 'S:<kartu>' = Ambil Semua Poin
        var c = cards.filter(function (q) { return 'S:' + q.id === x; })[0], byA = c && c.by === m.tA;
        if (c && c.st === 'on') { if (byA) { pa = pb; pb = 0; } else { pb = pa; pa = 0; } }
        else if (c && c.st === 'reversed') { if (byA) pa = 0; else pb = 0; }
        return;
      }
      var lead = pa - pb;
      if (adv ? (pa >= 4 && lead >= 2) : pa >= 4) { ga++; pa = sA; pb = sB; }
      else if (adv ? (pb >= 4 && lead <= -2) : pb >= 4) { gb++; pa = sA; pb = sB; }
      else if (pa === 3 && pb === 3 && (gA || gB)) { if (gA) ga++; else gb++; pa = sA; pb = sB; }
    });
    var la, lb;
    if (pa >= 3 && pb >= 3) {
      if (pa === pb) { la = lb = '40'; } else { la = pa > pb ? 'AD' : '40'; lb = pb > pa ? 'AD' : '40'; }
    } else { la = TENNIS_PTS[Math.min(pa, 3)]; lb = TENNIS_PTS[Math.min(pb, 3)]; }
    return {
      a: ga, b: gb, pa: la, pb: lb, deuce: pa >= 3 && pb >= 3 && pa === pb, golden: !adv,
      done: race ? Math.max(ga, gb) >= n : ga + gb >= n, n: h.length
    };
  }
  /* host menambah poin (side 'A'/'B') atau membatalkan poin terakhir (undo) */
  function tally(S, id, side, undo) {
    var m = findMatch(S, id);
    if (!m || m.status !== 'live' || !m.start) return null;
    m.tally = m.tally || [];
    if (undo) { for (var i = m.tally.length - 1; i >= 0; i--) if (m.tally[i] === 'A' || m.tally[i] === 'B') { m.tally.splice(i, 1); break; } }   // kartu Ambil Semua Poin tidak ikut terhapus
    else if ((side === 'A' || side === 'B') && !tallyState(S, m).done) {
      if (!m.go) m.go = now(); // poin pertama dianggap Game start
      m.tally.push(side);
    }
    return tallyState(S, m);
  }

  /* ---------- tukar pemain dengan court lain yang belum mulai (Game start) ---------- */
  function startedSet(S) {
    var b = {};
    liveMatches(S).forEach(function (m) { if (m.go) matchPlayers(m).forEach(function (p) { b[p] = 1; }); });
    return b;
  }
  /* pemain/tim di court lain yang boleh ditukar: match-nya belum mulai dan pemainnya tidak sedang bertanding */
  function swapCandidates(S, id) {
    var started = startedSet(S), out = [];
    liveMatches(S).forEach(function (m) {
      if (m.id === id || m.go) return;
      matchPlayers(m).forEach(function (p) { if (!started[p]) out.push({ pid: p, m: m }); });
    });
    return out;
  }
  function swapAcross(S, id1, outId, id2, inId) {
    var m1 = findMatch(S, id1), m2 = findMatch(S, id2);
    if (!m1 || !m2 || m1 === m2 || m1.status !== 'live' || m2.status !== 'live' || m1.go || m2.go) return false;
    var a1 = m1.A.indexOf(outId) >= 0 ? m1.A : m1.B, a2 = m2.A.indexOf(inId) >= 0 ? m2.A : m2.B;
    if (a1.indexOf(outId) < 0 || a2.indexOf(inId) < 0) return false;
    if (matchPlayers(m1).indexOf(inId) >= 0 || matchPlayers(m2).indexOf(outId) >= 0) return false;
    a1[a1.indexOf(outId)] = inId; a2[a2.indexOf(inId)] = outId;
    var s1 = m1.snap[outId], s2 = m2.snap[inId];
    delete m1.snap[outId]; delete m2.snap[inId];
    m1.snap[inId] = s2; m2.snap[outId] = s1;
    [m1, m2].forEach(function (m) {
      if (S.teamMode !== 'fixed') { m.tA = m.tB = null; return; }
      var tA = teamOf(S, m.A[0]), tB = teamOf(S, m.B[0]);
      m.tA = tA && (tA.a === m.A[1] || tA.b === m.A[1]) ? tA.id : null;
      m.tB = tB && (tB.a === m.B[1] || tB.b === m.B[1]) ? tB.id : null;
    });
    release(S);
    return true;
  }
  /* pasangan tetap: tukar satu tim antar court */
  function swapTeamAcross(S, id1, side1, id2, side2) {
    var m1 = findMatch(S, id1), m2 = findMatch(S, id2);
    if (!m1 || !m2 || m1 === m2 || m1.go || m2.go) return false;
    var t1 = (side1 === 'A' ? m1.A : m1.B).slice(), t2 = (side2 === 'A' ? m2.A : m2.B).slice();
    return swapAcross(S, id1, t1[0], id2, t2[0]) && swapAcross(S, id1, t1[1], id2, t2[1]);
  }

  /* daftar tunggu: pemain aktif yang tidak sedang main, urut prioritas */
  function bench(S) {
    var busy = busySet(S), played = playedCount(S);
    return Object.keys(S.parts).filter(function (pid) { return isAvailable(S, pid, busy); })
      .map(function (pid) {
        return { id: pid, eff: effGames(S, pid, played), played: played[pid] || 0, skips: S.parts[pid].skips, rest: mustRest(S, pid) };
      })
      .sort(function (a, b) { return (a.eff - b.eff) || (b.skips - a.skips); });
  }


  /* ============================================================
     POWER CUP: pasangan tetap (level atas + bawah), nilai court ±1..±6, 5 game selalu dimainkan penuh.
     Pemain = court × 4, jadi dimainkan per RONDE: semua tim main bersamaan, ronde berikutnya diundi setelah semua
     court selesai. Lawan diundi acak dengan rotasi (yang belum pernah bertemu didahulukan; bila sama, tim kalah
     bertemu tim menang). Penantang = tim yang kalah di match terakhirnya (ronde pertama acak). Urutan memilih court
     dikocok; penantang memilih court (siapa berani court bernilai besar); court terakhir yang tersisa otomatis.
     Kartu power: tim kalah mengambil 1 kartu (maks 2 di tangan, Zonk langsung dibuang); maks 1 kartu per tim per
     match; Block membatalkan kartu lawan, Reverse membalik No Smash / No Glass / Switch Hand / Ambil Semua Poin.
     S.pc = { lv, round, pend: [{ id, ch, op, rd, cards }], cd: { deck, disc, hand: { tim: [kartu] }, hv: { tim: n } } }
     m.cards = [{ id, k, by, tg, st: 'on' | 'blocked' | 'reversed', n0, g, pid, of }]
     ============================================================ */
  // when: pre = sebelum match dimulai, game = sebelum servis sebuah game (berlaku 2 game), live = saat game berjalan,
  // draw = saat undian lawan (sebelum dapat court), resp = menjawab kartu lawan
  var PC_CARDS = {
    free15: { n: 3, name: 'Free 15', cat: 'self', when: 'pre' },
    free30: { n: 1, name: 'Free 30', cat: 'self', when: 'pre' },
    golden: { n: 2, name: 'Golden Point', cat: 'self', when: 'pre' },
    double: { n: 2, name: 'Double Point', cat: 'self', when: 'pre' },
    pick: { n: 2, name: 'Pilih Lawan', cat: 'ctrl', when: 'draw' },
    nosmash: { n: 2, name: 'No Smash', cat: 'ctrl', when: 'game', rev: 1, dur: 2 },
    noglass: { n: 2, name: 'No Glass', cat: 'ctrl', when: 'game', rev: 1, dur: 2 },
    swh: { n: 2, name: 'Switch Hand', cat: 'ctrl', when: 'game', rev: 1, dur: 2 },
    steal: { n: 1, name: 'Ambil Semua Poin', cat: 'rare', when: 'live', rev: 1 },
    swap: { n: 1, name: 'Tukar Ranking', cat: 'rare', when: 'pre' },
    block: { n: 3, name: 'Block', cat: 'def', when: 'resp' },
    reverse: { n: 1, name: 'Reverse', cat: 'def', when: 'resp' },
    zonk: { n: 6, name: 'Zonk', cat: 'zonk', when: 'none' }
  };
  function isPC(S) { return !!S && S.format === 'powercup'; }
  function courtValue(S, c) {
    if (!c) return 1;
    var v = Math.round(Number(c.value));
    if (v >= 1 && v <= 9) return v;
    var i = S.courts.indexOf(c);
    return i >= 0 ? i + 1 : 1;
  }
  function teamById(S, id) { return S.teams.filter(function (t) { return t.id === id; })[0] || null; }
  function pcFree(S, id) {                      // tim bisa diundi: aktif & tidak sedang "belum siap"
    var t = teamById(S, id);
    return !!t && teamActive(S, t) && !S.parts[t.a].paused && !S.parts[t.b].paused;
  }
  function shuffled(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
  function pcDeck() {
    var deck = [];
    Object.keys(PC_CARDS).forEach(function (k) { for (var i = 0; i < PC_CARDS[k].n; i++) deck.push({ id: uid('k_'), k: k }); });
    return { deck: shuffled(deck), disc: [], hand: {}, hv: {} };
  }
  function pcState(S) {
    var pc = S.pc || (S.pc = {});
    pc.lv = pc.lv || {}; pc.round = pc.round || 0; pc.pend = pc.pend || [];
    if (!pc.cd || !pc.cd.deck) pc.cd = pcDeck();
    return pc;
  }
  function pcInit(S) {
    S.pc = { lv: (S.pc && S.pc.lv) || {}, round: 0, pend: [], cd: pcDeck() };
  }
  function pcHandOf(S, tid) { var cd = pcState(S).cd; return cd.hand[tid] || (cd.hand[tid] = []); }
  /* jumlah kartu di tangan (data publik hanya berisi jumlah) */
  function pcHandCount(S, tid) { var h = S.pc && S.pc.cd && S.pc.cd.hand && S.pc.cd.hand[tid]; return typeof h === 'number' ? h : h ? h.length : 0; }
  function pcBump(S, tid) { var cd = S.pc.cd; cd.hv[tid] = (cd.hv[tid] || 0) + 1; }
  function pcDrawOne(S) {
    var cd = S.pc.cd;
    if (!cd.deck.length) { cd.deck = shuffled(cd.disc); cd.disc = []; }       // tumpukan habis: tumpukan buang dikocok ulang
    return cd.deck.pop() || null;
  }
  /* kartu yang sudah dipakai kembali ke tangan pemakainya (match dibatalkan / tantangan batal) */
  function pcReturn(S, list) {
    (list || []).forEach(function (c) { if (c.id && c.by && PC_CARDS[c.k]) { pcHandOf(S, c.by).push({ id: c.id, k: c.k }); pcBump(S, c.by); } });
  }
  function tallyPts(m) { return (m.tally || []).filter(function (x) { return x === 'A' || x === 'B'; }).length; }
  function pcLastRes(S, tid) {
    var last = null;
    S.matches.forEach(function (m) {
      if (m.status === 'done' && (m.tA === tid || m.tB === tid) && m.sA !== m.sB && (!last || (m.end || 0) > (last.end || 0) || ((m.end || 0) === (last.end || 0) && m.no > last.no))) last = m;
    });
    return last ? ((last.sA > last.sB) === (last.tA === tid) ? 'w' : 'l') : null;
  }
  function teamLive(S) { var b = {}; liveMatches(S).forEach(function (m) { if (m.tA) b[m.tA] = 1; if (m.tB) b[m.tB] = 1; }); return b; }
  /* lawan ronde berikutnya: pasangan dengan biaya terkecil (bertemu lagi mahal, sesama kalah/sesama menang sedikit),
     diacak bila sama; dicari menyeluruh (maks 12 tim = 10.395 kemungkinan, dipangkas) */
  function pcPairs(S, ids) {
    var opp = stats(S).teamOpp, res = {}, C = {};
    ids.forEach(function (id) { res[id] = pcLastRes(S, id); });
    ids.forEach(function (a) { ids.forEach(function (b) { if (a < b) C[a + '|' + b] = (opp[pairKey(a, b)] || 0) * 100 + (res[a] && res[a] === res[b] ? 3 : 0) + Math.random(); }); });
    var cost = function (a, b) { return C[a < b ? a + '|' + b : b + '|' + a]; };
    var order = shuffled(ids), best = null, bestC = Infinity, cur = [];
    if (order.length > 14) {                    // tidak terjadi (maks 6 court), cadangan: rakus
      var left = order.slice(), out = [];
      while (left.length >= 2) { var a0 = left.shift(), bi = 0; left.forEach(function (b, i) { if (cost(a0, b) < cost(a0, left[bi])) bi = i; }); out.push([a0, left.splice(bi, 1)[0]]); }
      return out;
    }
    (function rec(rest, c) {
      if (c >= bestC) return;
      if (!rest.length) { bestC = c; best = cur.slice(); return; }
      for (var i = 1; i < rest.length; i++) {
        cur.push([rest[0], rest[i]]);
        rec(rest.slice(1, i).concat(rest.slice(i + 1)), c + cost(rest[0], rest[i]));
        cur.pop();
      }
    })(order, 0);
    return best || [];
  }
  /* jadwal round-robin (metode lingkaran) dari urutan tim yang diacak: n tim → n−1 ronde, tiap tim bertemu semua tim
     lain tepat sekali (tim ganjil: satu tim istirahat bergiliran). Ronde dari jadwal dipakai dalam urutan acak. */
  function pcSchedule(ids) {
    var o = shuffled(ids), rounds = [];
    if (o.length % 2) o.push(null);
    var n = o.length;
    for (var r = 0; r < n - 1; r++) {
      var pr = [];
      for (var i = 0; i < n / 2; i++) { var a = o[i], b = o[n - 1 - i]; if (a && b) pr.push([a, b]); }
      rounds.push(pr);
      o.splice(1, 0, o.pop());                                    // putar semua kecuali tim pertama
    }
    return { ids: ids.slice().sort(), rounds: rounds };
  }
  /* lawan ronde berikutnya: ronde jadwal yang belum dipakai & semua timnya siap (yang paling sedikit pertemuan ulang,
     lalu yang paling banyak tim kalah vs tim menang, acak bila sama); tidak ada yang cocok (tim berubah / ada yang
     belum siap) → undian dengan biaya pertemuan ulang terkecil */
  function pcRoundPairs(S, ids, k) {
    var pc = S.pc, all = S.teams.filter(function (t) { return teamActive(S, t); }).map(function (t) { return t.id; }).sort();
    if (!pc.rr || pc.rr.ids.join() !== all.join() || !pc.rr.rounds.length) pc.rr = pcSchedule(all);
    var opp = stats(S).teamOpp, res = {}, ok = {}, best = null, bestC = Infinity;
    ids.forEach(function (id) { ok[id] = 1; res[id] = pcLastRes(S, id); });
    pc.rr.rounds.forEach(function (pr, i) {
      if (pr.length > k || !pr.every(function (x) { return ok[x[0]] && ok[x[1]]; })) return;
      var c = Math.random();
      pr.forEach(function (x) { c += (opp[pairKey(x[0], x[1])] || 0) * 100 + (res[x[0]] && res[x[0]] === res[x[1]] ? 3 : 0); });
      if (c < bestC) { bestC = c; best = i; }
    });
    if (best !== null && bestC < 100) return pc.rr.rounds.splice(best, 1)[0];
    if (ids.length > 2 * k) {                                      // tim lebih banyak dari court: yang paling sedikit main ikut lebih dulu
      var pl = {};
      S.matches.forEach(function (m) { if (m.status !== 'void') [m.tA, m.tB].forEach(function (t) { if (t) pl[t] = (pl[t] || 0) + 1; }); });
      ids = shuffled(ids).sort(function (a, b) { return (pl[a] || 0) - (pl[b] || 0); }).slice(0, 2 * k);
    }
    return pcPairs(S, ids);
  }
  /* ronde baru: lawan dari jadwal rotasi, penantang = yang kalah di match terakhirnya, urutan memilih court dikocok */
  function pcNewRound(S) {
    var pc = S.pc;
    var ids = S.teams.filter(function (t) { return pcFree(S, t.id); }).map(function (t) { return t.id; });
    var k = Math.min(S.courts.filter(function (c) { return c.active; }).length, Math.floor(ids.length / 2));
    if (k < 1) return false;
    var pairs = pcRoundPairs(S, ids, k);
    if (!pairs.length) return false;
    pc.round++;
    pc.pend = shuffled(pairs).map(function (x) {
      var ra = pcLastRes(S, x[0]), rb = pcLastRes(S, x[1]);
      var ch = ra === 'l' && rb !== 'l' ? x[0] : rb === 'l' && ra !== 'l' ? x[1] : Math.random() < 0.5 ? x[0] : x[1];
      return { id: uid('d_'), ch: ch, op: ch === x[0] ? x[1] : x[0], rd: pc.round, cards: [] };
    });
    return true;
  }
  /* tantangan yang timnya tidak bisa main lagi dibatalkan; kartunya kembali ke tangan */
  function pcSync(S) {
    var pc = pcState(S), live = teamLive(S);
    pc.pend = pc.pend.filter(function (p) {
      var ok = pcFree(S, p.ch) && pcFree(S, p.op) && !live[p.ch] && !live[p.op];
      if (!ok) pcReturn(S, p.cards);
      return ok;
    });
  }
  function pcStart(S, p, court) {
    var tc = teamById(S, p.ch), to = teamById(S, p.op);
    S.pc.pend = S.pc.pend.filter(function (x) { return x !== p; });
    var m = commitMatch(S, court, { A: [tc.a, tc.b], B: [to.a, to.b], tA: tc.id, tB: to.id }, true);
    m.val = courtValue(S, court);
    m.pc = { ch: p.ch, op: p.op, rd: p.rd || S.pc.round };
    m.cards = p.cards || [];
    return m;
  }
  function pcFreeCourts(S) { return S.courts.filter(function (c) { return c.active && !courtLive(S, c.id); }); }
  /* semua court selesai → ronde baru; court kosong tinggal satu → tantangan terdepan otomatis ke court itu */
  function pcAdvance(S) {
    pcSync(S);
    var pc = S.pc, created = [];
    if (!pc.pend.length && !liveMatches(S).length) pcNewRound(S);
    for (var g = 0; g < 12 && pc.pend.length; g++) {
      var free = pcFreeCourts(S);
      if (free.length !== 1) break;                                 // lebih dari satu: penantang memilih court
      created.push(pcStart(S, pc.pend[0], free[0]));
    }
    return created;
  }
  /* tantangan terdepan memilih court (courtId kosong = dipilihkan acak) */
  function pcChoose(S, courtId) {
    pcSync(S);
    var p = S.pc.pend[0];
    if (!p) return null;
    var free = pcFreeCourts(S);
    var c = courtId ? free.filter(function (x) { return x.id === courtId; })[0] : free[Math.floor(Math.random() * free.length)];
    if (!c) return null;
    var m = pcStart(S, p, c);
    pcAdvance(S);
    return m;
  }
  /* hasil match: kartu yang dipakai ke tumpukan buang; tim kalah mengambil 1 kartu (bila belum memegang 2).
     Koreksi skor yang menukar pemenang: kartu yang diambil tim sebelumnya ditarik bila belum dipakai, tim kalah baru mengambil */
  function pcResult(S, m, first) {
    if (!m.tA || !m.tB) return;
    var pc = pcState(S), cd = pc.cd;
    if (first) (m.cards || []).forEach(function (c) { if (PC_CARDS[c.k]) cd.disc.push({ id: c.id, k: c.k }); });
    if (m.sA === m.sB) return;
    var lose = m.sA > m.sB ? m.tB : m.tA;
    if (m.drawn && m.drawn.t === lose) return;
    if (m.drawn && m.drawn.id && !m.drawn.z) {
      var h = pcHandOf(S, m.drawn.t), i = h.map(function (x) { return x.id; }).indexOf(m.drawn.id);
      if (i >= 0) { cd.disc.push(h.splice(i, 1)[0]); pcBump(S, m.drawn.t); }
    }
    var hand = pcHandOf(S, lose);
    if (hand.length >= 2) { m.drawn = { t: lose, full: 1 }; return; }
    var card = pcDrawOne(S);
    if (!card) { m.drawn = null; return; }
    if (card.k === 'zonk') { cd.disc.push(card); m.drawn = { t: lose, z: 1, id: card.id }; }
    else { hand.push(card); m.drawn = { t: lose, id: card.id }; pcBump(S, lose); }
  }
  /* match dibatalkan: tantangannya kembali ke depan antrean pilih court, kartu yang dipakai kembali ke tangan */
  function pcVoid(S, m) {
    if (!m.pc) return;
    var pc = pcState(S);
    pc.pend.unshift({ id: uid('d_'), ch: m.pc.ch, op: m.pc.op, rd: m.pc.rd, cards: [] });
    pcReturn(S, m.cards);
    m.cards = [];
    if (m.tally) m.tally = m.tally.filter(function (x) { return x === 'A' || x === 'B'; });
  }
  /* tempat kartu dipakai: match (di court) atau tantangan (belum dapat court) */
  function pcCtx(S, ref) {
    var m = findMatch(S, ref);
    if (m && m.pc) return { m: m, list: m.cards || (m.cards = []), ch: m.pc.ch, teams: [m.tA, m.tB] };
    var p = (pcState(S).pend).filter(function (x) { return x.id === ref; })[0];
    if (p) return { p: p, list: p.cards || (p.cards = []), ch: p.ch, teams: [p.ch, p.op] };
    return null;
  }
  function pcUsed(list, tid) { return (list || []).some(function (c) { return c.by === tid; }); }
  /* penantang sudah mengumumkan: sudah memakai kartu, menyatakan tanpa kartu, atau tidak memegang kartu sebelum-match */
  function pcChDeclared(S, x) {
    if (pcUsed(x.list, x.ch) || (x.m && x.m.pass && x.m.pass[x.ch])) return true;
    return !pcHandOf(S, x.ch).some(function (c) { return PC_CARDS[c.k] && PC_CARDS[c.k].when === 'pre'; });
  }
  /* pakai kartu. o: { team, card, ref (match / tantangan), target (tim untuk Pilih Lawan), pid (pemain lawan untuk Switch Hand) }
     → pesan error, atau null bila berhasil */
  function pcPlay(S, o) {
    var pc = pcState(S), hand = pcHandOf(S, o.team), idx = hand.map(function (x) { return x.id; }).indexOf(o.card);
    if (idx < 0) return 'Kartu itu tidak ada di tangan timmu';
    var card = hand[idx], def = PC_CARDS[card.k];
    if (def.when === 'resp') return 'Block dan Reverse dipakai untuk menjawab kartu lawan';
    if (def.when === 'none') return 'Kartu ini tidak bisa dipakai';
    var x = pcCtx(S, o.ref);
    if (!x || x.teams.indexOf(o.team) < 0) return 'Timmu tidak ada di match itu';
    if (pcUsed(x.list, o.team)) return 'Timmu sudah memakai 1 kartu di match ini';
    var opp = x.teams[0] === o.team ? x.teams[1] : x.teams[0];
    var e = { id: card.id, k: card.k, by: o.team, tg: opp, at: now(), st: 'on' };
    if (def.when === 'draw') {
      if (!x.p) return 'Pilih Lawan dipakai saat undian lawan, sebelum timmu mendapat court';
      var tp = pc.pend.filter(function (p) { return p !== x.p && (p.ch === o.target || p.op === o.target); })[0];
      if (!tp) return 'Pilih tim yang belum mendapat court';
      if (pcUsed(tp.cards, o.target)) return 'Tim itu sudah memakai kartu untuk match berikutnya';
      var mine = x.p.ch === o.team ? x.p.op : x.p.ch, theirs = tp.ch === o.target ? tp.op : tp.ch;
      e.tg = o.target; e.p2 = tp.id;
      e.prev = [x.p.ch, x.p.op, tp.ch, tp.op];
      x.p.ch = o.team; x.p.op = o.target;                         // pemegang kartu jadi penantang lawan pilihannya
      tp.ch = theirs; tp.op = mine;                                // lawan lama kedua tim saling bertemu
      // kartu tim lawan lama yang sudah dipakai ikut pindah ke tantangan barunya
      (x.p.cards || []).filter(function (c) { return c.by === mine; }).forEach(function (c) { x.p.cards.splice(x.p.cards.indexOf(c), 1); tp.cards.push(c); });
      (tp.cards || []).filter(function (c) { return c.by === o.target; }).forEach(function (c) { tp.cards.splice(tp.cards.indexOf(c), 1); x.p.cards.push(c); });
    } else {
      if (!x.m || x.m.status !== 'live') return 'Kartu ini dipakai saat timmu sudah di court';
      var started = !!x.m.go || tallyPts(x.m) > 0;
      if (def.when === 'pre') {
        if (started) return 'Kartu ini harus diumumkan sebelum match dimulai';
        if (o.team !== x.ch && !pcChDeclared(S, x)) return 'Penantang mengumumkan kartu lebih dulu';
      }
      if (def.when === 'live' && !x.m.go) return 'Ambil Semua Poin dipakai saat game berjalan (setelah Game start)';
      if (card.k === 'swh') {
        var ot = teamById(S, opp);
        if (!ot || (o.pid !== ot.a && o.pid !== ot.b)) return 'Pilih satu pemain lawan untuk Switch Hand';
        e.pid = o.pid;
      }
      e.n0 = tallyPts(x.m);
      if (def.dur) { var ts = tallyState(S, x.m); e.g = ts.a + ts.b + 1; }
      if (card.k === 'steal') (x.m.tally = x.m.tally || []).push('S:' + card.id);
    }
    hand.splice(idx, 1); pcBump(S, o.team);
    x.list.push(e);
    return null;
  }
  /* jawab kartu lawan dengan Block (batal) atau Reverse (efek berbalik); hanya sebelum poin berikutnya,
     atau sebelum tantangan mendapat court untuk Pilih Lawan */
  function pcRespond(S, o) {
    var pc = pcState(S), hand = pcHandOf(S, o.team), idx = hand.map(function (x) { return x.id; }).indexOf(o.card);
    var card = hand[idx];
    if (!card || (card.k !== 'block' && card.k !== 'reverse')) return 'Pilih kartu Block atau Reverse di tangan timmu';
    var x = pcCtx(S, o.ref);
    if (!x) return 'Match tidak ditemukan';
    var tc = x.list.filter(function (c) { return c.id === o.of && !c.of; })[0];
    if (!tc || tc.st !== 'on') return 'Kartu itu sudah tidak bisa dijawab';
    if (tc.tg !== o.team) return 'Kartu itu tidak ditujukan ke timmu';
    if (card.k === 'reverse' && !PC_CARDS[tc.k].rev) return 'Reverse hanya untuk No Smash, No Glass, Switch Hand, dan Ambil Semua Poin';
    var own = x.list;
    if (tc.k === 'pick') {
      var p2 = pc.pend.filter(function (p) { return p.id === tc.p2; })[0];
      if (!p2 || !x.p || pc.pend.indexOf(x.p) < 0) return 'Tantangan itu sudah mendapat court';
      if (pcUsed(x.list.filter(function (c) { return c !== tc; }), o.team) || pcUsed(p2.cards, o.team)) return 'Timmu sudah memakai 1 kartu di match ini';
      var mine = tc.by;
      x.p.ch = tc.prev[0]; x.p.op = tc.prev[1]; p2.ch = tc.prev[2]; p2.op = tc.prev[3];
      // kartu tim yang pindah dikembalikan ke tantangan asalnya
      var inP2 = function (t) { return t === p2.ch || t === p2.op; };
      x.p.cards.filter(function (c) { return c !== tc && inP2(c.by); }).forEach(function (c) { x.p.cards.splice(x.p.cards.indexOf(c), 1); p2.cards.push(c); });
      p2.cards.filter(function (c) { return !inP2(c.by); }).forEach(function (c) { p2.cards.splice(p2.cards.indexOf(c), 1); x.p.cards.push(c); });
      if (mine !== x.p.ch && mine !== x.p.op) return 'Tantangan berubah';
      own = p2.cards;
    } else {
      if (x.m && (x.m.status !== 'live' || tallyPts(x.m) !== tc.n0)) return 'Waktu menjawab sudah lewat (sudah ada poin baru)';
      if (pcUsed(x.list, o.team)) return 'Timmu sudah memakai 1 kartu di match ini';
    }
    hand.splice(idx, 1); pcBump(S, o.team);
    tc.st = card.k === 'block' ? 'blocked' : 'reversed';
    own.push({ id: card.id, k: card.k, by: o.team, tg: tc.by, of: tc.id, ofk: tc.k, at: now(), st: 'on' });
    return null;
  }
  /* penantang menyatakan tanpa kartu sebelum match, supaya lawan bisa mengumumkan kartunya */
  function pcPass(S, ref, team) {
    var m = findMatch(S, ref);
    if (!m || m.status !== 'live' || !m.pc) return 'Match tidak ditemukan';
    if (team !== m.pc.ch) return 'Hanya penantang yang mengumumkan lebih dulu';
    (m.pass = m.pass || {})[team] = 1;
    return null;
  }
  /* poin court tiap tim, urut waktu selesai: menang +nilai (Double Point ×2), kalah −nilai;
     Tukar Ranking: pemegang menang & totalnya masih di bawah lawan → total keduanya ditukar */
  function pcPoints(S) {
    var tot = {};
    S.teams.forEach(function (t) { tot[t.id] = 0; });
    S.matches.filter(function (m) { return m.status === 'done' && m.tA && m.tB && m.sA !== m.sB; })
      .sort(function (a, b) { return (a.end || 0) - (b.end || 0) || a.no - b.no; })
      .forEach(function (m) {
        var w = m.sA > m.sB ? m.tA : m.tB, l = w === m.tA ? m.tB : m.tA, v = m.val || 1;
        var on = function (k) { return (m.cards || []).some(function (c) { return c.k === k && c.by === w && c.st === 'on'; }); };
        tot[w] = (tot[w] || 0) + (on('double') ? 2 * v : v);
        tot[l] = (tot[l] || 0) - v;
        if (on('swap') && tot[w] < tot[l]) { var t = tot[w]; tot[w] = tot[l]; tot[l] = t; }
      });
    return tot;
  }
  /* untuk tampilan: ronde, tantangan yang menunggu court, tim yang sudah selesai di ronde ini, yang istirahat */
  function pcLists(S) {
    if (!isPC(S) || !S.pc) return { round: 0, pend: [], done: [], out: [] };
    var pc = S.pc, live = teamLive(S), inPend = {}, doneR = {};
    (pc.pend || []).forEach(function (p) { inPend[p.ch] = inPend[p.op] = 1; });
    S.matches.forEach(function (m) { if (m.status === 'done' && m.pc && m.pc.rd === pc.round) { doneR[m.tA] = doneR[m.tB] = 1; } });
    var idle = S.teams.filter(function (t) { return teamActive(S, t) && !live[t.id] && !inPend[t.id]; });
    return {
      round: pc.round || 0, pend: (pc.pend || []).slice(),
      done: idle.filter(function (t) { return doneR[t.id]; }).map(function (t) { return t.id; }),
      out: idle.filter(function (t) { return !doneR[t.id]; }).map(function (t) { return t.id; })
    };
  }

  return {
    uid: uid, newSession: newSession, stats: stats, standings: standings,
    fillCourts: fillCourts, courtLive: courtLive, voidMatch: voidMatch, reshuffle: reshuffle,
    swapPlayer: swapPlayer, swapTeam: swapTeam, submitScore: submitScore, validateScore: validateScore,
    addParticipant: addParticipant, removeParticipant: removeParticipant, busySet: busySet,
    playedCount: playedCount, teamOf: teamOf, teamActive: teamActive, unpairedPlayers: unpairedPlayers,
    scoringLabel: scoringLabel, bench: bench, mustRest: mustRest, liveMatches: liveMatches, findMatch: findMatch,
    isWaiting: isWaiting, waitingFor: waitingFor, release: release, freeWaiting: freeWaiting,
    playingMatchOf: playingMatchOf, nextMatchOf: nextMatchOf, canWait: canWait,
    tallyState: tallyState, tally: tally, swapCandidates: swapCandidates, swapAcross: swapAcross, swapTeamAcross: swapTeamAcross,
    COURT_COLORS: COURT_COLORS,
    isPC: isPC, courtValue: courtValue, teamById: teamById, pcInit: pcInit, pcAdvance: pcAdvance, pcChoose: pcChoose, pcLists: pcLists, pcSync: pcSync,
    PC_CARDS: PC_CARDS, pcPlay: pcPlay, pcRespond: pcRespond, pcPass: pcPass, pcPoints: pcPoints, pcHandCount: pcHandCount, pcLastRes: pcLastRes,
    pcChDeclared: function (S, ref) { var x = pcCtx(S, ref); return !x || pcChDeclared(S, x); }, tallyPts: tallyPts
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
