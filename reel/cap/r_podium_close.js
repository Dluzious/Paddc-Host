// Close-up juara di podium aplikasi live (hanya membaca dashboard publik).
// Kanvas podium di ceremony.js dibatasi 1400 px sisi terpanjang; khusus di browser perekam ini batas itu
// dilonggarkan supaya close-up tetap tajam. Aplikasinya sendiri tidak diubah.
const { chromium } = require('../pw.js');
const vrec = require('./vrec.js');
const EXPLORE = process.argv[2] === 'explore';
const CLIP = { x: 98, y: 75, width: 208, height: 370 };          // area juara 1 (CSS px, layar 405x720)
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 1080 / CLIP.width, isMobile: true, hasTouch: true,
    serviceWorkers: 'block', userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36' });
  await ctx.route('**/ceremony.js', async route => {
    const r = await route.fetch(), body = (await r.text()).replace('1400 / Math.max(W, H)', '8000 / Math.max(W, H)');
    if (body.indexOf('8000 / Math.max') < 0) throw new Error('batas kanvas ceremony.js tidak ditemukan');
    await route.fulfill({ response: r, body });
  });
  await ctx.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { get: () => true }); try { localStorage.setItem('paddoc_notif_skip', '1'); } catch (e) {} });
  const p = await ctx.newPage();
  await p.clock.install();
  await p.goto('https://paddoc-host.lulunurulula.workers.dev/', { waitUntil: 'networkidle' });
  await p.clock.runFor(2500); await p.waitForTimeout(1500);
  await p.clock.pauseAt(Date.now() + 60000);
  await p.evaluate(() => document.querySelector('[data-act="podium"]').click());
  await p.waitForTimeout(3000);                                   // foto & avatar sempat dimuat
  const v = vrec(p, EXPLORE ? 'x_close.mp4' : 'raw_podium_close.mp4', { clip: CLIP });
  await v.skip(5500);                                             // podium_a sudah menampilkan 0-5,5 dtk pertama
  if (EXPLORE) { await p.screenshot({ path: 'close_x.png', clip: CLIP }); await p.screenshot({ path: 'close_full.png', scale: 'css' }); await b.close(); return; }
  await v.frames(3600);
  v.done(); await b.close();
})();
