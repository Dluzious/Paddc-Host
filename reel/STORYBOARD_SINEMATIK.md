# Storyboard sinematik: "Dokter yang ngoding" (tanpa teks, tanpa voice-over)

Cerita disampaikan lewat gambar saja: siang praktik → malam padel → tengah malam membuat app → app hidup →
dipakai bersama → lampu court padam. Musik dipilih di Instagram saat upload. Logo di awal & akhir menyambung
(loop): video berakhir di paruh penutup `bumper/bumper_cine.html` dan mulai di paruh pembukanya.

Format: 60,0 dtk, 1080×1920, 30 fps, tanpa audio. Transisi dissolve 0,6–1,0 dtk, gerak kamera pelan, grade hangat
+ grain tipis untuk footage/AI (UI aplikasi jangan terlalu di-grade supaya tetap jernih).

| # | Detik | Shot | Sumber |
|---|---|---|---|
| 1 | 0–2,5 | Logo diam di ruang gelap lalu meredup | `cine_start.mp4` (render_cine.js) |
| 2 | 2,5–10 | Ruang dokter sore: stetoskop digantung di jas, tangan mengambil raket padel | HF `2ab79471-58b4-4f3f-8583-39cd7b8ba116` (10 dtk, pakai ±7,5) |
| 3 | 10–14,5 | Court indoor malam, lampu menyala bertahap | HF `cb3b16b9-c134-4e3e-8051-059c6bcfd8d8` (5 dtk) |
| 4 | 14,5–21 | Footage asli: rally lebar → pemain merentang menjangkau bola (slow-mo) | e6a55773 ±101,3 dtk, bb13c206 ±24 / ±100,5 dtk |
| 5 | 21–26 | Meja kerja asli (foto lebar), kamera mendekat pelan; layar monitor utama diganti editor kode gelap; monitor kiri atas diblur | foto meja lebar (dilampirkan ulang) |
| 6 | 26–32 | Foto meja dari depan: di layar muncul lobi tema Pantai terisi avatar; kamera masuk ke layar → lobi tegak layar penuh, avatar berjatuhan | foto meja depan + `raw_lobby_beach.mp4` + `raw_lobby_port.mp4` |
| 7 | 32–36 | Foto pro AI Lulu perlahan berubah jadi chibi (sapuan cahaya) | render baru (adegan morph di `scenes.html`) |
| 8 | 36–41 | Chibi Lulu hidup di court: melambai, melompat | HF `d3edb8d6-2b47-4a0c-a164-4f86953e639a` atau `303b5450-293b-4629-b8f7-5fd2e4fe9840` (user memilih) |
| 9 | 41–46,5 | iPad asli di venue → papan court tema gelap digeser pelan, nama bergulir lalu kartu dibagikan | IMG_7037 + `raw_board.mp4` (tidak diputar) |
| 10 | 46,5–52 | Close-up juara di podium, confetti | `raw_podium_close.mp4` |
| 11 | 52–57 | Court kosong: bola menggelinding ke raket di bangku, lampu padam satu-satu → gelap | HF `305030ef-bf00-4b85-b9a4-4d263bfed6a7` (6 dtk) |
| 12 | 57–60 | Dari gelap, logo muncul dengan sapuan cahaya (menyambung ke detik 0) | `cine_end.mp4` |

## Privasi foto meja
Sidebar aplikasi Claude di monitor utama memuat judul sesi pribadi. Seluruh area layar monitor utama **diganti**
render (bukan sekadar diburamkan), dan monitor kiri atas (tab browser) **diblur**, sebelum dipakai atau dikirim
ke layanan mana pun. Jangan simpan foto meja asli ke repo.

Koordinat layar monitor utama (foto asli 1450×2576):
- foto depan: TL (0,962) · TR (1424,950) · BR (1424,1782) · BL (0,1790) (sisi kiri terpotong)
- foto lebar: TL ≈ (510,1086) · TR ≈ (1366,1076) · BR ≈ (1346,1586) · BL ≈ (512,1546); monitor kiri atas
  x 0–440, y 960–1330 → blur. Cek ulang dengan grid sebelum dipakai.

## Klip Higgsfield (Kling 3.0 pro, 9:16, tanpa suara)
Unduh dari `https://d8j0ntlcm91z4.cloudfront.net/user_3KztqGSamSszbIXRSZ47oEhwAuM/` + nama file:
- `hf_20261022_234802_2ab79471-58b4-4f3f-8583-39cd7b8ba116.mp4` (shot 2)
- `hf_20261022_234802_cb3b16b9-c134-4e3e-8051-059c6bcfd8d8.mp4` (shot 3)
- `hf_20261022_234844_d3edb8d6-2b47-4a0c-a164-4f86953e639a.mp4` / `hf_20261022_234844_303b5450-293b-4629-b8f7-5fd2e4fe9840.mp4` (shot 8)
- `hf_20261022_234747_305030ef-bf00-4b85-b9a4-4d263bfed6a7.mp4` (shot 11)

Kredit terpakai sampai sini: 54,75 (plafon yang disetujui 600). Still chibi dibuat GPT Image 2.5 kualitas rendah
(752×1344); bila klip chibi kurang tajam, buat ulang still di kualitas lebih tinggi lalu Kling i2v lagi.

## Domain yang perlu diizinkan di environment "Cloudflare"
`d8j0ntlcm91z4.cloudfront.net` (hasil Higgsfield), `d2ol7oe51mr4n9.cloudfront.net` dan `upload.higgsfield.ai`
(upload ke Higgsfield, untuk animasi foto meja bila diperlukan), `drive.google.com` dan
`drive.usercontent.google.com` (footage asli di Drive, termasuk IMG_7038/7039).

## Urutan kerja di sesi baru
1. `cd reel && python3 fetch_data.py`
2. Unduh footage dari folder Drive `1BtzN79ayykckclNC3Maux_GKgc38kBTp` ke `reel/footage/` dan klip HF di atas
   ke `reel/hf/`; minta user melampirkan ulang 2 foto meja (simpan di luar repo).
3. Render: `bumper/render_cine.js`, `cap/r_lobby_beach.js`, `cap/r_lobby_port.js`, `cap/r_board.js`,
   `cap/r_podium_close.js`, adegan morph foto→chibi (tambahkan ke `bumper/scenes.html`).
4. Komposit foto meja (perspektif ke koordinat di atas) dan rakit dengan skrip baru `assemble_cine.py`
   (dissolve `xfade`, push-in pelan, grade + grain); verifikasi 1800 frame, sambungan loop, tanpa teks.

## Status: sudah dirakit (23 Okt 2026)
`assemble_cine.py` merakit versi final (1800 frame, 17 segmen, dissolve 0,5–0,8 dtk). Penutup memakai klip indoor
`d4a27492-f412-484a-8c43-9f6a1bc1d594` (bukan `305030ef` yang ternyata outdoor), lampu padam dibuat lewat `eq`.
Shot 9–11 memakai footage asli IMG_7038 (laptop di venue) dan IMG_7039 (monitor, podium, tawa teman-teman).

Urutan build:
1. `python3 fetch_data.py`; footage ke `reel/footage/` (atau `REEL_FOOTAGE=`), IMG_7038/7039 boleh di `reel/drive/`,
   klip HF ke `reel/hf/`.
2. `cd bumper && node render_cine.js`
3. `cd ../cap && node r_lobby_beach.js` lalu ekstrak frame: `ffmpeg -i raw_lobby_beach.mp4 -q:v 3 ../desk/lobby_frames/%04d.jpg`
4. `cd ../desk && DESK_DIR=/folder/foto-meja node render_desk.js` (foto meja tidak disimpan di repo)
5. `cd .. && python3 assemble_cine.py paddoc_reel_cine.mp4`, lalu encode ulang untuk Instagram:
   `ffmpeg -i paddoc_reel_cine.mp4 -c:v libx264 -crf 19 -maxrate 6M -bufsize 12M -c:a aac -movflags +faststart out.mp4`
