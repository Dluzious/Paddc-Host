// mode demo (index.html dibuka langsung, tanpa server): login, Home, Game start, papan skor
const L = require('../lib');
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ GAGAL: ') + m); if (!c) process.exitCode = 1; };
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const mobile of [false, true]) {
    const c = await L.ctx(b, { viewport: mobile ? { width: 390, height: 844 } : { width: 1180, height: 820 }, isMobile: mobile, hasTouch: mobile });
    const pg = await c.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
    await pg.goto('file://' + require('path').join(__dirname, '../../index.html'));
    await pg.waitForSelector('[data-act="login"], #loginf, .v-dash', { timeout: 15000 });
    const onboard = !!(await pg.$('[data-act="skipInstall"]'));
    if (await pg.$('[data-act="login"]')) await pg.click('[data-act="login"]');
    await pg.fill('#li-user', 'rudi'); await pg.fill('#li-pin', '123456'); await pg.click('#loginf button[type=submit]');
    await pg.waitForTimeout(1500);
    const home = !!(await pg.$('.v-home'));                       // v2.9.1: yang login mendarat di Home
    if (home) { await pg.click('.topbar .brand'); await pg.waitForTimeout(800); }
    const goBtn = await pg.$('[data-act="go"]');
    if (goBtn) { await goBtn.click(); await pg.waitForTimeout(800); }
    const sb = await pg.$('button[data-act="scoreboard"]');
    if (sb) { await sb.click(); await pg.waitForSelector('.sb'); await pg.click('[data-act="sbTap"][data-side="A"]'); await pg.waitForTimeout(500); }
    const tag = mobile ? 'HP' : 'desktop';
    ok(!onboard, tag + ': mode demo tanpa halaman pasang aplikasi');
    ok(home, tag + ': yang login mendarat di Home');
    ok(!!goBtn && !!sb, tag + ': Game start & papan skor jalan');
    ok(errs.length === 0, tag + ': tanpa error JS' + (errs.length ? ': ' + errs.join(' | ') : ''));
    await c.close();
  }
  await b.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
