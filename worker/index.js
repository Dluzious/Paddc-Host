/* ============================================================
   Paddoc Host — backend Cloudflare Worker
   Data pemain, sesi, dan foto tersimpan di Cloudflare D1.
   Kontraknya sama dengan Apps Script lama:
   POST /api  {fn, pin, args}  ->  {ok:true, data} | {ok:false, error}
   GET  /photo/<id>            ->  file foto (JPEG)
   ============================================================ */
import { Buffer } from 'node:buffer';

const PIN_WINDOW = 10 * 60 * 1000; // jendela hitung salah PIN & lama kunci
const PIN_LIMIT_IP = 5;            // salah PIN per perangkat/IP sebelum dikunci
const PIN_LIMIT_ALL = 30;          // salah PIN total dari semua IP sebelum dikunci
const MAX_B64 = 1900000;           // batas baris D1 2 MB (foto disimpan sebagai base64)
const MAX_BODY = 8 * 1024 * 1024;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, gender TEXT NOT NULL DEFAULT 'L',
    hijab INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
    photo_id TEXT, pro_id TEXT, ai_status TEXT NOT NULL DEFAULT 'none', ai_note TEXT,
    created INTEGER NOT NULL, updated INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY, name TEXT, date TEXT, status TEXT, format TEXT, team_mode TEXT,
    players INTEGER, courts INTEGER, matches INTEGER, updated INTEGER, data TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS photos (
    id TEXT PRIMARY KEY, player_id TEXT, kind TEXT, mime TEXT NOT NULL, b64 TEXT NOT NULL, created INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS pin_attempts (
    key TEXT PRIMARY KEY, fails INTEGER NOT NULL, window_start INTEGER NOT NULL, locked_until INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`
];
let schemaReady = null;
function ensureSchema(env) {
  if (!schemaReady) {
    schemaReady = env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s))).catch((e) => { schemaReady = null; throw e; });
  }
  return schemaReady;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname === '/api/') {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
      if (request.method !== 'POST') return json({ ok: false, error: 'Gunakan POST' }, 405);
      return handleApi(request, env, ctx, url.origin);
    }
    const ph = url.pathname.match(/^\/photo\/(ph_[a-f0-9]{32})(?:\.jpg)?$/);
    if (ph && (request.method === 'GET' || request.method === 'HEAD')) return servePhoto(env, ph[1]);
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404 });
  }
};

/* ---------- respons ---------- */
function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
class AppError extends Error {}

async function handleApi(request, env, ctx, origin) {
  let body;
  try {
    const len = +(request.headers.get('Content-Length') || 0);
    if (len > MAX_BODY) throw new AppError('Data terlalu besar');
    body = JSON.parse(await request.text());
  } catch (e) {
    return json({ ok: false, error: e instanceof AppError ? e.message : 'Permintaan tidak valid' });
  }
  try {
    if (!env.DB) throw new AppError('Database D1 belum dihubungkan ke Worker (binding "DB").');
    await ensureSchema(env);
    await checkPin(env, request.headers.get('CF-Connecting-IP') || 'local', String(body.pin || ''));
    const fn = API[body.fn];
    if (!fn) throw new AppError('Fungsi tidak dikenal: ' + body.fn);
    const args = Array.isArray(body.args) ? body.args : [];
    const data = await fn({ env, ctx, origin }, ...args);
    return json({ ok: true, data: data === undefined ? null : data });
  } catch (e) {
    if (!(e instanceof AppError)) console.error(body && body.fn, e && e.stack || e);
    return json({ ok: false, error: e instanceof AppError ? e.message : 'Kesalahan server: ' + (e && e.message || e) });
  }
}

/* ---------- PIN host ---------- */
async function checkPin(env, ip, pin) {
  const now = Date.now();
  const ipKey = 'ip:' + ip;
  const rows = (await env.DB.prepare('SELECT key, fails, locked_until FROM pin_attempts WHERE key IN (?1, ?2)')
    .bind(ipKey, 'all').all()).results;
  if (rows.some((r) => r.locked_until > now)) throw new AppError('PIN_LOCKED');
  if (!env.APP_PIN) throw new AppError('PIN_NOT_SET');
  if (!pin) throw new AppError('PIN_REQUIRED');
  if (!(await sameText(pin, String(env.APP_PIN)))) {
    const bump = env.DB.prepare(
      `INSERT INTO pin_attempts (key, fails, window_start, locked_until) VALUES (?1, 1, ?2, CASE WHEN ?3 <= 1 THEN ?2 + ?4 ELSE 0 END)
       ON CONFLICT(key) DO UPDATE SET
         fails = CASE WHEN window_start < ?2 - ?4 THEN 1 ELSE fails + 1 END,
         window_start = CASE WHEN window_start < ?2 - ?4 THEN ?2 ELSE window_start END,
         locked_until = CASE WHEN (CASE WHEN window_start < ?2 - ?4 THEN 1 ELSE fails + 1 END) >= ?3 THEN ?2 + ?4 ELSE locked_until END`);
    await env.DB.batch([bump.bind(ipKey, now, PIN_LIMIT_IP, PIN_WINDOW), bump.bind('all', now, PIN_LIMIT_ALL, PIN_WINDOW)]);
    throw new AppError('PIN_WRONG');
  }
  if (rows.some((r) => r.key === ipKey)) await env.DB.prepare('DELETE FROM pin_attempts WHERE key = ?1').bind(ipKey).run();
}
async function sameText(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  return crypto.subtle.timingSafeEqual(ha, hb);
}

/* ---------- util ---------- */
function rid(prefix) {
  const b = new Uint8Array(prefix === 'ph_' ? 16 : 5);
  crypto.getRandomValues(b);
  return prefix + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}
function photoUrl(origin, id) { return id ? origin + '/photo/' + id + '.jpg' : ''; }
function playerOut(origin, r) {
  return {
    id: r.id, name: r.name, gender: r.gender, hijab: !!r.hijab, archived: !!r.archived,
    photoId: r.photo_id || '', photoUrl: photoUrl(origin, r.photo_id),
    proId: r.pro_id || '', proUrl: photoUrl(origin, r.pro_id),
    aiStatus: r.ai_status || 'none', aiNote: r.ai_note || '', created: r.created, updated: r.updated
  };
}
function decodeImage(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(dataUrl || ''));
  if (!m) throw new AppError('Format foto tidak dikenali');
  const b64 = m[2].replace(/\s+/g, '');
  if (b64.length > MAX_B64) throw new AppError('Foto terlalu besar (maks ±1,4 MB)');
  return { mime: m[1].toLowerCase(), b64 };
}
function putPhoto(env, playerId, kind, img) {
  const id = rid('ph_');
  return { id, stmt: env.DB.prepare('INSERT INTO photos (id, player_id, kind, mime, b64, created) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
    .bind(id, playerId, kind, img.mime, img.b64, Date.now()) };
}
function delPhoto(env, id) { return env.DB.prepare('DELETE FROM photos WHERE id = ?1').bind(id); }
async function getPlayerRow(env, id) {
  return env.DB.prepare('SELECT * FROM players WHERE id = ?1').bind(id).first();
}
function summary(s) {
  return {
    players: Object.keys(s.parts || {}).filter((k) => s.parts[k] && s.parts[k].active).length,
    courts: (s.courts || []).filter((c) => c.active).length,
    matches: (s.matches || []).filter((m) => m.status === 'done').length
  };
}

async function servePhoto(env, id) {
  if (!env.DB) return new Response('Not found', { status: 404 });
  await ensureSchema(env);
  const r = await env.DB.prepare('SELECT mime, b64 FROM photos WHERE id = ?1').bind(id).first();
  if (!r) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return new Response(Buffer.from(r.b64, 'base64'), {
    headers: { 'Content-Type': r.mime, 'Cache-Control': 'public, max-age=31536000, immutable', 'Access-Control-Allow-Origin': '*' }
  });
}

/* ---------- fungsi API ---------- */
const API = {
  async getInitialData({ env, origin }) {
    const [pl, ss, mg] = await env.DB.batch([
      env.DB.prepare('SELECT * FROM players'),
      env.DB.prepare('SELECT id, name, date, status, format, team_mode, players, courts, matches, updated FROM sessions ORDER BY updated DESC'),
      env.DB.prepare("SELECT value FROM meta WHERE key = 'migrated_at'")
    ]);
    return {
      players: pl.results.map((r) => playerOut(origin, r)),
      sessions: ss.results.map((r) => ({
        id: r.id, name: r.name, date: r.date, status: r.status, format: r.format, teamMode: r.team_mode,
        players: r.players, courts: r.courts, matches: r.matches, updated: r.updated
      })),
      ai: { enabled: !!env.OPENAI_API_KEY },
      migratedAt: mg.results.length ? +mg.results[0].value : 0
    };
  },

  async getSession({ env }, id) {
    const r = await env.DB.prepare('SELECT data FROM sessions WHERE id = ?1').bind(String(id)).first();
    return r ? JSON.parse(r.data) : null;
  },

  async saveSession({ env }, s) {
    if (!s || typeof s !== 'object' || !/^[\w-]{1,64}$/.test(String(s.id || ''))) throw new AppError('Data sesi tidak valid');
    const data = JSON.stringify(s);
    if (data.length > MAX_B64) throw new AppError('Data sesi terlalu besar');
    const sum = summary(s);
    const updated = +s.updated || Date.now();
    await env.DB.prepare(
      `INSERT INTO sessions (id, name, date, status, format, team_mode, players, courts, matches, updated, data)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
       ON CONFLICT(id) DO UPDATE SET name = ?2, date = ?3, status = ?4, format = ?5, team_mode = ?6,
         players = ?7, courts = ?8, matches = ?9, updated = ?10, data = ?11`)
      .bind(s.id, String(s.name || ''), String(s.date || ''), String(s.status || ''), String(s.format || ''), String(s.teamMode || ''),
        sum.players, sum.courts, sum.matches, updated, data).run();
    return { updated };
  },

  async deleteSession({ env }, id) {
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?1').bind(String(id)).run();
    return true;
  },

  async savePlayer({ env, origin }, p, photoData) {
    if (!p || typeof p !== 'object') throw new AppError('Data pemain tidak valid');
    const name = String(p.name || '').trim().slice(0, 40);
    if (!name) throw new AppError('Nama belum diisi');
    const gender = p.gender === 'P' ? 'P' : 'L';
    const now = Date.now();
    const cur = p.id ? await getPlayerRow(env, String(p.id)) : null;
    const id = cur ? cur.id : rid('p_');
    const stmts = [];
    let photoId = cur ? cur.photo_id : null;
    if (photoData) {
      const ph = putPhoto(env, id, 'asli', decodeImage(photoData));
      stmts.push(ph.stmt);
      if (photoId) stmts.push(delPhoto(env, photoId));
      photoId = ph.id;
    }
    stmts.push(env.DB.prepare(
      `INSERT INTO players (id, name, gender, hijab, archived, photo_id, created, updated) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
       ON CONFLICT(id) DO UPDATE SET name = ?2, gender = ?3, hijab = ?4, archived = ?5, photo_id = ?6, updated = ?7`)
      .bind(id, name, gender, gender === 'P' && p.hijab ? 1 : 0, p.archived ? 1 : 0, photoId, now));
    await env.DB.batch(stmts);
    return playerOut(origin, await getPlayerRow(env, id));
  },

  async getPhotoData({ env }, fid) {
    const r = await env.DB.prepare('SELECT mime, b64 FROM photos WHERE id = ?1').bind(String(fid)).first();
    return r ? 'data:' + r.mime + ';base64,' + r.b64 : null;
  },

  async generateProPhoto({ env, ctx, origin }, pid) {
    if (!env.OPENAI_API_KEY) throw new AppError('OPENAI_API_KEY belum diisi di Worker');
    const row = await getPlayerRow(env, String(pid));
    if (!row) throw new AppError('Pemain tidak ditemukan');
    if (!row.photo_id) throw new AppError('Pemain belum punya foto asli');
    const src = await env.DB.prepare('SELECT mime, b64 FROM photos WHERE id = ?1').bind(row.photo_id).first();
    if (!src) throw new AppError('Foto asli tidak ditemukan');
    const work = proPhoto(env, row, src).then((out) => {
      const ph = putPhoto(env, row.id, 'pro', { mime: 'image/jpeg', b64: out.b64 });
      const stmts = [ph.stmt, env.DB.prepare("UPDATE players SET pro_id = ?2, ai_status = 'done', ai_note = ?3, updated = ?4 WHERE id = ?1")
        .bind(row.id, ph.id, out.note, Date.now())];
      if (row.pro_id) stmts.push(delPhoto(env, row.pro_id));
      return env.DB.batch(stmts);
    }, (e) => env.DB.prepare("UPDATE players SET ai_status = 'error', ai_note = ?2 WHERE id = ?1")
      .bind(row.id, 'Gagal: ' + String(e && e.message || e).slice(0, 300)).run().then(() => { throw e; }));
    // kalau layar HP terkunci / koneksi putus, hasil tetap disimpan (Cloudflare memberi waktu tambahan ±30 detik)
    if (ctx && ctx.waitUntil) ctx.waitUntil(work.catch(() => {}));
    await work;
    return playerOut(origin, await getPlayerRow(env, row.id));
  },

  /* pindahan dari Google Sheet: pemain dengan ID, foto asli & foto pro lama */
  async importPlayer({ env, origin }, p, photoData, proData) {
    if (!p || !/^[\w-]{1,64}$/.test(String(p.id || ''))) throw new AppError('ID pemain tidak valid');
    const id = String(p.id);
    const cur = await getPlayerRow(env, id);
    const gender = p.gender === 'P' ? 'P' : 'L';
    const stmts = [];
    let photoId = cur ? cur.photo_id : null, proId = cur ? cur.pro_id : null;
    if (photoData) {
      const ph = putPhoto(env, id, 'asli', decodeImage(photoData));
      stmts.push(ph.stmt); if (photoId) stmts.push(delPhoto(env, photoId)); photoId = ph.id;
    }
    if (proData) {
      const ph = putPhoto(env, id, 'pro', decodeImage(proData));
      stmts.push(ph.stmt); if (proId) stmts.push(delPhoto(env, proId)); proId = ph.id;
    }
    const status = proId ? 'done' : p.aiStatus === 'error' ? 'error' : 'none';
    const created = toTime(p.created) || Date.now(), updated = toTime(p.updated) || Date.now();
    stmts.push(env.DB.prepare(
      `INSERT INTO players (id, name, gender, hijab, archived, photo_id, pro_id, ai_status, ai_note, created, updated)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
       ON CONFLICT(id) DO UPDATE SET name = ?2, gender = ?3, hijab = ?4, archived = ?5, photo_id = ?6, pro_id = ?7,
         ai_status = ?8, ai_note = ?9, updated = ?11`)
      .bind(id, String(p.name || '?').trim().slice(0, 40) || '?', gender, gender === 'P' && truthy(p.hijab) ? 1 : 0, truthy(p.archived) ? 1 : 0,
        photoId, proId, status, String(p.aiNote || '').slice(0, 1000), created, updated));
    await env.DB.batch(stmts);
    return playerOut(origin, await getPlayerRow(env, id));
  },

  async markMigrated({ env }) {
    await env.DB.prepare("INSERT INTO meta (key, value) VALUES ('migrated_at', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1")
      .bind(String(Date.now())).run();
    return true;
  },

  /* cadangan lengkap (tanpa file foto) */
  async exportAll({ env, origin }) {
    const [pl, ss] = await env.DB.batch([
      env.DB.prepare('SELECT * FROM players ORDER BY name'),
      env.DB.prepare('SELECT data FROM sessions ORDER BY updated DESC')
    ]);
    return {
      exported: Date.now(),
      players: pl.results.map((r) => playerOut(origin, r)),
      sessions: ss.results.map((r) => JSON.parse(r.data))
    };
  }
};
function truthy(v) { return v === true || v === 1 || /^(true|1|ya|yes)$/i.test(String(v || '')); }
function toTime(v) {
  if (typeof v === 'number') return v;
  const t = Date.parse(v || '');
  return isNaN(t) ? 0 : t;
}

/* ---------- foto pro AI (OpenAI) ---------- */
const OUTFITS = [
  'a short-sleeve quarter-zip training shirt', 'a crew-neck short-sleeve performance tee with raglan sleeves',
  'a short-sleeve match jersey with side panels', 'a short-sleeve sublimated-pattern match jersey with side panels',
  'a polo-collar short-sleeve padel shirt', 'a slim short-sleeve tee worn over a long-sleeve compression layer',
  'a long-sleeve fitted training shirt'
];
const OUTFITS_COVERED = [
  'a long-sleeve fitted training top', 'a long-sleeve quarter-zip training top',
  'a long-sleeve loose-fit performance tunic top', 'a slim short-sleeve tee worn over a long-sleeve compression layer'
];
const COLORS = [
  'emerald green with cream panels', 'deep navy with bright orange accents', 'crisp white with forest green trim',
  'royal purple with white accents', 'coral red with navy accents', 'teal with lime green accents',
  'burgundy with sand-beige trim', 'matte black with gold details', 'charcoal grey with neon yellow accents'
];
const BRANDS = ['Head', 'Babolat', 'Bullpadel', 'Nox', 'StarVie', 'Adidas', 'Drop Shot', 'Siux'];
const RACKETS = [
  'a silver and purple diamond-shaped racket', 'a carbon-weave grey racket with a neon yellow frame',
  'a round-shaped racket in matte black with orange edges', 'a navy and gold racket with a textured face',
  'a racket with a green and white geometric face', 'a teardrop-shaped racket in glossy red and black',
  'a pastel turquoise and white racket'
];
const POSES = [
  'resting the racket on one shoulder with a relaxed smile', 'holding the racket across the chest with both hands',
  'holding the racket upright beside the face, looking straight at the camera', 'pointing the racket toward the camera with one hand',
  'holding the racket in one hand and a padel ball in the other', 'arms crossed with the racket held in one hand against the arm',
  'in a ready stance holding the racket forward at waist height', 'bouncing a padel ball on the racket face, eyes on the camera'
];
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

function proPrompt(p) {
  const covered = p.gender === 'P' && p.hijab;
  const outfit = pick(covered ? OUTFITS_COVERED : OUTFITS) + ', ' + pick(COLORS);
  const racket = pick(BRANDS) + ', ' + pick(RACKETS);
  const pose = pick(POSES);
  const lines = [
    'Turn this photo into a professional half-body (waist-up) sports portrait of the SAME person for a padel club player card.',
    'Keep the face, facial features, skin tone, age, body build' + (covered ? '' : ' and hairstyle') + ' exactly like the original photo; the person must stay clearly recognisable.',
    'Outfit: ' + outfit + ', clean modern padel sportswear without any visible logos or text.',
    'Holding a padel racket (solid perforated paddle without strings, short handle): ' + racket + '.',
    'Pose: ' + pose + '.',
    'Background: a softly blurred indoor padel court with blue glass walls and arena lighting, shallow depth of field.',
    'Lighting: bright professional studio sports-photography lighting, natural colours, sharp focus on the face.',
    'Photorealistic, vertical portrait framing from the waist up, the person centred, no text, no watermark, no extra people.'
  ];
  if (covered) lines.splice(3, 0, 'She wears a hijab: keep the hijab fully on, covering the hair, ears and neck as in the original, with long sleeves covering the arms to the wrists.');
  return { prompt: lines.join('\n'), note: [outfit, racket, pose] };
}

async function proPhoto(env, row, src) {
  const base = (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const models = String(env.OPENAI_IMAGE_MODEL || 'gpt-image-1').split(',').map((m) => m.trim()).filter(Boolean);
  const pr = proPrompt({ gender: row.gender, hijab: !!row.hijab });
  let lastErr = null;
  for (const model of models) {
    const fd = new FormData();
    fd.append('model', model);
    fd.append('image', new Blob([Buffer.from(src.b64, 'base64')], { type: src.mime }), src.mime === 'image/png' ? 'photo.png' : 'photo.jpg');
    fd.append('prompt', pr.prompt);
    fd.append('size', '1024x1536');
    fd.append('quality', env.OPENAI_IMAGE_QUALITY || 'high');
    fd.append('output_format', 'jpeg');
    fd.append('output_compression', '85');
    fd.append('n', '1');
    if (/^gpt-image-1(\b|$)/.test(model)) fd.append('input_fidelity', 'high');
    const res = await fetch(base + '/images/edits', { method: 'POST', headers: { Authorization: 'Bearer ' + env.OPENAI_API_KEY }, body: fd });
    const j = await res.json().catch(() => ({}));
    const b64 = j && j.data && j.data[0] && j.data[0].b64_json;
    if (res.ok && b64) {
      if (b64.length > MAX_B64) throw new AppError('Foto hasil AI terlalu besar');
      return { b64, note: ['Model: ' + model].concat(pr.note).join(' | ') };
    }
    const msg = (j && j.error && j.error.message) || ('OpenAI ' + res.status);
    lastErr = new AppError(msg);
    // model lain dicoba hanya kalau masalahnya di nama model
    if (!(res.status === 404 || /model/i.test(msg))) break;
  }
  throw lastErr || new AppError('Model AI belum diatur');
}
