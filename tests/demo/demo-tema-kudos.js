// mode demo (tanpa server): editor tema, kudos, foto wasit
const L = require('../lib');
const { chromium } = require('playwright');
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ GAGAL: ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const c = await L.ctx(b, { viewport: { width: 1180, height: 820 } }); const pg = await c.newPage(); const errs = [];
  pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto('file://' + require('path').join(__dirname, '../../index.html'));
  await pg.waitForSelector('[data-act="login"], #loginf, .v-dash', { timeout: 15000 });
  if (await pg.$('[data-act="login"]')) await pg.click('[data-act="login"] >> nth=0');
  await pg.fill('#li-user', 'admin'); await pg.fill('#li-pin', '123456'); await pg.click('#loginf button[type=submit]'); await pg.waitForTimeout(1500);
  await pg.click('[data-act="menu"] >> nth=0'); await pg.click('[data-mi="themesView"]'); await pg.waitForSelector('.th-card');
  await pg.click('[data-act="editTheme"][data-id="beach"]'); await pg.click('[data-tab="port"]');
  await pg.setInputFiles('#th-file', L.fixture('port.jpg')); await pg.waitForSelector('.cal svg'); await pg.click('#th-save'); await pg.waitForTimeout(800);
  ok(/HP tegak/.test(await pg.textContent('.th-card[data-id="beach"]')) && !(await pg.$('.th-card[data-id="beach"] .th-thumb.port.none')), 'demo: tema bawaan diberi gambar HP tegak');
  await pg.click('[data-act="menu"] >> nth=0'); const end = await pg.$('[data-mi="end"]');
  if (end) { await end.click(); await pg.waitForSelector('.modal button.primary, .modal button.danger'); await pg.click('.modal .modal-f button:last-child'); await pg.waitForTimeout(1000); }
  else await pg.keyboard.press('Escape');
  for (let i = 0; i < 3 && await pg.$('.cer'); i++) await pg.click('.cer [data-c="close"]').catch(() => {});
  for (let i = 0; i < 4 && await pg.$('#modals .modal-wrap'); i++) { await pg.click('#modals .modal-wrap:last-child [data-act="close"]').catch(() => {}); await pg.waitForTimeout(200); }
  ok(!(await pg.$('.kudos-cta')), 'demo: admin yang tidak ikut sesi tidak diajak memberi kudos');
  await pg.click('[data-act="menu"] >> nth=0'); await pg.click('[data-mi="logout"]'); await pg.waitForTimeout(600);
  if (await pg.$('[data-act="login"]')) await pg.click('[data-act="login"] >> nth=0');
  await pg.fill('#li-user', 'rudi'); await pg.fill('#li-pin', '123456'); await pg.click('#loginf button[type=submit]'); await pg.waitForTimeout(1500);
  await pg.click('[data-act="dash"] >> nth=0').catch(() => {}); await pg.waitForTimeout(800);
  const cta = await pg.$('.kudos-cta');
  ok(!!cta || !end, 'demo: ajakan kudos setelah sesi diakhiri' + (end ? '' : ' (tidak ada sesi berjalan di demo)'));
  if (cta) { await pg.click('[data-act="kudosOpen"]'); await pg.waitForSelector('.kd-chip'); await pg.click('.kd-p.open .kd-chip >> nth=0'); await pg.click('[data-act="kudosSend"]'); await pg.waitForTimeout(800);
    ok(/terkirim/.test(await pg.textContent('#toasts')), 'demo: kudos tersimpan di perangkat'); }
  await pg.click('[data-act="menu"] >> nth=0'); await pg.click('[data-mi="pastView"]'); await pg.waitForSelector('.past-card, .past .empty', { timeout: 8000 });
  ok(!!(await pg.$('.past-card')), 'demo: Riwayat sesi menampilkan sesi yang sudah selesai');
  if (await pg.$('.past-card')) { await pg.click('.past-card'); await pg.waitForSelector('.past-stand'); ok((await pg.$$('.past-stand .li')).length > 0, 'demo: detail riwayat sesi + klasemen'); }
  ok(!errs.length, 'demo: tanpa error JS ' + errs.join(' | '));
  await b.close();
})();
