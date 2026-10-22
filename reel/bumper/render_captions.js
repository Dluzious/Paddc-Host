const { chromium } = require('../pw.js');
const fs = require('fs');
const spec = JSON.parse(fs.readFileSync(process.argv[2]));
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  await pg.goto('file://' + __dirname + '/captions.html');
  await pg.evaluate(() => window.ready());
  fs.mkdirSync('cap', { recursive: true });
  for (const [i, s] of spec.entries()) {
    if (s.kind === 'cap') await pg.evaluate(a => caption(...a), [s.text, s.style, s.y]);
    else await pg.evaluate(a => slot(...a), [s.title, s.desc, s.secs]);
    await pg.screenshot({ path: 'cap/' + s.id + '.png', omitBackground: s.kind === 'cap' });
  }
  await b.close(); console.log(spec.length, 'images');
})();
