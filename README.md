# Paddoc Host

Aplikasi undian dan rotasi pemain padel untuk Paddoc. Aplikasi dan datanya berjalan di **Cloudflare**:
Worker untuk API, database **D1** untuk pemain, sesi, dan foto.

- `index.html` – aplikasinya
- `config.js` – alamat API (`/api`) dan URL Apps Script lama (hanya untuk pindahan data)
- `worker/index.js` – backend (API, PIN host, foto, foto pro AI)
- `wrangler.jsonc` – konfigurasi Worker Cloudflare
- `manifest.webmanifest` dan file `icon-*.png` – ikon saat dipasang di Home Screen

## Pasang di Cloudflare (sekali saja)

1. Masuk ke [dash.cloudflare.com](https://dash.cloudflare.com) (akun gratis cukup).
2. **Workers & Pages → Create → Import a repository** → hubungkan GitHub → pilih repo `Paddc-Host`.
   - Project name: `paddoc-host`
   - Build command: kosongkan. Deploy command: `npx wrangler deploy` (bawaan).
   - Tekan **Deploy**. Database D1 bernama `paddoc-host` dibuat otomatis saat deploy pertama.
     Kalau log build bilang tidak punya izin membuat database: buka **Storage & Databases → D1 → Create**,
     beri nama persis `paddoc-host`, lalu jalankan ulang deploy.
3. Buka Worker `paddoc-host` → **Settings → Variables and Secrets → Add**, pilih tipe **Secret**:
   - `APP_PIN` – PIN host untuk membuka aplikasi (wajib)
   - `OPENAI_API_KEY` – kunci API OpenAI untuk foto pro AI (opsional)

   Pakai tipe *Secret*, bukan *Text*: variabel teks biasa bisa tertimpa setiap kali deploy ulang.
4. Buka alamat Worker, misalnya `https://paddoc-host.NAMA-AKUN.workers.dev`, lalu masukkan PIN.
5. Pasang ulang ke Home Screen dari alamat baru itu (ikon lama masih mengarah ke alamat lama).

Setiap perubahan yang di-push ke branch produksi di GitHub akan otomatis ter-deploy.

## Pindahkan data dari Google Sheet (sekali saja)

Di beranda akan muncul kotak **Data lama masih di Google Sheet**. Tekan **Pindahkan data dari Google Sheet**,
isi PIN host versi Google Sheet, lalu tunggu sampai selesai. Yang disalin: semua pemain (termasuk yang diarsipkan),
foto asli, foto pro, dan semua sesi beserta riwayat match. Google Sheet tidak diubah atau dihapus.

Kalau terputus di tengah jalan, tekan Mulai lagi; data yang sudah pindah ditimpa, bukan dobel.
Foto yang gagal diambil disebutkan di akhir. Setelah selesai, kotak itu hilang dan baris `PADDOC_OLD_API`
di `config.js` boleh dihapus.

## Melihat data

- **Di aplikasi:** menu **Riwayat → Unduh CSV** untuk klasemen dan daftar match satu sesi
  (bisa dibuka di Google Sheets / Excel / Numbers), dan **Unduh cadangan data** di beranda untuk semua data (JSON).
- **Di Cloudflare:** **Storage & Databases → D1 → paddoc-host** untuk melihat tabel `players` dan `sessions`.

## Catatan

- PIN salah 5 kali dari satu alamat IP → IP itu dikunci 10 menit; 30 kali dari semua IP → semua dikunci 10 menit.
- Foto disajikan di `/photo/<id>.jpg` dengan ID acak yang sulit ditebak, sama seperti tautan Google Drive "siapa pun yang punya link".
- Model AI diatur di `wrangler.jsonc` (`OPENAI_IMAGE_MODEL`, dicoba berurutan) dan `OPENAI_IMAGE_QUALITY`.
- Batas gratis Cloudflare (D1 5 GB, 100.000 tulis/hari, Worker 100.000 permintaan/hari) jauh di atas kebutuhan satu klub.
- Kalau aplikasi tetap dibuka dari GitHub Pages, isi `window.PADDOC_API` di `config.js` dengan URL lengkap Worker
  (`https://paddoc-host.NAMA-AKUN.workers.dev/api`).

## Uji di komputer sendiri

```sh
npx wrangler dev --var APP_PIN:1234
```

Lalu buka <http://localhost:8787>. Data lokal tersimpan di folder `.wrangler/` dan tidak ikut ke Cloudflare.
