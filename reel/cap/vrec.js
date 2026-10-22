// Perekam frame-per-frame dengan jam virtual: tiap frame jam halaman (JS + animasi CSS) maju 1/30 detik lalu di-screenshot
// pada resolusi penuh (1080x1920). Hasilnya mulus 30fps berapa pun lambatnya screenshot.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const FPS = 30, DT = 1000 / FPS;
module.exports = function vrec(page, outMp4) {
  const dir = outMp4 + '.frames'; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
  let n = 0;
  const tickCss = () => page.evaluate(dt => {
    document.getAnimations().forEach(a => {
      if (!a.__v) { a.__v = 1; a.pause(); a.__t = a.currentTime || 0; } else { a.__t += dt; }
      try { a.currentTime = a.__t; } catch (e) {}
    });
  }, DT);
  return {
    async frames(ms) {
      for (let k = 0, m = Math.round(ms / DT); k < m; k++) {
        await page.clock.runFor(DT); await tickCss();
        await page.screenshot({ path: path.join(dir, String(n++).padStart(5, '0') + '.png') });
      }
    },
    done() {
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', path.join(dir, '%05d.png'), '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-pix_fmt', 'yuv420p', outMp4]);
      fs.rmSync(dir, { recursive: true, force: true }); console.log(outMp4, n, 'frames', (n / FPS).toFixed(1) + 's');
    }
  };
};
