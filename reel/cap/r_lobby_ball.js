const { chromium } = require('../pw.js');
const vrec = require('./vrec.js'), { mountLobby } = require('./harness.js');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 2.667, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.clock.install();
  await mountLobby(p, { theme: 'court', host: 'Aziz', me: 'Dani', countdown: 54 * 60 + 2 });
  await p.evaluate(() => { __join(40); const s = document.createElement('style'); s.textContent = '.lb-toast{display:none!important}'; document.head.appendChild(s); });
  await p.clock.runFor(2500);
  await p.clock.pauseAt(Date.now() + 60000);
  const v = vrec(p, 'raw_lobby_ball.mp4');
  await p.evaluate(() => __tap('[data-k="playBtn"]'));
  await v.frames(700);
  for (let i = 0; i < 3; i++) { await p.evaluate(() => __tap('[data-k="throw"]')); await v.frames(3300); }
  v.done(); await b.close();
})();
