# Video promosi Power Cup

Motion graphic vertikal 1080×1920, 30 fps, ±2:56, bahasa Indonesia: ajakan main, cara main Power Cup (lobi, pasangan,
nilai court, match 5 game, ronde & penantang), ambil kartu, katalog 13 kartu (28 di dek), contoh match dengan kartu
(Steal All Points dibalas Reverse), aturan kartu, klasemen & podium, fitur lain, ajakan bergabung.

Semua digambar kode di `<canvas>` (`anim.js`, fungsi `draw(t)` deterministik), lalu dirender per frame lewat Playwright
dan ffmpeg. Musik & efek suara disintesis (`tools/audio.py`) dan disinkronkan dengan `window.EVENTS`.
Avatar dan nama pemain diambil dari data publik aplikasi; klasemen di video adalah **contoh ilustrasi**.

Folder `promo/` tidak ikut deploy (`.assetsignore`). `assets/`, `fonts/`, `out/` tidak di-commit.

```sh
cd promo/power-cup-video
pip install pillow numpy scipy
python3 tools/fetch_assets.py                    # avatar & foto pemain, kartu, logo, font
python3 -m http.server 8765 --bind 127.0.0.1 &   # canvas butuh http (bukan file://)
for i in 0 1 2 3; do node tools/render.js out $i 4 & done; wait   # 4 segmen paralel
python3 tools/audio.py out/events.json out/audio.wav
printf "file 'seg0.mp4'\nfile 'seg1.mp4'\nfile 'seg2.mp4'\nfile 'seg3.mp4'\n" > out/list.txt
ffmpeg -f concat -safe 0 -i out/list.txt -i out/audio.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k \
  -movflags +faststart -shortest out/PowerCup_PaddocHost.mp4
```

Pratinjau frame: `node tools/preview.js prev 12 40.5 110` (detik). Mengubah jumlah pemain di teks: `PLAYER_COUNT`
di `anim.js`; tim contoh di `TEAM`.
