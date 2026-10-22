const { chromium } = require('../pw.js');
const vrec = require('./vrec.js'), { openDemoApp, login } = require('./demoapp.js');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 2.667, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.clock.install();
  const tick = async ms => { for (let i = 0; i < ms; i += 100) await p.clock.runFor(100); await p.waitForTimeout(150); };
  await openDemoApp(p, tick);
  await login(p, tick, 'admin');
  await p.evaluate(() => document.querySelector('[data-act="dash"]').click()); await tick(1500);
  await p.waitForTimeout(3000);                                   // foto dari server live sempat dimuat
  await p.evaluate(() => {
    const st = document.createElement('style');
    st.textContent = '.tapfx{position:fixed;z-index:99999;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;background:rgba(255,255,255,.55);border:3px solid #fff;box-shadow:0 0 0 2px rgba(0,0,0,.15);pointer-events:none;animation:tapfx .55s ease-out forwards}@keyframes tapfx{0%{transform:scale(.4);opacity:1}100%{transform:scale(1.5);opacity:0}}';
    document.head.appendChild(st);
    window.__tapEl = (el, slow) => {
      const r = el.getBoundingClientRect(), d = document.createElement('div'); d.className = 'tapfx';
      d.style.left = (r.left + r.width / 2) + 'px'; d.style.top = (r.top + r.height / 2) + 'px'; document.body.appendChild(d);
      setTimeout(() => d.remove(), 700);
      if (slow) { const ST = window.setTimeout; window.setTimeout = (f, ms, ...a) => ST(f, ms === 160 ? slow : ms, ...a); setTimeout(() => { window.setTimeout = ST; }, 50); }
      el.click();
    };
    const h = [...document.querySelectorAll('h2, h3, .sec-h, .lbl')].find(e => /Sedang main/i.test(e.textContent));
    window.scrollTo(0, (h ? h.getBoundingClientRect().top + scrollY : 560) - 70);
  });
  await tick(300);
  await p.clock.pauseAt(Date.now() + 60000);
  const v = vrec(p, 'raw_shuffle.mp4');
  await v.frames(700);
  await p.evaluate(() => __tapEl(document.querySelectorAll('[data-act="reshuffle"]')[0], 1100)); await v.frames(1900);
  await p.evaluate(() => __tapEl(document.querySelectorAll('[data-act="reshuffle"]')[1], 1100)); await v.frames(1900);
  await p.evaluate(() => __tapEl(document.querySelectorAll('[data-act="call"]')[0])); await v.frames(2600);
  v.done(); await b.close();
})();
