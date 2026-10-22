// Render logo sinematik: penutup L(-3..0) -> cine_end.mp4, pembuka L(0..2.5) -> cine_start.mp4
const { chromium } = require('../pw.js');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  await pg.goto('file://' + __dirname + '/bumper_cine.html');
  await pg.evaluate(() => window.ready());
  for (const [name, a, z] of [['end', -90, 0], ['start', 0, 75]]) {
    const dir = path.join(__dirname, 'cine_' + name); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
    for (let f = a, n = 0; f < z; f++, n++) {
      await pg.evaluate(t => draw(t), f / 30);
      await pg.screenshot({ path: path.join(dir, String(n).padStart(4, '0') + '.png') });
    }
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', '30', '-i', path.join(dir, '%04d.png'), '-c:v', 'libx264', '-crf', '14', '-preset', 'slow', '-pix_fmt', 'yuv420p', 'cine_' + name + '.mp4']);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  await b.close(); console.log('ok');
})();
