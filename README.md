# Paddoc Host v2.2

Aplikasi undian dan rotasi pemain padel untuk Paddoc: akun admin/host/pemain, dashboard publik, sinkron langsung
antar perangkat, notifikasi giliran, dan foto pro AI. Semua berjalan di **Cloudflare** (gratis): satu Worker untuk
aplikasi dan API, satu Durable Object (SQLite) untuk semua data (orang, sesi, foto, login).

- `index.html` – aplikasi
- `engine.js` – mesin undian & klasemen (dipakai aplikasi dan server)
- `core.js` – aturan peran dan semua aksi sesi (dipakai server, dan mode demo di browser)
- `worker/` – server Cloudflare: `index.js` (API, WebSocket, foto), `ai.js` (foto pro AI), `logo.js`
- `config.js` – alamat API (`/api`) dan URL Apps Script lama (hanya untuk pindahan data)
- `wrangler.jsonc` – konfigurasi Worker

## Pasang / perbarui di Cloudflare

Worker `paddoc-host` yang tersambung ke repo GitHub ini akan deploy otomatis setiap ada perubahan di branch produksi.

1. Di [dash.cloudflare.com](https://dash.cloudflare.com) buka **Workers & Pages → paddoc-host → Settings → Variables and Secrets**,
   tambahkan dengan tipe **Secret**:
   - `APP_PIN` – kode pemasangan untuk membuat akun admin pertama (wajib, angka bebas)
   - `OPENAI_API_KEY` – untuk foto pro AI (opsional)
2. Pastikan **Settings → Build** memakai branch yang berisi kode ini (atau merge ke `main`). Deploy command: `npx wrangler deploy`.
   Durable Object dibuat otomatis saat deploy; tidak perlu membuat database.
3. Buka `https://paddoc-host.<akun>.workers.dev`. Layar **Buat akun admin** muncul sekali: isi kode pemasangan = `APP_PIN`.
4. Pasang ke Home Screen dari alamat itu.

## Pindahkan data dari Google Sheet (sekali)

Masuk sebagai admin. Di beranda muncul **Data lama masih di Google Sheet** → **Pindahkan data dari Google Sheet** → isi
PIN host versi lama (v1.0). Semua pemain (beserta foto asli dan foto pro) dan semua sesi disalin; Google Sheet tidak diubah.
Setiap pemain otomatis punya akun: username dari nama (huruf kecil tanpa spasi, mis. `andi`, `sari2`) dan PIN `123456`.
Aman diulang kalau terputus. Setelah selesai, baris `PADDOC_OLD_API` di `config.js` boleh dihapus.

Akun admin yang dibuat di langkah 3 adalah akun terpisah dari data pemain lama dengan nama yang sama.

## Peran

| Peran | Bisa apa | Tampilan |
|---|---|---|
| Tanpa login | Melihat siapa yang main, antrean, klasemen, host | Dashboard HP |
| Pemain | + status giliran, notifikasi panggilan, Skip/Siap main, Keluar dari game, foto tampil, unggah foto sendiri, ganti PIN | Dashboard HP |
| Host | Semua urusan sesi: mulai sesi, skor, panggil, ganti pemain, court, database pemain | Dashboard HP + menu bawah |
| Admin | Semua akses host + atur peran, username, reset PIN | Papan court besar di iPad, bisa pindah ke tampilan HP |

## Cara mengundi

| Cara | Perilaku |
|---|---|
| **Rata & bertemu semua** (bawaan Americano, baru di v2.2) | Court yang selesai langsung diundi dari semua pemain, **termasuk 1–2 pemain yang hampir selesai di court sebelah** (perkiraan sisa ≤ 6 menit). Court itu menampilkan **"Match in progress, please wait"** dan nama pemain yang ditunggu; skor belum bisa diisi dan timer belum jalan. Match otomatis mulai begitu court sebelah mengisi skor, dan HP pemain baru mendapat notifikasi saat itu. Host bisa mengetuk pemain yang ditunggu untuk menggantinya, atau menekan **Ganti yang ditunggu** supaya aplikasi memilih pengganti terbaik dari bangku. Undian mengutamakan jumlah main yang rata, lalu pemain yang belum pernah bertemu (sebagai partner atau lawan). |
| Bergulir | Court yang selesai langsung diisi pemain yang sedang menunggu. Paling cepat, tetapi kelompok di tiap court cenderung itu-itu saja. |
| Per ronde | Court yang selesai menunggu semua court selesai, lalu semua diundi bersamaan. Tombol **Undi sekarang** mengisi court tanpa menunggu. |

Di Mexicano, "Rata & bertemu semua" sama dengan Bergulir.

Simulasi 40 sesi per skenario (150 menit, lama match 9–17 menit, separuh putra/putri, court campur):

| Skenario | Pasangan pemain yang pernah bertemu (Bergulir / Per ronde / **Baru**) | Court menganggur (Bergulir / Per ronde / **Baru**) |
|---|---|---|
| 8 pemain, 2 court | 43% / 100% / **100%** | 4% / 13% / **9%** |
| 10 pemain, 2 court | 83% / 98% / **95%** | 5% / 12% / **7%** |
| 12 pemain, 2 court | 88% / 82% / **95%** | 5% / 12% / **4%** |
| 13 pemain, 3 court | 87% / 93% / **93%** | 5% / 17% / **13%** |
| 16 pemain, 3 court | 81% / 74% / **89%** | 4% / 17% / **5%** |
| 18 pemain, 4 court | 68% / 78% / **81%** | 4% / 20% / **10%** |

Selisih jumlah main antar pemain (rata-rata sepanjang sesi) sama dengan Bergulir, sekitar 1 main; Per ronde sedikit lebih
rata pada beberapa jumlah pemain, dengan harga court lebih sering menganggur. Pemain yang datang telat diprioritaskan
sampai jumlah mainnya menyusul (tetap dengan jeda istirahat). "Semua pemain bertemu" diupayakan, tidak dijamin: dengan
banyak pemain dan sedikit match per orang, jumlah pasangan memang lebih banyak daripada jumlah match.

## Sinkron & notifikasi

Server mengirim perubahan ke semua perangkat lewat WebSocket begitu terjadi; cek berkala tetap jalan setiap 30 detik
sebagai cadangan (3–4 detik bila WebSocket terputus). Notifikasi giliran hanya muncul kalau app sedang terbuka di HP;
minta pemain menekan **Aktifkan suara** dan **Jaga layar menyala** di kartu statusnya.

## Keamanan

- PIN awal semua akun `123456`. Selama belum diganti, siapa pun yang tahu username bisa masuk sebagai orang itu. Profil
  menampilkan peringatan sampai PIN diganti; admin bisa mereset PIN ke `123456`.
- 8 kali salah PIN mengunci username itu 10 menit.
- Dashboard (nama, foto, klasemen) terlihat oleh siapa pun yang memegang link. Foto disajikan di `/photo/<id>.jpg`
  dengan ID acak yang sulit ditebak.

## Foto pro AI

Sama dengan v2.1: variasi baju/warna/raket/pose, logo Padel Doc di dada kiri, aturan hijab (lengan panjang, hijab
dipertahankan), host berseragam wasit. Model dicoba berurutan (`gpt-image-2.5-sunburst`, `gpt-image-2`,
`gpt-image-1.5`, `gpt-image-1`) dan yang berhasil diingat. Opsional (Variables di Cloudflare): `OPENAI_IMAGE_MODEL`
untuk memaksa model, `OPENAI_IMAGE_QUALITY` (`low`/`medium`/`high`, bawaan `medium`), `OPENAI_IMAGE_PROMPT` untuk prompt
sendiri (`{nama}` diganti nama pemain).

## Uji di komputer sendiri

```sh
npx wrangler dev --var APP_PIN:1234
```

Buka <http://localhost:8787>. Data lokal tersimpan di folder `.wrangler/`. Membuka `index.html` langsung dari file
menjalankan **mode demo** dengan data contoh di browser (masuk sebagai `admin`, `rudi`, atau `andi`, PIN `123456`).
