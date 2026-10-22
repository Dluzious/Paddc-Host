// Adegan Kudos dari mode demo (data lokal di browser, nama & foto asli): admin mengakhiri sesi,
// lalu pemain (akun demo "andi" = Dani) memberi kudos. Tidak menulis ke server.
const { chromium } = require('../pw.js');
const vrec = require('./vrec.js'), { openDemoApp, login } = require('./demoapp.js');
const EXPLORE = process.argv[2] === 'explore';
const TAPFX = () => {
  const st = document.createElement('style');
  st.textContent = '.tapfx{position:fixed;z-index:99999;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;background:rgba(255,255,255,.55);border:3px solid #fff;box-shadow:0 0 0 2px rgba(0,0,0,.15);pointer-events:none;animation:tapfx .55s ease-out forwards}@keyframes tapfx{0%{transform:scale(.4);opacity:1}100%{transform:scale(1.5);opacity:0}}';
  document.head.appendChild(st);
  window.__tapEl = el => {
    const r = el.getBoundingClientRect(), d = document.createElement('div'); d.className = 'tapfx';
    d.style.left = (r.left + r.width / 2) + 'px'; d.style.top = (r.top + r.height / 2) + 'px'; document.body.appendChild(d);
    setTimeout(() => d.remove(), 700); el.click();
  };
  window.__chip = (name, label) => {
    const sec = [...document.querySelectorAll('.kd-p')].find(s => s.querySelector('.kd-nm b').textContent.trim() === name);
    const chip = sec && [...sec.querySelectorAll('.kd-chip')].find(c => c.textContent.trim() === label);
    if (chip) __tapEl(chip); return !!chip;
  };
  window.__row = name => {
    const sec = [...document.querySelectorAll('.kd-p')].find(s => s.querySelector('.kd-nm b').textContent.trim() === name);
    if (sec) __tapEl(sec.querySelector('.kd-ph')); return !!sec;
  };
  window.__rowY = name => {
    const sec = [...document.querySelectorAll('.kd-p')].find(s => s.querySelector('.kd-nm b').textContent.trim() === name);
    return sec ? sec.getBoundingClientRect().top + scrollY : 0;
  };
};
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 405, height: 720 }, deviceScaleFactor: EXPLORE ? 1.5 : 2.667, isMobile: true, hasTouch: true });
  const a = await ctx.newPage();
  await a.clock.install();
  const tickOf = pg => async ms => { for (let i = 0; i < ms; i += 100) await pg.clock.runFor(100); await pg.waitForTimeout(150); };
  const ta = tickOf(a);
  await openDemoApp(a, ta);
  await login(a, ta, 'admin');
  await a.evaluate(() => document.querySelector('[data-act="menu"]').click()); await ta(600);
  await a.evaluate(() => document.querySelector('[data-mi="end"]').click()); await ta(600);
  await a.evaluate(() => document.querySelector('[data-cb="1"]').click()); await ta(2500);
  const sid = await a.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('paddoc_demo_v2')).sessions)[0]);
  await a.close();
  const p = await ctx.newPage();
  await p.clock.install();
  const tp = tickOf(p);
  await p.goto('file://' + require('path').resolve(__dirname, '../../index.html')); await tp(2500);
  await login(p, tp, 'andi');
  await p.goto('file://' + require('path').resolve(__dirname, '../../index.html') + '?kudos=' + sid); await tp(3000);
  await p.waitForTimeout(2500);                                   // foto dari server live sempat dimuat
  await p.evaluate(TAPFX);
  if (EXPLORE) {
    await p.screenshot({ path: 'kx1.png' });
    console.log(await p.evaluate(() => [...document.querySelectorAll('.kd-nm b')].map(e => e.textContent).join(', ')));
    console.log(await p.evaluate(() => [...document.querySelectorAll('.kd-chip')].map(e => e.textContent).join(', ')));
    await b.close(); return;
  }
  await p.clock.pauseAt(Date.now() + 60000);
  const v = vrec(p, 'raw_kudos.mp4');
  const scrollTo = async (y, ms) => {                             // gulir halus dalam jam virtual
    const y0 = await p.evaluate(() => scrollY), n = Math.round(ms / (1000 / 30));
    for (let k = 1; k <= n; k++) { const u = k / n, e = u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; await p.evaluate(yy => scrollTo(0, yy), y0 + (y - y0) * e); await v.frames(1000 / 30); }
  };
  await v.frames(600);
  await p.evaluate(() => __chip('Aziz', 'Vibe Master')); await v.frames(600);
  await p.evaluate(() => __row('Max')); await v.frames(250);
  await scrollTo(await p.evaluate(() => __rowY('Max') - 150), 450);
  await p.evaluate(() => __chip('Max', 'Smash Machine')); await v.frames(500);
  await p.evaluate(() => __chip('Max', 'Dream Partner')); await v.frames(600);
  await p.evaluate(() => __row('Sisil')); await v.frames(250);
  await scrollTo(await p.evaluate(() => __rowY('Sisil') - 150), 450);
  await p.evaluate(() => __chip('Sisil', 'Wall Master')); await v.frames(1500);
  v.done(); await b.close();
})();
