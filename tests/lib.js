// alat bersama untuk uji: folder hasil (screenshot/unduhan), file contoh, dan konteks browser
const fs = require('fs'), path = require('path'), os = require('os');
// di luar repo: wrangler dev memuat ulang server setiap ada file baru di folder aplikasi
const OUT = process.env.PADDOC_TEST_OUT || path.join(os.tmpdir(), 'paddoc-tests');

// folder hasil per uji: <OUT>/<nama>
exports.out = (name) => { const d = path.join(OUT, name); fs.mkdirSync(d, { recursive: true }); return d; };
exports.fixture = (f) => path.join(__dirname, 'fixtures', f);
// catatan panggilan ke OpenAI tiruan (ditulis tests/mock/openai.mjs)
exports.openaiLog = path.join(OUT, 'openai.log');

/* Akun uji dibuat dengan PIN bawaan 123456. Kartu pengingat "ganti PIN" di Home disembunyikan di browser uji (pinDefault
   diubah di jawaban /api) supaya tampilan sama dengan akun biasa. Pengingatnya diuji tersendiri di e2e/15-pengingat-pin.js. */
exports.ctx = async (browser, opts, keepPinDefault) => {
  const c = await browser.newContext(opts);
  if (!keepPinDefault) await c.route('**/api', async (route) => {
    let res;
    try { res = await route.fetch(); } catch (e) { return route.abort('connectionrefused').catch(() => {}); }   // server mati

    const body = (await res.text()).replace(/"pinDefault":true/g, '"pinDefault":false');
    await route.fulfill({ response: res, body });
  });
  return c;
};
