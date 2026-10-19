/* ============================================================
   Paddoc Host v2 — server di Cloudflare
   Worker meneruskan /api, /ws, dan /photo ke satu Durable Object ("paddoc").
   Durable Object menjalankan Core (core.js) satu per satu seperti LockService di Apps Script,
   dengan data di SQLite miliknya: orang, sesi, properti (token login, sesi aktif), dan foto.
   POST /api  {fn, req}  ->  {ok:true, data} | {ok:false, error}
   GET  /ws              ->  WebSocket: server mengirim data terbaru setiap ada perubahan
   GET  /photo/<id>.jpg  ->  file foto
   ============================================================ */
import { DurableObject } from 'cloudflare:workers';
import { Buffer } from 'node:buffer';
import { createHash, randomUUID } from 'node:crypto';
import Core from '../core.js';
import { generateAI } from './ai.js';

const MAX_BODY = 8 * 1024 * 1024;
const MAX_B64 = 1900000; // batas baris SQLite Durable Object 2 MB

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    if (p === '/api' || p === '/api/' || p === '/ws' || /^\/photo\/ph_[a-f0-9]{32}(\.jpg)?$/.test(p)) {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
      return env.PADDOC.get(env.PADDOC.idFromName('paddoc')).fetch(request);
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

export class PaddocHost extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS people (id TEXT PRIMARY KEY, json TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, name TEXT, date TEXT, status TEXT, format TEXT,
      team_mode TEXT, players INTEGER, courts INTEGER, matches INTEGER, updated INTEGER, data TEXT NOT NULL, rows TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS props (k TEXT PRIMARY KEY, v TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY, mime TEXT NOT NULL, b64 TEXT NOT NULL, created INTEGER NOT NULL)`);
    this.cache = new Map();
    this.origin = '';
    this.dirty = false;
    this.A = this.adapter();
    // ping dari HP dijawab tanpa membangunkan Durable Object
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request) {
    const url = new URL(request.url);
    this.origin = url.origin;
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
      let data = Core.call(body.fn, body.req || {});
      if (data && typeof data.then === 'function') data = await data;
      if (this.dirty) this.broadcast();
      return json({ ok: true, data: data === undefined ? null : data });
    } catch (e) {
      if (this.dirty) this.broadcast();
      if (!e.code && !/^[A-Z_]+:/.test(String(e.message))) console.error(body.fn, e && e.stack || e);
      return json({ ok: false, error: String((e && e.message) || e) });
    }
  }

  /* kirim data terbaru (sama dengan hasil poll tanpa versi) ke semua HP yang tersambung */
  broadcast() {
    const socks = this.ctx.getWebSockets();
    this.dirty = false;
    if (!socks.length) return;
    let msg;
    try {
      Core.init(this.A);
      msg = JSON.stringify({ type: 'poll', data: Core.call('poll', {}) });
    } catch (e) { console.error('broadcast', e); return; }
    socks.forEach((ws) => { try { ws.send(msg); } catch (e) { /* koneksi sudah putus */ } });
  }
  webSocketMessage() { /* HP hanya mengirim ping, dijawab otomatis */ }
  webSocketClose(ws, code) { try { ws.close(code, 'bye'); } catch (e) { /* sudah tertutup */ } }

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
        if (k === 'ACTIVE_SID' || k === 'PV') touch();
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
      generateAI: (p, kind) => generateAI(env, A, clone(p), kind)
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
