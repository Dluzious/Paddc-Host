# Rekap Paddoc Host v2.16

Aplikasi undian dan rotasi pemain padel untuk komunitas Paddoc. Alamat live: <https://paddoc-host.lulunurulula.workers.dev>

Isi dokumen: [1. Sistem](#1-sistem) · [2. Tampilan](#2-tampilan) · [3. Fitur](#3-fitur) · [4. Pengujian](#4-pengujian) · [5. Risiko & keputusan terbuka](#5-risiko--keputusan-terbuka) · [6. Riwayat versi](#6-riwayat-versi)

---

## 1. Sistem

| Bagian | Isi |
|---|---|
| Hosting | Cloudflare Workers (paket gratis). Merge ke `main` langsung ter-deploy otomatis dalam ±1 menit. |
| Data | Satu Durable Object berbasis SQLite menyimpan semua data: orang, sesi, foto, login, tema, template. Mode main lobi memakai Durable Object kecil per lobi yang hanya meneruskan pesan. |
| Kode | `index.html` (aplikasi, ±525 KB), `engine.js` (mesin undian & klasemen), `core.js` (aturan peran & semua aksi), `worker/` (API, WebSocket, foto, push, AI), `lobby.js` + `lobby.css` (ruang tunggu), `play.js` (mode main), `ceremony.js` (podium), `invite.js` + `qrcode.js` (foto ajakan), `sw.js` (notifikasi). |
| Logika bersama | `engine.js` dan `core.js` dipakai server **dan** mode demo di browser, jadi aturannya selalu sama. |
| Sinkron | Perubahan dikirim ke semua perangkat lewat WebSocket, digabung paling sering sekali per 300 ms. Match yang sudah lama selesai cukup dikirim id-nya (v2.16). Cadangan: cek berkala tiap 30 detik, atau 3–4 detik saat WebSocket putus. |
| Notifikasi | Web Push lewat service worker, dengan tombol **Siap** / **Skip dulu**. Kunci VAPID dibuat otomatis. |
| Bentuk aplikasi | Web app yang dipasang ke layar utama. File aplikasi disimpan di HP (v2.16), jadi tetap terbuka saat jaringan lambat atau putus. HP wajib memasangnya; browser tanpa dukungan pemasangan (Huawei dsb.) bisa lanjut di browser. Laptop tidak wajib. |
| AI | OpenAI untuk foto pro dan avatar chibi. Opsional, butuh secret `OPENAI_API_KEY`. |
| Biaya | Cloudflare Rp 0. Biaya hanya dari OpenAI bila foto AI dipakai. |
| Rahasia (Cloudflare) | `APP_PIN` (kode pemasangan admin pertama), `OPENAI_API_KEY`. |

### Peran

| Peran | Hak akses |
|---|---|
| Tanpa login | Melihat dashboard: court, antrean, klasemen |
| Pemain | + status giliran, notifikasi panggilan, Siap/Skip, lobi & hadir, bayar & bukti, kudos, profil (foto, nama, PIN) |
| Host sesi | Pemain yang ditunjuk untuk satu sesi: skor & mengatur pemain di sesi itu |
| Host | Semua urusan sesi, database pemain, rencana sesi, pembayaran, template |
| Admin | + atur peran & username, reset PIN, tema lobi, papan court iPad |

### Keamanan

- **Pengingat ganti PIN (v2.15).** Akun baru dan akun yang PIN-nya direset admin memakai PIN `123456`. Penggantian PIN **tidak diwajibkan**. Sebagai gantinya:
  - Home menampilkan pengingat dengan tombol **Ganti PIN sekarang** (membuka Profil) dan **Nanti saja** (disembunyikan 7 hari);
  - pesan sambutan saat login ikut menyebutnya.
  - PIN baru harus 4–8 angka, bukan 123456, dan berbeda dari PIN lama.
- **Batas salah PIN.** 8 kali salah mengunci username itu selama 10 menit.
- **Data rekening.** Template rekening hanya bisa dibaca admin/host. Bukti bayar hanya untuk pihak terkait.
- **Dashboard publik.** Nama, foto, dan klasemen terlihat oleh siapa pun yang memegang link. Foto memakai ID acak.

---

## 2. Tampilan

| Layar | Isi |
|---|---|
| **Home** (semua yang login) | Sapaan, sesi berikutnya, sesi yang sedang berjalan, riwayat sesi. Admin/host juga mendapat tombol *Buat rencana sesi* & *Database pemain*. |
| **HP pemain** | Kartu status giliran, panggilan court, kartu pembayaran, menu. Host mendapat menu bawah: Court, Pemain, Atur, Riwayat. |
| **Papan court iPad** (admin) | 1–6 court berwarna (oranye, biru, hijau, hitam), foto wasit, timer, skor langsung, animasi bola saat Game start/ended, "Match in progress, please wait". |
| **Lobi** | Karakter chibi semua yang hadir di atas latar bertema, chat, status datang, waiting list, mini game analog & bola yang sinkron di semua layar. |
| **Tema lobi** | Tema bawaan dan tema event buatan admin, dengan gambar landscape (iPad) dan portrait (HP) yang dikalibrasi. |
| **Animasi** | Pergantian ronde, court menyala saat dipilih, kartu power (dibuka → terbang ke court → cap *DIBLOK!*/*DIBALIK!*), podium akhir sesi (simpan foto/video). |
| **Foto ajakan** | Gambar 16:9 berisi karakter pemain yang sudah bergabung dengan gelembung ajakan, panel *Gabung sekarang*, dan QR code. |
| **Onboarding HP** | Pasang aplikasi → izinkan notifikasi → login. Ada langkah khusus Huawei/Honor. Pengingat ganti PIN muncul di Home selama PIN masih 123456. |
| Umum | Mode terang/gelap, menghormati pengaturan "kurangi gerakan", layout HP 360 px sampai iPad landscape. |

---

## 3. Fitur

### Sesi & undian
- **Format:** Americano, Mexicano, Power Cup.
- **Cara mengundi:**
  - *Rata & bertemu semua*: court boleh menunggu 1–2 pemain yang hampir selesai, supaya jumlah main rata dan semua pemain saling bertemu;
  - *Bergulir*;
  - *Per ronde*.
- **Aturan:** wajib istirahat setelah 2–3 match beruntun; pemain telat diprioritaskan sampai jumlah mainnya menyusul.
- **Skor:** poin (total atau race) atau tenis, dengan golden point atau advantage.
- **Pasangan & court:** pasangan acak atau tetap; court campur, putra, atau putri; wasit per court.
- **Mengatur match:** panggil pemain (push), Skip/Siap, ganti pemain antar court, batalkan match, keluarkan pemain.
- **Klasemen:** menang lalu selisih, total poin, atau rata-rata. Riwayat match bisa difilter ke "Match saya".

### Rencana sesi & lobi
- **Rencana:**
  - tanggal, jam mulai & selesai booking;
  - venue dengan **Cari alamat** otomatis dan link Google Maps;
  - tema lobi dan biaya per orang.
- **Kehadiran:**
  - hadir full, 1 jam, atau 2 jam;
  - status sudah datang (yang belum datang tidak ikut diundi);
  - waiting list dan cadangan.
- **Pengingat:** notifikasi 12 jam dan 3 jam sebelum main.
- **Bagikan lobi:** kalimat ajakan langsung disalin; foto ajakan dibuat bila sudah ada yang bergabung.
- **Lapangan tersimpan (v2.14):** pilih venue yang pernah dipakai, lalu nama, alamat, Maps, dan susunan court langsung terisi.

### Power Cup
- **Tim & pemain:** pasangan tetap level atas + bawah; pemain maksimal court × 4; sistem ronde dengan rotasi lawan.
- **Court & alur:** court bernilai ±1/±2/±3; yang kalah menantang, yang menang menunggu undian.
- **Kartu power (dek digital 28 kartu):**
  - ambil kartu manual dengan animasi kocok, dan dek tidak pernah habis;
  - jenis kartu: Block, Reverse, Pilih Lawan, Switch Hand, Ambil Semua Poin, Zonk;
  - kartu bisa dibatalkan sebelum Game start.
- **Tampilan & notifikasi:**
  - gambar kartu di court;
  - notifikasi kartu dari lawan dan pengingat mengambil kartu;
  - podium Power Cup.

### Pembayaran
- **Atur pembayaran:** biaya per orang, payment collector, rekening dengan tombol salin.
- **Bukti bayar:** pemain mengunggah bukti dan langsung mendapat tanda hijau. Collector bisa menandai lunas atau membatalkan dengan catatan.
- **Template pembayaran (v2.14):** collector, rekening, dan biaya tersimpan otomatis. Pilih di form rencana, atau tekan **Pakai** di panel Pembayaran.

### Orang & profil
- Database pemain: tambah, edit, arsip, peran, username, reset PIN.
- Foto pro AI (variasi baju dan pose, aturan hijab, host berseragam wasit, admin berjas CEO) dan avatar chibi.
- Profil: pilih foto tampil, unggah foto, **ubah nama tampil** (v2.14), ganti PIN.
- Tombol **Chat admin di WhatsApp** untuk yang belum punya akun, dengan pesan yang sudah terisi.
- Pindahan data sekali dari Google Sheet versi lama.

### Setelah sesi
- Podium akhir sesi dan ucapan terima kasih.
- Kudos antar pemain dan untuk host.
- Koreksi skor: pemain mengajukan, host atau admin mereview.
- Riwayat sesi sebelumnya dengan ringkasan dan klasemen.

---

## 4. Pengujian

Mulai v2.15 semua uji tersimpan di repo, di folder [`tests/`](../tests/README.md):

| Jenis | Jumlah file | Cara jalan |
|---|---|---|
| Logika (`tests/unit`) | 7 | `sh tests/run.sh unit` (±10 detik) |
| Mode demo (`tests/demo`) | 2 | `sh tests/run.sh demo` |
| Browser (`tests/e2e`) | 14 | `sh tests/run.sh e2e` (±25 menit) |

Server uji memakai `wrangler dev` dengan OpenAI dan pencarian alamat tiruan, jadi tidak ada biaya dan tidak butuh internet selain untuk memasang alat. Petunjuk lengkap ada di `tests/README.md`.

---

## 5. Risiko & keputusan terbuka

| Hal | Status | Saran |
|---|---|---|
| Uji tidak tersimpan di repo | **Selesai di v2.15** | Jalankan `sh tests/run.sh` sebelum merge perubahan besar. |
| PIN bawaan 123456 bisa dipakai siapa pun yang tahu username | **Diputuskan: tidak diwajibkan.** v2.15 hanya mengingatkan di Home dan saat login. | Risiko tetap ada selama pemain tidak mengganti PIN. Bila ada kejadian akun dipakai orang lain, aktifkan lagi kewajiban ganti PIN. |
| Uji belum jalan otomatis di GitHub | Terbuka | Tambah GitHub Actions yang menjalankan `sh tests/run.sh unit` di setiap PR (cepat, tanpa browser). |
| Semua data di satu Durable Object, tanpa backup di luar Cloudflare | Terbuka | Tambah tombol **Ekspor data (JSON)** untuk admin. |
| Gambar ulang papan iPad ±70 ms per pembaruan (lebih lama di iPad) | Terbuka | v2.16 mengurangi jumlahnya. Bila masih berat: perbarui hanya court yang berubah. |
| Check "Workers Builds" di branch PR selalu merah | Terbuka | Build pratinjau branch; deploy `main` tetap sukses. Cek log di dashboard Cloudflare atau matikan build pratinjau. |
| Alamat memuat "lulunurulula" | Menunggu keputusan | Ganti subdomain akun Cloudflare atau pakai domain sendiri. |
| Browser Huawei | Belum diuji di HP asli | Notifikasi kemungkinan tidak masuk; pemain Huawei perlu membuka aplikasi saat menunggu giliran. |
| Siapa pun bisa mengganti nama tampilnya | Sesuai permintaan | Batasi ke admin bila nama mulai disalahgunakan. |

---

## 6. Riwayat versi

| Versi | Isi utama |
|---|---|
| v2.1–v2.5 | Akun admin/host/pemain, Cloudflare, undian "Rata & bertemu semua", host & wasit per court, warna court, Game start/ended, notifikasi panggilan, rencana sesi & lobi, avatar chibi, tema lobi, pasangan tetap, foto wasit, kudos |
| v2.6 | Host sesi dari pemain, pembayaran, riwayat match, koreksi skor, riwayat sesi |
| v2.7 | Jam hadir full / 1 jam / 2 jam |
| v2.8 | Lightbox foto, klasemen menang dulu, podium, ucapan terima kasih, WhatsApp admin |
| v2.9 / v2.9.1 | Main bola di lobi; Home sebagai halaman pembuka |
| v2.10–v2.11 | Power Cup: ronde, kartu power digital, batas pemain, waiting list, status datang |
| v2.12 | Gambar & animasi kartu, koreksi tahap 2, tahap 3 (animasi ronde, court menyala, podium, notifikasi kartu) |
| v2.13 / v2.13.1 | Foto ajakan lobi + QR; perbaikan HP Huawei/Honor |
| v2.14 | Lapangan tersimpan, template pembayaran, ubah nama di Profil |
| v2.15 | Pengingat ganti PIN (tidak wajib); seluruh uji disimpan di `tests/` |
| v2.16 | Lebih ringan saat sesi ramai (siaran hemat & digabung, notifikasi tidak menahan tombol); aplikasi disimpan di HP sehingga tetap terbuka saat jaringan lemah |
