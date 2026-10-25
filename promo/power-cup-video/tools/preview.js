// node preview.js <outdir> t1 t2 ...  → PNG per waktu (dikecilkan setengah)
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [out, ...ts] = process.argv.slice(2);
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 540, height: 960 } });
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(process.env.VIDEO_URL || 'http://127.0.0.1:8765/video.html');
  await p.evaluate(() => window.READY);
  console.log('DURATION', await p.evaluate(() => window.DURATION), 'events', await p.evaluate(() => window.EVENTS.length));
  for (const t of ts) {
    const d = await p.evaluate((t) => { draw(+t); return document.getElementById('c').toDataURL('image/jpeg', .85); }, t);
    fs.writeFileSync(`${out}/t${String(t).padStart(6, '0')}.jpg`, Buffer.from(d.split(',')[1], 'base64'));
  }
  if (errs.length) console.log('ERRORS', errs.slice(0, 10));
  await b.close();
})();
