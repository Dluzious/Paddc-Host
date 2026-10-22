const { chromium } = require('../pw.js');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const PH = path.resolve(__dirname, '../photos');
const ppl = JSON.parse(fs.readFileSync(PH + '/people.json'));
const people = {};
for (const p of ppl) {
  const f = n => { const m = fs.readdirSync(PH).find(z => z.startsWith(p.id + '_' + n)); return m ? 'file://' + PH + '/' + m : ''; };
  people[p.name] = { photo: f('photo'), chibi: f('chibi') };
}
const JOBS = { call: 4.2, grid: 3.6 };
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  await pg.addInitScript(p => { window.PEOPLE = p; }, people);
  await pg.goto('file://' + __dirname + '/scenes.html');
  await pg.evaluate(() => window.ready());
  for (const name of (process.argv[2] ? process.argv[2].split(',') : Object.keys(JOBS))) {
    const dir = path.join(__dirname, 'sc_' + name); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
    for (let f = 0; f < Math.round(JOBS[name] * 30); f++) {
      await pg.evaluate(([n, t]) => draw(n, t), [name, f / 30]);
      await pg.screenshot({ path: path.join(dir, String(f).padStart(4, '0') + '.png') });
    }
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', '30', '-i', path.join(dir, '%04d.png'), '-c:v', 'libx264', '-crf', '15', '-preset', 'slow', '-pix_fmt', 'yuv420p', 'scene_' + name + '.mp4']);
    fs.rmSync(dir, { recursive: true, force: true });
    console.log('scene', name);
  }
  await b.close();
})();
