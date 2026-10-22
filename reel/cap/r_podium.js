const { chromium } = require('../pw.js');
const vrec = require('./vrec.js');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 2.667, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36' });
  await ctx.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { get: () => true }); try { localStorage.setItem('paddoc_notif_skip', '1'); } catch (e) {} });
  const p = await ctx.newPage();
  await p.clock.install();
  await p.goto('https://paddoc-host.lulunurulula.workers.dev/', { waitUntil: 'networkidle' });
  await p.clock.runFor(2500); await p.waitForTimeout(1500);
  await p.clock.pauseAt(Date.now() + 60000);
  const r = vrec(p, 'podium_live.mp4');
  await r.frames(500);
  await p.evaluate(() => document.querySelector('[data-act="podium"]').click());
  await p.waitForTimeout(2500);                 // foto & avatar sempat dimuat (jaringan berjalan real-time)
  await r.frames(10000);
  r.done(); await b.close();
})();
