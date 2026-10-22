const { chromium } = require('../pw.js');
const vrec = require('./vrec.js'), { mountLobby } = require('./harness.js');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 3, hasTouch: true });
  const p = await ctx.newPage();
  await p.clock.install();
  await mountLobby(p, { theme: 'beach', host: 'Aziz', me: 'Lulu', countdown: 54 * 60 + 24 });
  await p.evaluate(() => { __join(10); const s = document.createElement('style'); s.textContent = '.lb-toast{display:none!important}'; document.head.appendChild(s); });
  await p.clock.runFor(2500);
  await p.clock.pauseAt(Date.now() + 60000);
  const v = vrec(p, 'raw_lobby_beach.mp4');
  await v.frames(300);
  for (let i = 0; i < 10; i++) { await p.evaluate(() => __join(1)); await v.frames(250); }
  await p.evaluate(() => __say('Dianty', 'Siap gaspol malam ini!'));
  await v.frames(700);
  await p.evaluate(() => __tap('[data-k="playBtn"]'));
  await v.frames(300);
  await p.evaluate(() => __tap('[data-k="throw"]'));
  await v.frames(3000);
  v.done(); await b.close();
})();
