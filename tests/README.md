# Uji Paddoc Host

Semua uji aplikasi disimpan di folder ini, supaya setiap perubahan bisa dicek ulang sebelum di-merge.

| Jenis | Folder | Isi | Butuh |
|---|---|---|---|
| Logika | `unit/` | Aturan undian, rencana & lobi, pembayaran, jam hadir, podium, mode main, Power Cup, dan lainnya. Langsung memanggil `core.js` / `engine.js` / `play.js`. | Node.js 18+ |
| Mode demo | `demo/` | `index.html` dibuka langsung tanpa server: login, Home, Game start, papan skor, editor tema, kudos. | Playwright + Chromium |
| Browser | `e2e/` | Alur lengkap di server lokal (`wrangler dev`), memakai HP, iPad, dan laptop tiruan. Satu file untuk tiap rilis fitur. | Playwright + Chromium + wrangler |

## Menjalankan

```sh
cd tests
npm install                       # sekali: playwright & wrangler
npx playwright install chromium   # sekali: browser untuk uji
sh run.sh                         # semua uji (±25–30 menit)
sh run.sh unit                    # logika saja (±10 detik)
sh run.sh e2e power               # hanya uji browser yang namanya memuat "power"
```

Setiap file punya satu baris hasil. Di akhir ada total, misalnya `Total: 607 lulus, 0 gagal`. Kalau ada yang gagal, runner keluar dengan kode 1.

- **Hasil uji:** screenshot, video podium, dan log per file disimpan di `/tmp/paddoc-tests`. Lokasinya bisa diganti dengan `PADDOC_TEST_OUT`.
- **Kenapa di luar repo:** `wrangler dev` memuat ulang server setiap ada file baru di folder aplikasi.

## Cara kerja

- **Server uji (`server.sh`):** sebelum tiap file browser, runner menyalakan `wrangler dev` di port 8789 dengan data kosong. Ikut dinyalakan dua server tiruan:
  - OpenAI tiruan (`mock/openai.mjs`, port 9911) untuk foto pro & avatar chibi, tanpa biaya dan tanpa internet;
  - pencarian alamat tiruan (`mock/nominatim.mjs`, port 9912).
- **Kode pemasangan admin** di server uji adalah `2468`.
- **Akun uji** dibuat dengan PIN bawaan `123456`. Pengingat ganti PIN di Home disembunyikan di browser uji (`lib.js`, fungsi `ctx`) supaya tampilannya sama dengan akun biasa. Pengingat itu sendiri diuji di `e2e/15-pengingat-pin.js`.
- **File contoh** (foto wajah, foto pro, sprite chibi, gambar tema) ada di `fixtures/`.

## Daftar uji browser

| File | Fitur |
|---|---|
| `02-rencana-lobi` | Buat rencana, cari alamat, lobi, hadir, gerbang pasang aplikasi, papan iPad |
| `03-avatar-chibi` | Foto pro AI & avatar chibi (jumlah panggilan API, sprite, lobi 30 pemain) |
| `04-tema-pasangan-kudos` | Editor tema, kalibrasi, pasangan tetap, foto wasit, kudos |
| `06-pembayaran-cohost` | Collector, rekening, bukti bayar, host sesi, riwayat, koreksi skor, sesi lalu |
| `07-jam-hadir` | Hadir full / 1 jam / 2 jam |
| `08-podium` | Lightbox foto, podium, simpan foto & video, ucapan terima kasih, WhatsApp admin |
| `09-main-bola` | Mode main analog & bola yang sinkron |
| `10-home` | Home sebagai halaman pembuka & menu |
| `11-power-cup` | Power Cup: ronde, kartu power, animasi, podium, notifikasi |
| `13-foto-ajakan` | Bagikan lobi: salin teks & foto ajakan 16:9 + QR |
| `13b-huawei` | Browser Huawei: lanjut di browser, `?src=home` |
| `14-data-tersimpan` | Lapangan tersimpan, template pembayaran, ubah nama |
| `15-pengingat-pin` | Pengingat ganti PIN di Home (tidak wajib), Nanti saja 7 hari, ganti di Profil |

## Menambah uji

1. Salin pola salah satu file `e2e/`, misalnya `14-data-tersimpan.js`.
2. Tulis hasil dengan `ok(kondisi, 'keterangan')`. Runner menghitung baris `✓` dan `✗`.
3. Buka browser lewat `L.ctx(browser, opsi)` dan simpan gambar ke `L.out('<nama-file>')`.
