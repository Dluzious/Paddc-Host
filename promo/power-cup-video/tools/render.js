// node render.js <outdir> <worker> <nworkers>  → segmen MP4 tanpa audio
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
(async () => {
  const [out, wi, wn] = [process.argv[2], +process.argv[3], +process.argv[4]];
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 540, height: 960 } });
  await p.goto(process.env.VIDEO_URL || 'http://127.0.0.1:8765/video.html');
  await p.evaluate(() => window.READY);
  const dur = await p.evaluate(() => window.DURATION);
  if (wi === 0) fs.writeFileSync(out + '/events.json', JSON.stringify(await p.evaluate(() => ({ duration: window.DURATION, events: window.EVENTS, scenes: window.SCENES_T }))));
  const total = Math.round(dur * 30);
  const per = Math.ceil(total / wn), f0 = wi * per, f1 = Math.min(total, f0 + per);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30', `${out}/seg${wi}.mp4`], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let f = f0; f < f1; f++) {
    const d = await p.evaluate((t) => { draw(t); return document.getElementById('c').toDataURL('image/jpeg', .95); }, f / 30);
    const buf = Buffer.from(d.slice(d.indexOf(',') + 1), 'base64');
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if ((f - f0) % 300 === 0) console.log(`w${wi} ${f - f0}/${f1 - f0} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log(`w${wi} selesai ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  await b.close();
})();
