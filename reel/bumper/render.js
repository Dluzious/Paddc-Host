const { chromium } = require('../pw.js');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const PH = path.resolve(__dirname, '../photos');
const ppl = JSON.parse(fs.readFileSync(PH + '/people.json'));
const files = {};
for (const p of ppl) { const f = fs.readdirSync(PH).find(n => n.startsWith(p.id + '_chibi')); if (f) files[p.name] = 'file://' + PH + '/' + f; }
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  await pg.addInitScript(f => { window.CREW_FILES = f; }, files);
  await pg.goto('file://' + __dirname + '/bumper.html');
  await pg.evaluate(() => Promise.all([document.fonts.load('900 128px "Big Shoulders Display"'), document.fonts.load('800 54px "Plus Jakarta Sans"')]).then(() => window.ready()));
  for (const [name, a, z] of [['end', -60, 0], ['start', 0, 36]]) {
    const dir = path.join(__dirname, name); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
    for (let f = a, n = 0; f < z; f++, n++) {
      await pg.evaluate(t => draw(t), f / 30);
      await pg.screenshot({ path: path.join(dir, String(n).padStart(4, '0') + '.png') });
    }
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', '30', '-i', path.join(dir, '%04d.png'), '-c:v', 'libx264', '-crf', '15', '-preset', 'slow', '-pix_fmt', 'yuv420p', 'bumper_' + name + '.mp4']);
  }
  await b.close();
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', 'bumper_end.mp4', '-i', 'bumper_start.mp4', '-filter_complex', '[0:v][1:v]concat=n=2:v=1[o]', '-map', '[o]', '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', 'bumper_seam_preview.mp4']);
  console.log('ok');
})();
