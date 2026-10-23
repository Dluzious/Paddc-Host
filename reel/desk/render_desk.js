// Render adegan meja & morph (cine_scenes.html) frame per frame -> desk_wide.mp4, desk_front.mp4, morph.mp4
const { chromium } = require('../pw.js');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const D = __dirname, S = path.resolve(D, '..');
// foto meja asli ada di luar repo (privasi): DESK_DIR berisi desk_wide.jpg & desk_front.jpg
const DESK = process.env.DESK_DIR || D;
const ASSETS = {
  wide: 'file://' + DESK + '/desk_wide.jpg', front: 'file://' + DESK + '/desk_front.jpg',
  photo: 'file://' + S + '/photos/p_c0b6d5cd67_photo.jpg',
  chibiStill: 'file://' + S + '/hf/hf_20261022_234743_89c77f6d-485a-472a-a3d3-e38592e8548f.png',
  code: fs.readFileSync(path.resolve(S, '../lobby.js'), 'utf8').split('\n').slice(379, 470).map(l => l.slice(0, 110)).join('\n'),
};
const JOBS = { desk_wide: 5.0, desk_front: 6.9, morph: 4.5 };
const only = process.argv[2] ? process.argv[2].split(',') : Object.keys(JOBS);
const shot = process.argv[3] ? process.argv[3].split(',').map(Number) : null;    // pratinjau: detik tertentu saja
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  await pg.addInitScript(a => { window.ASSETS = a; }, ASSETS);
  await pg.goto('file://' + D + '/cine_scenes.html');
  await pg.evaluate(() => window.ready());
  const lobbyAt = t => {                                     // lobi mulai di t=0,45 dtk, frame lobi 30 fps
    const i = Math.max(0, Math.min(198, Math.round((t - 0.45) * 30)));
    return 'file://' + D + '/lobby_frames/' + String(i + 1).padStart(4, '0') + '.jpg';
  };
  for (const name of only) {
    const dir = path.join(D, 'f_' + name); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
    const times = shot || [...Array(Math.round(JOBS[name] * 30)).keys()].map(f => f / 30);
    for (const [n, t] of times.entries()) {
      const frame = name === 'desk_front' ? lobbyAt(t) : null;
      if (frame) await pg.evaluate(f => window.load(f), frame);
      await pg.evaluate(([nm, tt, fr]) => draw(nm, tt, fr), [name, t, frame]);
      await pg.screenshot({ path: path.join(dir, String(n).padStart(4, '0') + '.png') });
    }
    if (!shot) {
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', '30', '-i', path.join(dir, '%04d.png'), '-c:v', 'libx264', '-crf', '15', '-preset', 'slow', '-pix_fmt', 'yuv420p', name + '.mp4']);
      fs.rmSync(dir, { recursive: true, force: true });
    }
    console.log(name, 'ok');
  }
  await b.close();
})();
