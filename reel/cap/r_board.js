// Papan court iPad (landscape) dari mode demo dengan nama & foto asli: acak ulang Court 1 & 2, lalu Panggil.
// Data hanya di browser perekam (mode demo), tidak menulis ke server.
const { chromium } = require('../pw.js');
const vrec = require('./vrec.js'), { openDemoApp, login } = require('./demoapp.js');
const EXPLORE = process.argv[2] === 'explore';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: EXPLORE ? 1 : 1.5, hasTouch: true });
  const p = await ctx.newPage();
  await p.clock.install();
  const tick = async ms => { for (let i = 0; i < ms; i += 100) await p.clock.runFor(100); await p.waitForTimeout(150); };
  await openDemoApp(p, tick);
  // warna court seperti papan asli di venue, Aziz jadi wasit Court 1
  await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('paddoc_demo_v2'));
    const aziz = st.people.find(x => x.name === 'Aziz');
    Object.values(st.sessions).forEach(s => s.courts.forEach((c, i) => { c.color = ['orange', 'green', 'blue'][i] || 'blue'; if (i === 0 && aziz) c.hostId = aziz.id; }));
    localStorage.setItem('paddoc_demo_v2', JSON.stringify(st));
    localStorage.setItem('paddoc_theme', JSON.stringify('dark'));   // seperti papan iPad di venue
  });
  await p.reload(); await tick(2500);
  await login(p, tick, 'admin');
  await p.evaluate(() => document.querySelector('[data-act="menu"]').click()); await tick(600);
  await p.evaluate(() => document.querySelector('[data-mi="board"]').click()); await tick(2000);
  await p.waitForTimeout(3000);                                   // foto dari server live sempat dimuat
  await p.evaluate(() => {
    const st = document.createElement('style');
    st.textContent = '#sync{display:none!important}.tapfx{position:fixed;z-index:99999;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;background:rgba(255,255,255,.55);border:3px solid #fff;box-shadow:0 0 0 2px rgba(0,0,0,.15);pointer-events:none;animation:tapfx .55s ease-out forwards}@keyframes tapfx{0%{transform:scale(.4);opacity:1}100%{transform:scale(1.5);opacity:0}}';
    document.head.appendChild(st);
    window.__tapEl = (el, slow) => {
      const r = el.getBoundingClientRect(), d = document.createElement('div'); d.className = 'tapfx';
      d.style.left = (r.left + r.width / 2) + 'px'; d.style.top = (r.top + r.height / 2) + 'px'; document.body.appendChild(d);
      setTimeout(() => d.remove(), 700);
      if (slow) { const ST = window.setTimeout; window.setTimeout = (f, ms, ...a) => ST(f, ms === 160 ? slow : ms, ...a); setTimeout(() => { window.setTimeout = ST; }, 50); }
      el.click();
    };
    window.__court = (i, act) => document.querySelectorAll('.court')[i].querySelector('[data-act="' + act + '"]');
  });
  if (EXPLORE) {
    await p.screenshot({ path: 'bx1.png' });
    console.log(await p.evaluate(() => document.querySelectorAll('.court').length + ' court, reshuffle ' + document.querySelectorAll('[data-act="reshuffle"]').length));
    await b.close(); return;
  }
  await p.clock.pauseAt(Date.now() + 60000);
  const v = vrec(p, 'raw_board.mp4');
  await v.frames(500);
  await p.evaluate(() => __tapEl(__court(0, 'reshuffle'), 1100)); await v.frames(2000);
  await p.evaluate(() => __tapEl(__court(1, 'reshuffle'), 1100)); await v.frames(2000);
  await p.evaluate(() => __tapEl(__court(0, 'call'))); await v.frames(2300);
  // susunan Court 1 setelah diacak, supaya adegan HP berikutnya memanggil orang yang sama
  const line = await p.evaluate(() => ['a', 'b'].map(s => [...document.querySelectorAll('.court')[0].querySelectorAll('.side-' + s + ' .pcard')]
    .map(e => e.innerText.trim().split('\n').pop().trim())));
  require('fs').writeFileSync('board_call.json', JSON.stringify(line));
  console.log('Court 1:', JSON.stringify(line));
  v.done(); await b.close();
})();
