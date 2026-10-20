/* ============================================================
   Paddoc Host — foto pro AI (OpenAI Images, edit foto)
   Gaya, prompt, dan urutan model sama dengan Code.gs v2.1; bedanya hanya cara memanggil OpenAI.
   ============================================================ */
import { Buffer } from 'node:buffer';
import { LOGO_B64 } from './logo.js';

const DEFAULT_MODELS = ['gpt-image-2.5-sunburst', 'gpt-image-2', 'gpt-image-1.5', 'gpt-image-1'];

/* ---------------- host berseragam wasit ---------------- */
const HOST_STYLE = {
  outfit: ['a referee polo shirt with a contrast collar', 'a short-sleeve official referee shirt with chest pocket', 'a long-sleeve match official shirt', 'a referee quarter-zip top'],
  outfitHijab: ['a loose long-sleeve match official shirt with sleeves to the wrists', 'a long-sleeve referee quarter-zip top with a high neck'],
  colors: ['matte black with white trim', 'deep navy with orange trim', 'charcoal grey with neon yellow trim', 'black and white vertical stripes'],
  props: ['a whistle on a lanyard and a clipboard with a scorecard', 'a whistle on a lanyard and a tablet in one hand', 'a stopwatch on a lanyard and a padel ball in one hand'],
  poses: ['standing confidently with arms crossed', 'raising one hand as if signalling the start of a match', 'holding the clipboard against the chest, smiling at the camera', 'pointing toward the court with one hand']
};
function chooseHostStyle(p) {
  const hijab = p.gender === 'P' && p.hijab;
  const r = (a) => a[Math.floor(Math.random() * a.length)];
  return { hijab, outfit: r(hijab ? HOST_STYLE.outfitHijab : HOST_STYLE.outfit), color: r(HOST_STYLE.colors), prop: r(HOST_STYLE.props), pose: r(HOST_STYLE.poses), angle: 'straight-on view', light: 'bright white arena floodlights' };
}
function buildHostPrompt(p, st, withLogo) {
  const who = p.gender === 'P' ? 'a woman' : 'a man';
  const modesty = st.hijab
    ? 'She wears a hijab: keep her hijab exactly as in the photo. The outfit has long sleeves covering the arms down to the wrists, loose fit, high neckline.'
    : 'The shirt must have sleeves; never sleeveless. If the person wears a hijab or headscarf in the photo, keep it exactly and use long sleeves.';
  const logo = withLogo
    ? 'Image 1 is the person. Image 2 is the PADEL DOC club badge: place it as a small embroidered patch on the left chest, reproducing it faithfully.'
    : 'Add a small round embroidered PADEL DOC club badge on the left chest (navy circle, orange and green rings, cream winged caduceus).';
  return [
    'Edit this photo into an official portrait of a padel match referee / host.',
    'The person is ' + who + '. Keep the face, facial features, skin tone, hairstyle, glasses (if any), body shape and identity exactly the same. Do not change age or gender.',
    'Framing: waist-up (half body), centered, ' + st.angle + '. Pose: ' + st.pose + ', with ' + st.prop + '. No racket.',
    'Outfit: ' + st.outfit + ' in ' + st.color + ', with the word "HOST" small on the sleeve. ' + modesty,
    logo,
    'Background: padel arena with a blue court and glass walls, ' + st.light + ', softly blurred.',
    'Style: photorealistic sports photography, crisp detail. No other text, no watermark.'
  ].join(' ');
}

/* ---------------- admin berjas bak CEO ---------------- */
const ADMIN_STYLE = {
  outfitL: ['a tailored navy two-piece business suit with a crisp white shirt and a dark silk tie', 'a charcoal grey three-piece suit with a light blue shirt and a patterned tie',
    'a black slim-fit suit with a white shirt, open collar, no tie', 'a midnight blue double-breasted suit with a white shirt and a pocket square'],
  outfitP: ['a tailored navy blazer and trouser suit with a silk blouse', 'a charcoal grey fitted pantsuit with a cream shell top',
    'a black tailored blazer with a crisp white shirt and matching trousers', 'a camel-coloured tailored blazer suit with a white blouse'],
  outfitHijab: ['a long tailored navy blazer suit with long sleeves to the wrists and a high-neck blouse', 'a loose-fit charcoal grey long-line blazer and trousers with long sleeves',
    'a long black tailored coat-style suit with long sleeves and a high neckline'],
  poses: ['standing confidently with arms crossed', 'one hand in the trouser pocket, the other holding a padel racket at the side',
    'adjusting the jacket cuff, looking straight at the camera with a confident smile', 'holding a padel racket resting on one shoulder like an executive']
};
function chooseAdminStyle(p) {
  const hijab = p.gender === 'P' && p.hijab;
  const r = (a) => a[Math.floor(Math.random() * a.length)];
  return { hijab, outfit: r(hijab ? ADMIN_STYLE.outfitHijab : p.gender === 'P' ? ADMIN_STYLE.outfitP : ADMIN_STYLE.outfitL), color: 'executive', prop: 'business suit', pose: r(ADMIN_STYLE.poses) };
}
function buildAdminPrompt(p, st, withLogo) {
  const who = p.gender === 'P' ? 'a woman' : 'a man';
  const modesty = st.hijab
    ? 'She wears a hijab: keep her hijab exactly as in the photo (same shape and coverage). The suit has long sleeves to the wrists, loose fit, high neckline.'
    : 'If the person wears a hijab or headscarf in the photo, keep it exactly and use long sleeves.';
  const logo = withLogo
    ? 'Image 1 is the person. Image 2 is the PADEL DOC club badge: place it as a small enamel lapel pin on the left lapel, reproducing it faithfully.'
    : 'Add a small round enamel lapel pin on the left lapel: the PADEL DOC club badge (navy circle, orange and green rings, cream winged caduceus).';
  return [
    'Edit this photo into a polished executive portrait, like a CEO or club president photo for an annual report.',
    'The person is ' + who + '. Keep the face, facial features, skin tone, hairstyle, glasses (if any), body shape and identity exactly the same. Do not change age or gender.',
    'Framing: waist-up (half body), centered, straight-on view. Pose: ' + st.pose + '.',
    'Outfit: ' + st.outfit + ', perfectly fitted and pressed. ' + modesty,
    logo,
    'Background: a modern glass-walled padel club lounge overlooking a blue padel court, warm soft daylight, softly blurred.',
    'Style: photorealistic corporate portrait photography, crisp detail, confident and professional. No text, no watermark.'
  ].join(' ');
}

/* ---------------- pemain ---------------- */
/* Kombinasi terakhir disimpan (AI_RECENT) supaya pemain berikutnya tidak mendapat warna/pose/raket yang sama. */
const STYLE = {
  outfitL: ['a fitted short-sleeve polo shirt with a contrast collar', 'a crew-neck short-sleeve performance tee with raglan sleeves', 'a short-sleeve quarter-zip training shirt',
    'a short-sleeve sublimated-pattern match jersey with side panels', 'a slim short-sleeve tee worn over a long-sleeve compression layer', 'a long-sleeve fitted training shirt'],
  outfitP: ['a short-sleeve fitted polo with a small collar', 'a crew-neck short-sleeve performance tee with mesh panels', 'a short-sleeve quarter-zip fitted training top',
    'a cap-sleeve fitted sport top', 'a short-sleeve match jersey with side panels', 'a long-sleeve fitted training top'],
  outfitHijab: ['a loose long-sleeve sport top with sleeves down to the wrists', 'a long-sleeve quarter-zip training top with a high neck', 'a long-sleeve crew-neck match jersey with raglan sleeves',
    'a long-sleeve polo-style sport top with a modest loose fit', 'a long, loose tunic-style long-sleeve sport top', 'a short-sleeve match jersey layered over a long-sleeve top covering the arms to the wrists'],
  colors: ['deep navy with bright orange accents', 'crisp white with forest green trim', 'matte black with gold details', 'sky blue with white stripes',
    'coral red with navy accents', 'emerald green with cream panels', 'charcoal grey with neon yellow accents', 'royal purple with white accents',
    'burgundy with sand-beige trim', 'teal with lime green accents'],
  extras: ['a plain headband', 'a cap worn backwards', 'a clean look without accessories', 'a wristband on each arm', 'a plain sport visor', 'a small towel over one shoulder'],
  extrasHijab: ['a clean look without accessories', 'a wristband on each wrist', 'a small towel over one shoulder', 'a sport watch on one wrist'],
  brands: ['Nox', 'Adidas', 'Bullpadel', 'Royal Padel', 'Head', 'Babolat', 'Siux', 'StarVie', 'Wilson', 'Drop Shot'],
  rackets: ['a round-shaped racket in matte black with orange edges', 'a diamond-shaped carbon racket in white and electric blue',
    'a teardrop-shaped racket in glossy red and black', 'a racket with a green and white geometric face', 'a carbon-weave grey racket with a neon yellow frame',
    'a navy and gold racket with a textured face', 'a pastel turquoise and white racket', 'a silver and purple diamond-shaped racket'],
  poses: ['resting the racket on one shoulder with a relaxed smile', 'holding the racket upright beside the face, looking straight at the camera',
    'holding the racket across the chest with both hands', 'in a ready stance holding the racket forward at waist height', 'arms crossed with the racket held in one hand against the arm',
    'pointing the racket toward the camera with one hand', 'holding the racket in one hand and a padel ball in the other', 'bouncing a padel ball on the racket face, eyes on the camera'],
  angles: ['straight-on view', 'slight three-quarter turn to the left', 'slight three-quarter turn to the right', 'slightly low camera angle for a heroic look'],
  lights: ['cool blue stadium lights with warm rim light', 'bright white arena floodlights', 'evening arena lights with soft orange glow', 'dramatic spotlight with blue court reflections']
};
function pickIdx(arr, avoid) {
  let opts = arr.map((_, i) => i).filter((i) => (avoid || []).indexOf(i) < 0);
  if (!opts.length) opts = arr.map((_, i) => i);
  return opts[Math.floor(Math.random() * opts.length)];
}
function chooseStyle(p, A) {
  let recent = [];
  try { recent = JSON.parse(A.prop('AI_RECENT') || '[]'); } catch (e) { /* mulai baru */ }
  const used = (k) => recent.map((r) => r[k]);
  const hijab = p.gender === 'P' && p.hijab;
  const outfits = hijab ? STYLE.outfitHijab : (p.gender === 'P' ? STYLE.outfitP : STYLE.outfitL);
  const extras = hijab ? STYLE.extrasHijab : STYLE.extras;
  const s = {
    o: pickIdx(outfits, used('o').slice(-3)), c: pickIdx(STYLE.colors, used('c').slice(-6)), x: pickIdx(extras, used('x').slice(-2)),
    b: pickIdx(STYLE.brands, used('b').slice(-5)), r: pickIdx(STYLE.rackets, used('r').slice(-5)), p: pickIdx(STYLE.poses, used('p').slice(-5)),
    a: pickIdx(STYLE.angles, used('a').slice(-1)), l: pickIdx(STYLE.lights, used('l').slice(-1))
  };
  recent.push(s);
  A.setProp('AI_RECENT', JSON.stringify(recent.slice(-8)));
  return {
    hijab, outfit: outfits[s.o], color: STYLE.colors[s.c], extra: extras[s.x], brand: STYLE.brands[s.b], racket: STYLE.rackets[s.r],
    pose: STYLE.poses[s.p], angle: STYLE.angles[s.a], light: STYLE.lights[s.l]
  };
}
function buildPrompt(p, st, withLogo, custom) {
  if (custom) return custom.replace(/\{nama\}/g, p.name);
  const who = p.gender === 'P' ? 'a woman' : 'a man';
  const modesty = st.hijab
    ? 'She wears a hijab: keep her hijab exactly as in the photo (same shape and coverage, neatly worn). Her outfit must be modest: long sleeves covering the arms down to the wrists, loose fit, high neckline, no skin shown on the arms.'
    : 'The outfit must have sleeves (short or long); never sleeveless, never a tank top. If the person wears a hijab or headscarf in the photo, keep it exactly and use long sleeves down to the wrists instead.';
  const logo = withLogo
    ? 'Image 1 is the player. Image 2 is the PADEL DOC club badge: place it as a small, clear, embroidered patch on the left chest of the shirt, reproducing the badge faithfully (round navy badge, winged caduceus, green racket, orange ball, cream "PADEL DOC" lettering).'
    : 'Add a small round embroidered club badge on the left chest: navy circle with orange and dark green rings, a cream winged caduceus between a green padel racket and an orange ball, with the words "PADEL DOC".';
  return [
    'Edit this photo into an official professional padel player portrait.',
    'The person is ' + who + '. Keep the face, facial features, skin tone, hairstyle, glasses (if any), body shape and identity exactly the same so they are clearly recognizable as the same person. Do not change age or gender.',
    'Framing: waist-up (half body), centered, ' + st.angle + '.',
    'Pose: ' + st.pose + '. The racket is a ' + st.brand + ' padel racket: ' + st.racket + ', a solid perforated paddle without strings, with the ' + st.brand + ' logo and wordmark printed clearly on the racket face, clearly visible in the frame.',
    'Outfit: ' + st.outfit + ' in ' + st.color + ', with ' + st.extra + '. ' + modesty,
    logo,
    'Background: padel arena with a blue court and glass walls, ' + st.light + ', softly blurred with shallow depth of field.',
    'Style: photorealistic sports photography, crisp detail, like a pro tour player card photo.',
    'No other text, no numbers, no extra logos, no watermark.'
  ].join(' ');
}

/* images: [foto pemain, logo]. Kalau server menolak dua gambar, dicoba ulang dengan foto saja dan logo dideskripsikan lewat teks.
   opts.format 'jpeg'|'webp'|'png', opts.transparent: latar transparan (avatar chibi); bila model menolak, diulang tanpa transparan. */
async function callOpenAI(env, A, images, makePrompt, opts) {
  opts = opts || {};
  const base = (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const pinned = env.OPENAI_IMAGE_MODEL || '';
  const ok = A.prop('OPENAI_IMAGE_MODEL_OK');
  const models = pinned ? pinned.split(',').map((m) => m.trim()).filter(Boolean)
    : (ok ? [ok] : []).concat(DEFAULT_MODELS.filter((m) => m !== ok));
  const quality = env.OPENAI_IMAGE_QUALITY || 'medium';
  let lastErr = 'Tidak ada model yang bisa dipakai.';
  for (const model of models) {
    const attempts = images.length > 1 ? [images, [images[0]]] : [images];
    let transparent = !!opts.transparent;
    for (let a = 0; a < attempts.length; a++) {
      const imgs = attempts[a];
      const fd = new FormData();
      fd.append('model', model);
      fd.append('prompt', makePrompt(imgs.length > 1, transparent));
      fd.append('n', '1');
      fd.append('size', '1024x1536');
      fd.append('quality', quality);
      fd.append('output_format', opts.format || 'jpeg');
      if ((opts.format || 'jpeg') !== 'png') fd.append('output_compression', '85');
      if (transparent) fd.append('background', 'transparent');
      imgs.forEach((im) => fd.append('image[]', new Blob([im.bytes], { type: im.mime }), im.name));
      const res = await fetch(base + '/images/edits', { method: 'POST', headers: { Authorization: 'Bearer ' + env.OPENAI_API_KEY }, body: fd });
      const txt = await res.text();
      if (res.status === 200) {
        let b64 = null;
        try { const j = JSON.parse(txt); b64 = j.data && j.data[0] && j.data[0].b64_json; } catch (e) { /* bukan JSON */ }
        if (b64) {
          if (!pinned) A.setProp('OPENAI_IMAGE_MODEL_OK', model);
          return { b64, model, withLogo: imgs.length > 1, transparent };
        }
        lastErr = 'OpenAI tidak mengirim gambar.';
        continue;
      }
      let msg = txt;
      try { msg = JSON.parse(txt).error.message; } catch (e) { /* teks mentah */ }
      lastErr = 'OpenAI ' + res.status + ': ' + String(msg).slice(0, 300);
      // model tidak mendukung latar transparan: ulangi model yang sama dengan latar polos (dibersihkan di HP host)
      if (res.status === 400 && transparent && /background|transparen/i.test(msg)) { transparent = false; a--; continue; }
      const modelIssue = [400, 403, 404].indexOf(res.status) >= 0 && /model|does not exist|not supported|unsupported|invalid value|parameter|verified/i.test(msg);
      if (!modelIssue && res.status === 400 && /image/i.test(msg) && a === 0 && attempts.length > 1) continue; // ulangi dengan foto saja
      if (!modelIssue) throw new Error(lastErr);
      break; // coba model berikutnya
    }
  }
  throw new Error(lastErr);
}

/* dipanggil Core lewat adaptor: p = data orang, kind = 'host' | 'player'. Mengembalikan {id foto pro, catatan}. */
export async function generateAI(env, A, p, kind) {
  const src = A.photoRow(p.photoId);
  if (!src) throw new Error('INVALID: Foto asli tidak ditemukan');
  const photo = { bytes: Buffer.from(src.b64, 'base64'), mime: src.mime, name: 'foto.jpg' };
  const logo = { bytes: Buffer.from(LOGO_B64, 'base64'), mime: 'image/jpeg', name: 'paddoc-logo.jpg' };
  const style = kind === 'host' ? chooseHostStyle(p) : kind === 'admin' ? chooseAdminStyle(p) : chooseStyle(p, A);
  const out = await callOpenAI(env, A, [photo, logo], (withLogo) => kind === 'host' ? buildHostPrompt(p, style, withLogo)
    : kind === 'admin' ? buildAdminPrompt(p, style, withLogo) : buildPrompt(p, style, withLogo, env.OPENAI_IMAGE_PROMPT));
  const id = A.savePhoto('data:image/jpeg;base64,' + out.b64, p.name + '_pro');
  const note = 'Model: ' + out.model + (out.withLogo ? '' : ' (logo dari teks)') + ' | ' + style.outfit + ', ' + style.color + ' | ' +
    (style.brand ? style.brand + ', ' + style.racket : style.prop) + ' | ' + style.pose;
  return { id, note };
}

/* ---------------- avatar chibi untuk ruang tunggu ----------------
   Dibuat SEKALI dari foto pro (atau foto asli), seluruh badan, latar transparan. Disimpan permanen;
   versi kecil untuk lobi dibuat oleh HP admin/host (Core.saveSprite), jadi membuka lobi tidak memanggil OpenAI. */
function buildChibiPrompt(p, kind, withLogo, transparent, pose) {
  const who = p.gender === 'P' ? 'a woman' : 'a man';
  const hijab = p.gender === 'P' && p.hijab;
  const host = kind === 'host';
  const modesty = hijab
    ? 'She wears a hijab: keep the hijab as in the photo. Fully covered modest sportswear: long sleeves to the wrists, loose fit, long pants or long leggings, no skin on arms or legs.'
    : 'Sleeves are required (short or long); never sleeveless and never a tank top. If the person wears a hijab or headscarf, keep it and use long sleeves and long pants.';
  const outfit = host
    ? 'Outfit: a padel match referee / host uniform: black-and-white vertical striped referee shirt, black trousers, a whistle on a lanyard, holding a small scorecard in one hand. No racket.'
    : 'Outfit: colorful modern padel sportswear (shirt with sleeves, shorts or skirt, padel shoes). Holding a padel racket (solid perforated paddle without strings) in the right hand.';
  const logo = withLogo
    ? 'Image 1 is the person. Image 2 is the PADEL DOC club badge: put it small on the left chest of the shirt, simplified but recognizable.'
    : 'Put a small round PADEL DOC club badge on the left chest (navy circle with orange and green rings).';
  return [
    'Create a cute chibi-style full-body game avatar of the person in the reference photo: big head, small body (about 2.5 heads tall).',
    'The person is ' + who + '. Keep the face, skin tone, hairstyle and glasses (if any) recognizable as the same person. Do not change age or gender.',
    pose || 'Pose: standing, facing the viewer turned slightly to one side, cheerful expression, whole body visible from head to shoes, centered with a small margin.',
    outfit, modesty, logo,
    transparent ? 'Background: fully transparent (no floor, no shadow, no scenery).' : 'Background: plain flat pure white, nothing else (no floor, no shadow, no scenery).',
    'Style: clean 2D game character illustration, soft cel shading, crisp dark outline, vivid colors. No text other than the badge, no watermark.'
  ].join(' ');
}
/* pose selebrasi podium: karakter chibi yang sama, melompat kegirangan. Rujukan utama = avatar chibi yang sudah ada */
const CELEB_POSE = 'Pose: celebrating a tournament win on a podium: jumping with joy, both arms raised high in victory, one fist holding a shiny small golden trophy cup, ' +
  'the other hand holding the padel racket up, huge open-mouth happy smile, eyes closed with joy, whole body visible from head to shoes, centered with a small margin. No confetti, no sparkles.';
export async function generateCelebrate(env, A, p) {
  const chibi = A.photoRow(p.chibiId);
  const src = chibi || A.photoRow(p.proId) || A.photoRow(p.photoId);
  if (!src) throw new Error('INVALID: Belum ada foto atau avatar');
  const ref = { bytes: Buffer.from(src.b64, 'base64'), mime: src.mime, name: chibi ? 'avatar.webp' : 'foto.jpg' };
  const logo = { bytes: Buffer.from(LOGO_B64, 'base64'), mime: 'image/jpeg', name: 'paddoc-logo.jpg' };
  const same = chibi ? 'Image 1 is the existing chibi avatar of this player: redraw exactly the SAME character (same face, hairstyle, skin tone, glasses, hijab if any, outfit colors and badge) in a new pose. ' : '';
  const out = await callOpenAI(env, A, [ref, logo], (withLogo, transparent) => same + buildChibiPrompt(p, 'player', withLogo, transparent, CELEB_POSE), { format: 'webp', transparent: true });
  const id = A.savePhoto('data:image/webp;base64,' + out.b64, p.name + '_celeb');
  return { id, note: 'Model: ' + out.model };
}
export async function generateChibi(env, A, p, kind) {
  const src = A.photoRow(p.proId) || A.photoRow(p.photoId);
  if (!src) throw new Error('INVALID: Belum ada foto untuk dijadikan avatar');
  const photo = { bytes: Buffer.from(src.b64, 'base64'), mime: src.mime, name: 'foto.jpg' };
  const logo = { bytes: Buffer.from(LOGO_B64, 'base64'), mime: 'image/jpeg', name: 'paddoc-logo.jpg' };
  const out = await callOpenAI(env, A, [photo, logo], (withLogo, transparent) => buildChibiPrompt(p, kind, withLogo, transparent), { format: 'webp', transparent: true });
  const id = A.savePhoto('data:image/webp;base64,' + out.b64, p.name + '_chibi');
  return { id, note: 'Model: ' + out.model + (out.transparent ? '' : ' (latar polos, dibersihkan otomatis)') };
}
