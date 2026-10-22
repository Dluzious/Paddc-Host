# Reel Instagram Paddoc Host

Alat untuk membuat ulang reel promosi 60 detik (1080×1920, 30 fps). Logo di awal dan akhir menyambung, jadi
saat Reels berulang gerakannya mulus. Video sengaja hening, musik dipasang di Instagram saat upload.

Folder ini tidak ikut deploy (`reel` ada di `.assetsignore`). Video, foto, dan data pemain tidak disimpan di
repo (`reel/.gitignore`); semuanya dibuat ulang dari langkah di bawah.

## Kebutuhan

- Node.js + Playwright (Chromium). Di container cloud Claude Code sudah terpasang; di komputer sendiri:
  `npm i playwright && npx playwright install chromium`
- ffmpeg, Python 3 + Pillow, curl

## Langkah

```sh
cd reel
python3 fetch_data.py                 # nama, foto pro AI, avatar chibi dari dashboard publik (tanpa login)

cd bumper
node render.js                        # logo pembuka/penutup (bumper_start.mp4, bumper_end.mp4)
node render_scenes.js                 # panggilan di 4 HP + grid foto pro AI -> chibi
node render_captions.js caps.json     # caption & kartu slot (cap/*.png)

cd ../cap                             # adegan aplikasi asli: lobi & dashboard pakai mode demo lokal
node r_lobby_port.js                  # (data di browser, tidak menulis ke server), podium dari app live
node r_lobby_ball.js
node r_lobby_beach.js
node r_shuffle.js
node r_kudos.js
node r_podium.js                      # simpan hasilnya sebagai podium_live.mp4

cd ..
REEL_FOOTAGE=/path/ke/footage python3 assemble.py paddoc_reel_final.mp4
```

`REEL_FOOTAGE` berisi video asli dari klub (nama file dicocokkan lewat potongan nama, mis. `e6a55773`,
`IMG_7037`; lihat `TIMELINE` di `assemble.py`). Urutan, durasi, dan caption tiap segmen diatur di `TIMELINE`;
total harus tepat 1800 frame (dicek otomatis).

## Cara kerja singkat

- `cap/vrec.js` merekam halaman frame per frame dengan jam virtual (JS + animasi CSS maju 1/30 detik per
  frame), jadi hasilnya mulus 30 fps dan tajam di 1080×1920 walau screenshot lambat.
- `cap/harness.js` memasang lobi (`lobby.js`) dengan pemain asli; `cap/demoapp.js` membuka aplikasi dalam
  mode demo (`file://`) lalu mengganti nama/foto pemain dummy dengan data asli.
- `bumper/bumper.html` menggambar animasi logo sebagai fungsi waktu L(t): penutup = L(−2..0), pembuka =
  L(0..1,2), sehingga frame terakhir video menyambung ke frame pertama.
