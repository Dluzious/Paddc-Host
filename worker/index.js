/* ============================================================
   Paddoc Host v2 — server di Cloudflare
   Worker meneruskan /api, /ws, dan /photo ke satu Durable Object ("paddoc").
   Durable Object menjalankan Core (core.js) satu per satu seperti LockService di Apps Script,
   dengan data di SQLite miliknya: orang, sesi, properti (token login, sesi aktif), dan foto.
   POST /api  {fn, req}  ->  {ok:true, data} | {ok:false, error}
   GET  /ws              ->  WebSocket: server mengirim data terbaru setiap ada perubahan
                            (HP yang login mengirim "auth <token>" supaya ikut menerima chat lobi)
   GET  /photo/<id>.jpg  ->  file foto
   Sejak v2.17 server utama ("paddoc-asia") ada di Asia (petunjuk lokasi apac). Server lama ("paddoc") berada di luar Asia
   sehingga setiap aksi dari Indonesia menempuh ±180 ms ekstra; datanya disalin sekali ke server baru (lihat migrate()),
   lalu server lama berhenti menerima perubahan dan datanya tetap utuh sebagai cadangan.
   GET  /play?lobby=<id> ->  WebSocket mode main lobi (analog & bola), dilayani Durable Object kecil per lobi
                            ("PaddocPlay"), terpisah dari skor & chat. Pemakaiannya dibatasi bersama untuk semua lobi
                            (PLAY_BUDGET, bawaan 7,5% kuota harian gratis); bila habis, mode main berhenti sampai 07.00 WIB.
   ============================================================ */
import { DurableObject } from 'cloudflare:workers';
import { Buffer } from 'node:buffer';
import { createHash, randomUUID } from 'node:crypto';
import Core from '../core.js';
import LobbyPlay from '../play.js';
import { generateAI, generateChibi } from './ai.js';
import { newVapidKeys, sendPush } from './push.js';

const MAX_BODY = 8 * 1024 * 1024;
const MAX_B64 = 1900000; // batas baris SQLite Durable Object 2 MB
// mode main: satuan pemakaian = 1 pesan WebSocket masuk; 1 request (sambungan baru / cek ke server utama) = 20 satuan,
// sama dengan cara Cloudflare menghitung (20 pesan = 1 request). 150.000 satuan = 7.500 request = 7,5% dari 100.000/hari.
const PLAY_BUDGET = 150000;
const PLAY_REPORT = 1000;
// siaran ke semua HP paling sering sekali per 300 ms: ketukan poin beruntun digabung jadi satu kiriman
const CAST_GAP = 300;
const MAIN = 'paddoc-asia', OLD = 'paddoc';
const MIG_TABLES = ['props', 'people', 'sessions', 'kudos', 'push_subs', 'photos'];
const MIG_WAIT = 20000;     // permintaan pertama setelah pindah menunggu salinan data paling lama 20 detik
function mainDO(env) { return env.PADDOC.get(env.PADDOC.idFromName(MAIN), { locationHint: 'apac' }); }

/* foto pemain (ID tidak pernah berubah isinya) disimpan di memori Worker di titik Cloudflare terdekat, jadi permintaan
   berulang tidak perlu ke server utama. Maks ±24 MB per isolate, yang paling lama tidak dipakai dibuang dulu. */
const PHOTO_MEM = new Map();
let photoBytes = 0;
const PHOTO_MAX = 24 * 1024 * 1024;
async function photo(request, env) {
  const key = new URL(request.url).pathname.replace(/\.jpg$/, '');
  const hit = PHOTO_MEM.get(key);
  if (hit) { PHOTO_MEM.delete(key); PHOTO_MEM.set(key, hit); return new Response(hit.body, { headers: hit.headers }); }
  const res = await mainDO(env).fetch(request);
  if (res.status !== 200) return res;
  const body = await res.arrayBuffer();
  const headers = { 'Content-Type': res.headers.get('Content-Type') || 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable', 'Access-Control-Allow-Origin': '*' };
  if (body.byteLength < 3 * 1024 * 1024) {
    PHOTO_MEM.set(key, { body, headers }); photoBytes += body.byteLength;
    while (photoBytes > PHOTO_MAX && PHOTO_MEM.size) {
      const [k, v] = PHOTO_MEM.entries().next().value;
      PHOTO_MEM.delete(k); photoBytes -= v.body.byteLength;
    }
  }
  return new Response(body, { headers });
}   // pemakaian dilaporkan ke server utama tiap 1.000 satuan (≈2% tambahan)

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    if (p === '/play') {
      const sid = url.searchParams.get('lobby') || '';
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(sid)) return new Response('Lobi tidak valid', { status: 400 });
      return env.PLAY.get(env.PLAY.idFromName('play:' + sid)).fetch(request);
    }
    if (/^\/photo\/ph_[a-f0-9]{32}(\.jpg)?$/.test(p) && request.method === 'GET') return photo(request, env);
    if (p === '/api' || p === '/api/' || p === '/ws') {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
      return mainDO(env).fetch(request);
    }
    return env.ASSETS.fetch(request);
  }
};

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}
function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, cors())
  });
}
function clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }

/* cari alamat venue: Google Places bila secret GOOGLE_MAPS_API_KEY diisi, selain itu OpenStreetMap (gratis) */
async function geocode(env, q) {
  const mapsAt = (lat, lng) => 'https://www.google.com/maps/search/?api=1&query=' + lat + '%2C' + lng;
  if (env.GOOGLE_MAPS_API_KEY) {
    const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.googleMapsUri' },
      body: JSON.stringify({ textQuery: q, languageCode: 'id', regionCode: 'ID', maxResultCount: 5 })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('GEO: Pencarian Google Maps gagal (' + ((j.error || {}).message || r.status) + ')');
    return (j.places || []).map((x) => {
      const loc = x.location || {};
      return { name: (x.displayName || {}).text || q, address: x.formattedAddress || '', lat: loc.latitude, lng: loc.longitude,
        maps: x.googleMapsUri || mapsAt(loc.latitude, loc.longitude) };
    });
  }
  const base = env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org';
  const r = await fetch(base + '/search?format=jsonv2&limit=5&countrycodes=id&accept-language=id&q=' + encodeURIComponent(q), {
    headers: { 'User-Agent': 'PaddocHost/2.4 (+https://paddoc-host.lulunurulula.workers.dev)', Accept: 'application/json' }
  });
  if (!r.ok) throw new Error('GEO: Pencarian alamat sedang tidak tersedia (' + r.status + '). Isi alamat & link Maps manual');
  const list = await r.json();
  return (Array.isArray(list) ? list : []).map((x) => {
    const parts = String(x.display_name || '').split(', ');
    const name = x.name || parts[0] || q;
    return { name, address: parts.filter((t, i) => !(i === 0 && t === name)).join(', '), lat: +x.lat, lng: +x.lon, maps: mapsAt(x.lat, x.lon) };
  });
}

export class PaddocHost extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS people (id TEXT PRIMARY KEY, json TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, name TEXT, date TEXT, status TEXT, format TEXT,
      team_mode TEXT, players INTEGER, courts INTEGER, matches INTEGER, updated INTEGER, data TEXT NOT NULL, rows TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS props (k TEXT PRIMARY KEY, v TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY, mime TEXT NOT NULL, b64 TEXT NOT NULL, created INTEGER NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, pid TEXT NOT NULL, json TEXT NOT NULL, created INTEGER NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS kudos (sid TEXT NOT NULL, giver TEXT NOT NULL, target TEXT NOT NULL, k TEXT NOT NULL, at INTEGER NOT NULL)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS kudos_target ON kudos (target)`);
    this.outbox = [];
    this.cache = new Map();
    this.origin = '';
    this.dirty = false;
    this.lastCast = 0; this.castT = null; this.castPv = null;
    this.A = this.adapter();
    this.isOld = ctx.id.equals(env.PADDOC.idFromName(OLD));
    this.migP = null;
    // ping dari HP dijawab tanpa membangunkan Durable Object
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request) {
    const url = new URL(request.url);
    // dari server baru: salin data (bukan dari internet: Worker hanya meneruskan /api, /ws, /photo ke sini)
    if (url.pathname === '/internal/export') return json(this.exportRows(await request.json().catch(() => ({}))));
    if (this.isOld && this.prop('RETIRED')) return this.movedAway(url);
    if (!this.isOld && !(this.migDone || (this.migDone = !!this.prop('MIG_DONE')))) {
      const ok = await Promise.race([this.migrate().then(() => true, () => false), new Promise((r) => setTimeout(r, MIG_WAIT, false))]);
      if (!ok) return this.movedAway(url);
    }
    // dari Durable Object mode main (bukan dari internet: Worker hanya meneruskan /api, /ws, /photo ke sini)
    if (url.pathname === '/internal/play') return json(this.playInternal(await request.json().catch(() => ({}))));
    if (this.origin !== url.origin) {           // dipakai alarm pengingat (tanpa request) untuk identitas VAPID
      this.origin = url.origin;
      this.sql.exec("INSERT INTO props (k, v) VALUES ('ORIGIN', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", url.origin);
    }
    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Butuh WebSocket', { status: 426 });
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    if (url.pathname.startsWith('/photo/')) return this.servePhoto(url.pathname.slice(7).replace(/\.jpg$/, ''));
    if (request.method !== 'POST') return json({ ok: false, error: 'Gunakan POST' }, 405);
    let body;
    try {
      if (+(request.headers.get('Content-Length') || 0) > MAX_BODY) throw new Error('Data terlalu besar');
      body = JSON.parse(await request.text());
    } catch (e) {
      return json({ ok: false, error: 'INVALID: ' + (e.message || 'Permintaan tidak valid') });
    }
    try {
      if (body.fn === 'createAdmin' && !this.env.APP_PIN) throw new Error('SETUP: Isi secret APP_PIN di pengaturan Worker Cloudflare dulu, lalu pakai sebagai kode pemasangan.');
      Core.init(this.A);
      this.dirty = false;
      this.outbox = [];
      let data = Core.call(body.fn, body.req || {});
      if (data && typeof data.then === 'function') data = await data;
      if (this.dirty) { this.broadcast(); await this.planReminders(); }
      // notifikasi push dikirim setelah jawaban: penekan tombol tidak menunggu server notifikasi Google/Apple
      if (this.outbox.length) this.later(this.flushPush());
      return json({ ok: true, data: data === undefined ? null : data });
    } catch (e) {
      if (this.dirty) this.broadcast();
      if (!e.code && !/^[A-Z_]+:/.test(String(e.message))) console.error(body.fn, e && e.stack || e);
      return json({ ok: false, error: String((e && e.message) || e) });
    }
  }

  later(p) {
    const q = Promise.resolve(p).catch((e) => console.error('later', e && e.stack || e));
    try { if (this.ctx.waitUntil) this.ctx.waitUntil(q); } catch (e) { /* tetap jalan tanpa waitUntil */ }
  }
  /* kirim data terbaru ke semua HP yang tersambung, hemat data:
     - paling sering sekali per CAST_GAP (perubahan beruntun digabung, yang terakhir selalu terkirim)
     - daftar orang hanya ikut bila berubah sejak siaran sebelumnya
     - match yang sudah selesai cukup id-nya (HP mengisi dari data yang sudah ia punya, lihat Engine.slimMatches) */
  broadcast() {
    this.dirty = false;
    const socks = this.ctx.getWebSockets();
    if (!socks.length) return;
    const wait = this.lastCast + CAST_GAP - Date.now();
    if (wait > 0) {
      if (!this.castT) this.castT = setTimeout(() => { this.castT = null; this.broadcast(); }, wait);
      return;
    }
    this.lastCast = Date.now();
    let pub, mem, pv;
    try {
      Core.init(this.A);
      const d = Core.pollAs(false, { pv: this.castPv, slim: true });
      pv = d.pv;
      pub = JSON.stringify({ type: 'poll', data: d });
    } catch (e) { console.error('broadcast', e); return; }
    const prevPv = this.castPv;
    this.castPv = pv;
    socks.forEach((ws) => {
      try {
        const member = !!(ws.deserializeAttachment() || {}).member;
        if (member && !mem) mem = JSON.stringify({ type: 'poll', data: Core.pollAs(true, { pv: prevPv, slim: true }) }); // dengan chat lobi
        ws.send(member ? mem : pub);
      } catch (e) { /* koneksi sudah putus */ }
    });
  }
  /* pengingat 12 jam & 3 jam sebelum main: Core menandai yang jatuh tempo, alarm Durable Object untuk yang berikutnya */
  async planReminders() {
    try {
      Core.init(this.A);
      const next = Core.reminders(Date.now());
      if (this.dirty) this.broadcast();
      const cur = await this.ctx.storage.getAlarm();
      if (next && cur !== next) await this.ctx.storage.setAlarm(next);
      else if (!next && cur) await this.ctx.storage.deleteAlarm();
    } catch (e) { console.error('reminders', e && e.stack || e); }
  }
  /* ---------- pindah server (v2.17): salin data dari server lama, bertahap & bisa dilanjutkan ---------- */
  prop(k) { const r = this.sql.exec('SELECT v FROM props WHERE k = ?', k).toArray()[0]; return r ? r.v : null; }
  setPropRaw(k, v) { this.sql.exec('INSERT INTO props (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v', k, String(v)); }
  movedAway(url) {
    const msg = 'MIGRATING: Server sedang dipindahkan ke Asia supaya lebih cepat. Coba lagi beberapa detik lagi.';
    if (url.pathname === '/ws') return new Response(msg, { status: 503 });
    if (url.pathname.indexOf('/photo/') === 0) return new Response('Coba lagi', { status: 503, headers: { 'Retry-After': '5', 'Cache-Control': 'no-store' } });
    return json({ ok: false, error: msg });
  }
  /* server lama: kirim baris tabel setelah rowid `after`, paling banyak ±3,5 MB per jawaban; sejak itu menolak perubahan */
  exportRows(b) {
    if (!this.isOld) return { ok: false, error: 'Bukan server lama' };
    if (MIG_TABLES.indexOf(b.table) < 0) return { ok: false, error: 'Tabel tidak dikenal' };
    if (!this.prop('RETIRED')) {
      this.setPropRaw('RETIRED', Date.now());
      this.ctx.storage.deleteAlarm().catch(() => {});                    // pengingat dikirim server baru
      this.ctx.getWebSockets().forEach((ws) => { try { ws.close(1012, 'pindah server'); } catch (e) { /* sudah tertutup */ } });
    }
    const after = Number(b.after) || 0, rows = [];
    let size = 0, next = after, done = true;
    for (const row of this.sql.exec(`SELECT rowid AS _r, * FROM ${b.table} WHERE rowid > ? ORDER BY rowid LIMIT 400`, after)) {
      if (b.table === 'props' && (row.k === 'RETIRED' || /^MIG_/.test(row.k))) { next = row._r; continue; }
      const n = JSON.stringify(row).length;
      if (rows.length && size + n > 3.5e6) { done = false; break; }
      next = row._r; size += n; delete row._r; rows.push(row);
    }
    if (done && this.sql.exec(`SELECT rowid FROM ${b.table} WHERE rowid > ? LIMIT 1`, next).toArray().length) done = false;
    return { ok: true, rows, next, done };
  }
  /* server baru: ambil semua tabel dari server lama. Kemajuan per tabel disimpan (MIG_<tabel>), jadi bila terputus
     dilanjutkan dari tempat terakhir; satu potong ditulis dalam satu transaksi. */
  migrate() {
    if (this.prop('MIG_DONE')) return Promise.resolve();
    if (this.migP) return this.migP;
    this.migP = (async () => {
      const old = this.env.PADDOC.get(this.env.PADDOC.idFromName(OLD));
      for (const t of MIG_TABLES) {
        let after = Number(this.prop('MIG_' + t) || 0);
        while (after >= 0) {
          const res = await old.fetch('https://paddoc.internal/internal/export', { method: 'POST', body: JSON.stringify({ table: t, after }) });
          const j = await res.json();
          if (!j.ok) throw new Error('pindah server: ' + j.error);
          this.ctx.storage.transactionSync(() => {
            j.rows.forEach((row) => {
              const cols = Object.keys(row);
              this.sql.exec(`INSERT OR REPLACE INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, ...cols.map((c) => row[c]));
            });
            this.setPropRaw('MIG_' + t, j.done ? -1 : j.next);
          });
          after = j.done ? -1 : j.next;
        }
      }
      this.setPropRaw('MIG_DONE', Date.now());
      this.cache.clear();
      console.log('pindah server selesai');
      this.origin = this.prop('ORIGIN') || this.origin;
      await this.planReminders();                                       // pengingat sesi dijadwalkan di server baru
    })().catch((e) => { console.error('pindah server', e && e.stack || e); throw e; }).finally(() => { this.migP = null; });
    return this.migP;
  }
  async alarm() {
    if (this.isOld && this.prop('RETIRED')) return;
    if (!this.origin) this.origin = (this.sql.exec("SELECT v FROM props WHERE k = 'ORIGIN'").toArray()[0] || {}).v || '';
    this.outbox = []; this.dirty = false;
    await this.planReminders();
    if (this.outbox.length) await this.flushPush();
  }
  /* kirim notifikasi push yang dikumpulkan Core (Panggil) ke semua HP milik pemain itu */
  async flushPush() {
    const jobs = this.outbox.splice(0);
    const vapid = await this.vapid();
    const subject = this.origin || 'https://paddoc.app';
    await Promise.all(jobs.map(async (j) => {
      const subs = this.sql.exec('SELECT endpoint, json FROM push_subs WHERE pid = ?', j.pid).toArray();
      await Promise.all(subs.map(async (r) => {
        const res = await sendPush(JSON.parse(r.json), j.payload, vapid, subject);
        if (res === 'gone') this.sql.exec('DELETE FROM push_subs WHERE endpoint = ?', r.endpoint);
      }));
    }));
  }
  async vapid() {
    const r = this.sql.exec("SELECT v FROM props WHERE k = 'VAPID'").toArray()[0];
    if (r) return JSON.parse(r.v);
    const keys = await newVapidKeys();
    this.sql.exec("INSERT INTO props (k, v) VALUES ('VAPID', ?) ON CONFLICT(k) DO NOTHING", JSON.stringify(keys));
    return JSON.parse(this.sql.exec("SELECT v FROM props WHERE k = 'VAPID'").toArray()[0].v);
  }
  /* ping dijawab otomatis; "auth <token>" menandai HP yang login supaya menerima chat lobi */
  webSocketMessage(ws, msg) {
    const m = /^auth ([A-Za-z0-9_-]{8,80})$/.exec(String(msg));
    if (!m) return;
    try {
      Core.init(this.A);
      Core.call('me', { token: m[1] });          // melempar error bila token tidak sah
      ws.serializeAttachment({ member: true });
      ws.send(JSON.stringify({ type: 'poll', data: Core.pollAs(true) }));
    } catch (e) { try { ws.serializeAttachment({ member: false }); } catch (x) { /* abaikan */ } }
  }
  webSocketClose(ws, code) { try { ws.close(code, 'bye'); } catch (e) { /* sudah tertutup */ } }

  /* mode main: catat pemakaian harian semua lobi (hari UTC, sama dengan reset kuota Cloudflare) dan,
     bila ada token, cek pemiliknya sudah bergabung di lobi itu */
  playInternal(b) {
    const day = Math.floor(Date.now() / 864e5), cap = Number(this.env.PLAY_BUDGET) || PLAY_BUDGET;
    let st = { day, used: 0 };
    const r = this.sql.exec("SELECT v FROM props WHERE k = 'PLAY_USE'").toArray()[0];
    if (r) { try { const o = JSON.parse(r.v); if (o.day === day) st = o; } catch (e) { /* rusak: mulai lagi */ } }
    st.used += Math.max(0, Math.min(1e7, Number(b.used) || 0)) + 20;      // + permintaan ini sendiri
    this.sql.exec("INSERT INTO props (k, v) VALUES ('PLAY_USE', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", JSON.stringify(st));
    const out = { left: cap - st.used, pid: null, ok: false };
    if (typeof b.token === 'string') {
      try { Core.init(this.A); Object.assign(out, Core.playCheck(b.token, b.sid)); } catch (e) { /* token tidak sah */ }
    }
    return out;
  }

  servePhoto(id) {
    const r = this.photoRow(id);
    if (!r) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    return new Response(Buffer.from(r.b64, 'base64'), {
      headers: { 'Content-Type': r.mime, 'Cache-Control': 'public, max-age=31536000, immutable', 'Access-Control-Allow-Origin': '*' }
    });
  }
  photoRow(id) {
    const rows = this.sql.exec('SELECT mime, b64 FROM photos WHERE id = ?', String(id)).toArray();
    return rows[0] || null;
  }

  /* adaptor penyimpanan untuk Core: sama dengan MemoryAdapter (index.html), data disalin lewat JSON */
  adapter() {
    const self = this, sql = this.sql, env = this.env;
    const touch = () => { self.dirty = true; };
    const A = {
      now: () => Date.now(),
      uuid: (p) => (p || '') + randomUUID().replace(/-/g, '').slice(0, 16),
      hash: (s) => createHash('sha256').update(String(s), 'utf8').digest('hex'),
      people: () => sql.exec('SELECT json FROM people').toArray().map((r) => JSON.parse(r.json)),
      savePerson: (p) => {
        sql.exec('INSERT INTO people (id, json) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json', p.id, JSON.stringify(p));
        touch();
      },
      session: (id) => {
        const r = sql.exec('SELECT data FROM sessions WHERE id = ?', String(id)).toArray()[0];
        return r ? JSON.parse(r.data) : null;
      },
      saveSession: (S, rows) => {
        const data = JSON.stringify(S);
        if (data.length > MAX_B64) throw new Error('INVALID: Data sesi terlalu besar');
        const parts = S.parts || {};
        sql.exec(`INSERT INTO sessions (id, name, date, status, format, team_mode, players, courts, matches, updated, data, rows)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET name = excluded.name, date = excluded.date, status = excluded.status, format = excluded.format,
            team_mode = excluded.team_mode, players = excluded.players, courts = excluded.courts, matches = excluded.matches,
            updated = excluded.updated, data = excluded.data, rows = excluded.rows`,
          S.id, String(S.name || ''), String(S.date || ''), String(S.status || ''), String(S.format || ''), String(S.teamMode || ''),
          Object.keys(parts).filter((k) => parts[k].active).length, (S.courts || []).filter((c) => c.active).length,
          (S.matches || []).filter((m) => m.status === 'done').length, S.updated || Date.now(), data, rows ? JSON.stringify(rows) : null);
        touch();
      },
      sessions: () => sql.exec('SELECT id, name, date, status, format, team_mode, players, courts, matches, updated FROM sessions ORDER BY updated DESC')
        .toArray().map((r) => ({
          id: r.id, name: r.name, date: r.date, status: r.status, format: r.format, teamMode: r.team_mode,
          players: r.players, courts: r.courts, matches: r.matches, updated: r.updated
        })),
      deleteSession: (id) => { sql.exec('DELETE FROM sessions WHERE id = ?', String(id)); touch(); },
      prop: (k) => {
        if (k === 'APP_PIN') return env.APP_PIN || null; // kode pemasangan admin pertama
        const r = sql.exec('SELECT v FROM props WHERE k = ?', k).toArray()[0];
        return r ? r.v : null;
      },
      setProp: (k, v) => {
        sql.exec('INSERT INTO props (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v', k, String(v));
        if (k === 'ACTIVE_SID' || k === 'PV' || k === 'LOBBY_THEMES') touch();
        if (k.indexOf('tok_') === 0 && Math.random() < 0.05) self.cleanTokens();
      },
      delProp: (k) => { sql.exec('DELETE FROM props WHERE k = ?', k); if (k === 'ACTIVE_SID') touch(); },
      cacheGet: (k) => {
        const e = self.cache.get(k);
        if (!e || e.exp < Date.now()) { self.cache.delete(k); return null; }
        return JSON.parse(e.v);
      },
      cachePut: (k, v, sec) => {
        if (v == null) self.cache.delete(k);
        else self.cache.set(k, { v: JSON.stringify(v), exp: Date.now() + Math.min(sec || 600, 21600) * 1000 });
      },
      lock: (fn) => fn(), // Durable Object sudah memproses permintaan satu per satu
      savePhoto: (dataUrl, name) => {
        const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(dataUrl || ''));
        if (!m) throw new Error('INVALID: Format foto tidak dikenali');
        const b64 = m[2].replace(/\s+/g, '');
        if (b64.length > MAX_B64) throw new Error('INVALID: Foto terlalu besar (maks ±1,4 MB)');
        const id = 'ph_' + randomUUID().replace(/-/g, '');
        sql.exec('INSERT INTO photos (id, mime, b64, created) VALUES (?, ?, ?, ?)', id, m[1].toLowerCase(), b64, Date.now());
        return id;
      },
      photoUrl: (id) => id ? self.origin + '/photo/' + id + '.jpg' : '',
      trash: (id) => { if (id) sql.exec('DELETE FROM photos WHERE id = ?', String(id)); },
      photoData: (id) => {
        const r = self.photoRow(id);
        return r ? 'data:' + r.mime + ';base64,' + r.b64 : '';
      },
      photoRow: (id) => self.photoRow(id),
      aiEnabled: () => !!env.OPENAI_API_KEY,
      pushKey: () => self.vapid().then((v) => v.publicKey),
      savePush: (pid, sub) => {
        sql.exec(`INSERT INTO push_subs (endpoint, pid, json, created) VALUES (?, ?, ?, ?)
          ON CONFLICT(endpoint) DO UPDATE SET pid = excluded.pid, json = excluded.json`, sub.endpoint, pid, JSON.stringify(sub), Date.now());
      },
      deletePush: (endpoint) => { sql.exec('DELETE FROM push_subs WHERE endpoint = ?', endpoint); },
      notify: (pid, payload) => { self.outbox.push({ pid, payload }); },
      geocode: (q) => geocode(env, q),
      // kudos: satu baris per kudos; pemberi mengganti semua kudos-nya untuk sesi itu sekaligus
      saveKudos: (sid, giver, rows, at) => {
        sql.exec('DELETE FROM kudos WHERE sid = ? AND giver = ?', sid, giver);
        rows.forEach((r) => sql.exec('INSERT INTO kudos (sid, giver, target, k, at) VALUES (?, ?, ?, ?, ?)', sid, giver, r.target, r.k, at));
      },
      kudosBy: (sid, giver) => sql.exec('SELECT target, k FROM kudos WHERE sid = ? AND giver = ?', sid, giver).toArray(),
      kudosFor: (target) => sql.exec('SELECT sid, giver, k, at FROM kudos WHERE target = ? ORDER BY at DESC', target).toArray(),
      kudosAll: () => sql.exec('SELECT sid, giver, target, k, at FROM kudos ORDER BY at DESC').toArray(),
      generateAI: (p, kind) => generateAI(env, A, clone(p), kind),
      generateChibi: (p, kind) => generateChibi(env, A, clone(p), kind)
    };
    return A;
  }

  cleanTokens() {
    const now = Date.now();
    this.sql.exec("SELECT k, v FROM props WHERE k LIKE 'tok\\_%' ESCAPE '\\'").toArray().forEach((r) => {
      let exp = 0;
      try { exp = JSON.parse(r.v).exp; } catch (e) { /* rusak: hapus */ }
      if (!(exp > now)) this.sql.exec('DELETE FROM props WHERE k = ?', r.k);
    });
  }
}

/* ============================================================
   Mode main lobi: satu Durable Object kecil per lobi, hanya meneruskan pesan (tidak menyimpan data sesi).
   Pesan dari HP:  {t:'tm', c} sinkron jam (penonton) · {t:'auth', k: token, c} pemain yang sudah bergabung
                   {t:'m', x, y} posisi analog · {t:'a'} kembali otomatis · {t:'b', id, x, y, vx, vy} lempar
                   {t:'h', id, n, x, y, vx, vy, by} bola kena avatar `by`
   Ke HP:          {t:'hi', c, now, pid, ok, ids, man} · {t:'p', ids} yang sedang main · m / a / b / h diteruskan
                   (b & h juga ke pengirim, dengan `at` = jam server, sebagai urutan resmi) · {t:'bx', id} lemparan ditolak
                   {t:'off'} batas harian tercapai
   ============================================================ */
const PW = LobbyPlay.WALL;
function pnum(x, a, b) { const n = Number(x); return Number.isFinite(n) && n >= a && n <= b ? Math.round(n * 100) / 100 : null; }

export class PaddocPlay extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)');
    const r = this.sql.exec("SELECT v FROM kv WHERE k = 'pending'").toArray()[0];
    this.pending = r ? Number(r.v) || 0 : 0;    // pemakaian yang belum dilaporkan (disimpan supaya tidak hilang saat tidur)
    this.saved = this.pending;
    this.left = null;                           // sisa satuan hari ini (dari laporan terakhir)
    this.leftDay = 0;
    this.offDay = 0;
    this.man = new Map();                       // pid → posisi analog terakhir (untuk yang baru membuka lobi)
    this.balls = new Map();                     // id → { o: pemilik, exp, hard }
    this.bucket = new WeakMap();                // batas kirim per HP
  }
  day() { return Math.floor(Date.now() / 864e5); }
  use(n) {
    this.pending += n;
    if (this.pending - this.saved >= 100) this.persist();
  }
  persist() {
    this.saved = this.pending;
    this.sql.exec("INSERT INTO kv (k, v) VALUES ('pending', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", String(this.pending));
  }
  isOff() {
    const d = this.day();
    if (this.leftDay !== d) this.left = null;   // hari baru (07.00 WIB): kuota mulai lagi
    return this.offDay === d || (this.left !== null && this.left - this.pending <= 0);
  }
  /* laporkan pemakaian ke server utama (sekaligus cek token bila ada) */
  async report(token, sid) {
    const used = this.pending;
    this.pending = 0; this.persist();
    try {
      const body = { used };
      if (token) { body.token = token; body.sid = sid; }
      const res = await mainDO(this.env).fetch('https://paddoc.internal/internal/play',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await res.json();
      this.left = Number(j.left); this.leftDay = this.day();
      if (!(this.left > 0)) this.offDay = this.day();
      return j;
    } catch (e) {
      this.use(used);                           // gagal lapor: dicoba lagi nanti
      return { pid: null, ok: false };
    }
  }
  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Butuh WebSocket', { status: 426 });
    const sid = new URL(request.url).searchParams.get('lobby') || '';
    this.use(20);
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ sid, pid: null, ok: false });
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  socks(except) { return this.ctx.getWebSockets().filter((w) => w !== except); }
  present(except) {
    const ids = new Set();
    this.socks(except).forEach((w) => { const a = w.deserializeAttachment() || {}; if (a.ok && a.pid) ids.add(a.pid); });
    return [...ids];
  }
  send(obj, except) { const s = JSON.stringify(obj); this.socks(except).forEach((w) => { try { w.send(s); } catch (e) { /* putus */ } }); }
  shutdown() { this.send({ t: 'off' }); this.ctx.getWebSockets().forEach((w) => { try { w.close(4000, 'off'); } catch (e) { /* sudah */ } }); }
  /* maksimal ±6 pesan/detik per HP (lonjakan 12); terus melanggar → diputus */
  allow(ws) {
    const now = Date.now(), b = this.bucket.get(ws) || { tok: 12, t: now, bad: 0 };
    b.tok = Math.min(12, b.tok + (now - b.t) / 1000 * 6); b.t = now;
    this.bucket.set(ws, b);
    if (b.tok >= 1) { b.tok -= 1; b.bad = 0; return true; }
    if (++b.bad > 30) { try { ws.close(4001, 'rate'); } catch (e) { /* sudah */ } }
    return false;
  }
  live(now) {
    let n = 0;
    for (const [id, b] of this.balls) { if (now > b.exp || now > b.hard) this.balls.delete(id); else n++; }
    return n;
  }
  async webSocketMessage(ws, raw) {
    this.use(1);
    if (typeof raw !== 'string' || raw.length > 300 || !this.allow(ws)) return;
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    if (this.isOff()) {
      if (this.offDay !== this.day()) await this.report();     // batas tercapai di lobi ini: lapor dulu supaya lobi lain ikut berhenti
      if (this.isOff()) { this.shutdown(); return; }
    }
    const at = ws.deserializeAttachment() || {}, now = Date.now();
    if (m.t === 'tm' || m.t === 'auth') {
      const was = at.ok ? at.pid : null;
      let res = { pid: null, ok: false };
      if (m.t === 'auth' && typeof m.k === 'string' && /^[A-Za-z0-9_-]{8,80}$/.test(m.k)) res = await this.report(m.k, at.sid);
      else if (this.left === null || this.pending >= PLAY_REPORT) await this.report();
      if (this.isOff()) { this.shutdown(); return; }
      at.pid = res.pid || null; at.ok = !!res.ok;
      ws.serializeAttachment(at);
      const man = {};
      this.man.forEach((v, k) => { if (now - v.at < 12000) man[k] = { x: v.x, y: v.y }; });
      try { ws.send(JSON.stringify({ t: 'hi', c: Number(m.c) || 0, now: Date.now(), pid: at.pid, ok: at.ok, ids: this.present(), man })); } catch (e) { /* putus */ }
      if (was !== (at.ok ? at.pid : null)) this.send({ t: 'p', ids: this.present() }, ws);
      return;
    }
    if (!at.ok || !at.pid) return;
    const pid = at.pid;
    if (m.t === 'm') {
      const x = pnum(m.x, PW.x0, PW.x1), y = pnum(m.y, PW.y0, 11.5);
      if (x === null || y === null) return;
      this.man.set(pid, { x, y, at: now });
      this.send({ t: 'm', p: pid, x, y }, ws);
    } else if (m.t === 'a') {
      this.man.delete(pid);
      this.send({ t: 'a', p: pid }, ws);
    } else if (m.t === 'b' || m.t === 'h') {
      const x = pnum(m.x, PW.x0, PW.x1), y = pnum(m.y, PW.y0, PW.y1), vx = pnum(m.vx, -15, 15), vy = pnum(m.vy, -15, 15);
      const id = typeof m.id === 'string' && /^[a-z0-9]{3,24}$/.test(m.id) ? m.id : null;
      if (x === null || y === null || vx === null || vy === null || !id) return;
      const n = this.live(now);
      if (m.t === 'b') {
        let mine = false;
        this.balls.forEach((b) => { if (b.o === pid) mine = true; });
        if (this.balls.has(id) || mine || n >= LobbyPlay.MAX_BALLS) { try { ws.send(JSON.stringify({ t: 'bx', id })); } catch (e) { /* putus */ } return; }
        this.balls.set(id, { o: pid, exp: now + LobbyPlay.TTL + 500, hard: now + LobbyPlay.MAX_AGE + 500 });
        this.send({ t: 'b', p: pid, id, x, y, vx, vy, at: now });
      } else {
        const b = this.balls.get(id), hn = Number(m.n), by = typeof m.by === 'string' ? m.by.slice(0, 40) : '';
        if (!b || !Number.isInteger(hn) || hn < 1 || hn > 9999 || !by) return;
        // pantulan sah: avatar sendiri, atau pelempar untuk avatar yang pemiliknya tidak sedang membuka lobi
        if (by !== pid && !(b.o === pid && this.present().indexOf(by) < 0)) return;
        b.exp = now + LobbyPlay.TTL + 500;
        this.send({ t: 'h', p: pid, id, n: hn, x, y, vx, vy, by, at: now });
      }
    }
    if (this.pending >= PLAY_REPORT) { await this.report(); if (this.isOff()) this.shutdown(); }
  }
  webSocketClose(ws, code) {
    const at = ws.deserializeAttachment() || {};
    try { ws.close(code, 'bye'); } catch (e) { /* sudah tertutup */ }
    if (!at.ok || !at.pid) return;
    const ids = this.present(ws);
    if (ids.indexOf(at.pid) < 0 && this.man.delete(at.pid)) this.send({ t: 'a', p: at.pid }, ws);
    this.send({ t: 'p', ids }, ws);
  }
  webSocketError(ws) { this.webSocketClose(ws, 1011); }
}
