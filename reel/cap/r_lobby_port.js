const { chromium } = require('../pw.js');
const vrec = require('./vrec.js'), { mountLobby } = require('./harness.js');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 2.667, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.clock.install();
  await mountLobby(p, { theme: 'court', host: 'Aziz', me: 'Dani', countdown: 54 * 60 + 24 });
  await p.clock.pauseAt(Date.now() + 60000);
  const v = vrec(p, 'raw_lobby_port.mp4');
  await v.frames(900);
  for (let i = 0; i < 21; i++) { await p.evaluate(() => __join(1)); await v.frames(230); }
  await v.frames(700);
  // chat host dulu, lalu empat pemain (semua sudah memberi izin), jeda 0,5 dtk supaya muat di segmen chat 2,6 dtk
  const lines = [['Aziz', 'Selamat datang di lobi! Konfirmasi hadir ya 🙌'], ['Farid', 'Otw! Gas malam ini 🔥'], ['Nina', 'Bawa bola baru ya 🎾'],
    ['Toha', 'Yang kalah traktir es teh 😆'], ['Sisil', 'VAMOS!!']];
  for (const [n, t] of lines) { await p.evaluate(([n, t]) => __say(n, t), [n, t]); await v.frames(500); }
  await v.frames(1500);
  v.done(); await b.close();
})();
