// Uji: HP Huawei (Browser Huawei) — pintasan layar utama tetap terbuka sebagai tab → bisa lanjut ke login
const L = require('../lib');
const { chromium } = require('playwright');
const B = 'http://127.0.0.1:8789', OUT = L.out('13b-huawei');
const api = async (fn, req) => { const r = await fetch(B + '/api', { method: 'POST', body: JSON.stringify({ fn, req }) }); const j = await r.json(); if (!j.ok) throw new Error(fn + ': ' + j.error); return j.data; };
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ GAGAL: ') + m); if (!c) process.exitCode = 1; };
const UA = {
  huawei: 'Mozilla/5.0 (Linux; Android 10; ELS-NX9; HMSCore 6.11.0.302) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.88 HuaweiBrowser/14.0.0.320 Mobile Safari/537.36',
  chrome: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
};
(async () => {
  await api('createAdmin', { code: '2468', name: 'Lulu Admin', gender: 'P', username: 'lulu', pin: '9876' });
  const adm = await api('login', { username: 'lulu', pin: '9876' });
  const p = await api('savePerson', { token: adm.token, person: { name: 'Hana Huawei', gender: 'P' } });
  const b = await chromium.launch(), errs = [];
  const open = async (ua, url) => {
    const ctx = await L.ctx(b, { viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: ua });
    const pg = await ctx.newPage(); pg.on('pageerror', (e) => errs.push(e.message));
    await pg.goto(B + (url || '/')); return { ctx, pg };
  };
  console.log('• HP Huawei, dibuka di Browser Huawei');
  let { ctx, pg } = await open(UA.huawei);
  await pg.waitForSelector('.onboard', { timeout: 15000 });
  const t = await pg.textContent('.onboard');
  ok(/HP Huawei \/ Honor/.test(t) && /Tambahkan ke layar utama/.test(t), 'halaman pasang menampilkan langkah khusus Huawei');
  ok(!!(await pg.$('[data-act="useBrowser"]')), 'ada tombol "Lanjut pakai di browser ini"');
  await pg.screenshot({ path: OUT + '/01-huawei-pasang.png' });
  await pg.click('[data-act="useBrowser"]');
  await pg.waitForSelector('#loginf, [data-act="skipNotif"], .v-dash, .v-home', { timeout: 15000 });
  if (await pg.$('[data-act="skipNotif"]')) { await pg.click('[data-act="skipNotif"]'); await pg.waitForSelector('#loginf, .v-dash', { timeout: 15000 }); }
  ok(!(await pg.$('[data-act="useBrowser"]')), 'halaman pasang terlewati: ' + (await pg.evaluate(() => (document.querySelector('main') || {}).className || 'login')));
  if (!(await pg.$('#loginf'))) { await pg.click('[data-act="login"] >> nth=0'); await pg.waitForSelector('#loginf', { timeout: 10000 }); }
  await pg.screenshot({ path: OUT + '/01b-huawei-masuk.png' });
  ok(!!(await pg.$('#loginf')) || /Masuk/.test(await pg.textContent('body')), 'setelah ditekan: sampai ke halaman masuk / login');
  if (await pg.$('#loginf')) {
    await pg.fill('#li-user', p.username); await pg.fill('#li-pin', '123456').catch(async () => { await pg.fill('input[type=password]', '123456'); });
    await pg.click('#loginf button[type=submit]').catch(async () => { await pg.press('#li-user', 'Enter'); });
    await pg.waitForSelector('.v-home, .v-dash', { timeout: 15000 }).catch(() => {});
  }
  ok(!!(await pg.$('.v-home, .v-dash')) && /Hana/.test(await pg.textContent('body')), 'login berhasil di Browser Huawei');
  await pg.screenshot({ path: OUT + '/02-huawei-login.png' });
  await pg.reload(); await pg.waitForTimeout(2500);
  ok(!(await pg.$('.onboard')) && !!(await pg.$('.v-home, .v-dash')), 'dibuka lagi (pintasan layar utama): langsung masuk, tidak kembali ke halaman pasang');
  await ctx.close();

  console.log('• pintasan memakai start_url manifest (?src=home)');
  ({ ctx, pg } = await open(UA.huawei, '/?src=home'));
  await pg.waitForTimeout(2500);
  ok(!(await pg.$('.onboard')) && !/Pasang dulu di layar utama/.test(await pg.innerText('#app')), 'dibuka dari ikon layar utama (?src=home): langsung ke aplikasi tanpa halaman pasang');
  ok(!/src=home/.test(pg.url()), 'penanda ?src=home dihapus dari alamat (' + pg.url().replace(B, '') + ')');
  await ctx.close();

  console.log('• Android Chrome biasa: aturan lama tetap (wajib pasang)');
  ({ ctx, pg } = await open(UA.chrome));
  await pg.waitForSelector('.onboard', { timeout: 15000 });
  ok(/Android<\/b> \(Chrome\)|Android \(Chrome\)/.test(await pg.innerHTML('.onboard')) && !(await pg.$('[data-act="useBrowser"]')), 'Chrome: langkah pasang biasa, tanpa tombol lewati');
  await ctx.close();
  const man = await (await fetch(B + '/manifest.webmanifest')).json();
  ok(man.start_url === './?src=home' && man.id === './', 'manifest: start_url ./?src=home, id tetap ./ (aplikasi yang sudah terpasang tidak terduplikasi)');
  ok(errs.length === 0, 'tanpa error JS' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
