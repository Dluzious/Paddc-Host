# Paddoc Host v2.4

Aplikasi undian dan rotasi pemain padel untuk Paddoc: akun admin/host/pemain, dashboard publik, sinkron langsung
antar perangkat, notifikasi giliran, dan foto pro AI. Semua berjalan di **Cloudflare** (gratis): satu Worker untuk
aplikasi dan API, satu Durable Object (SQLite) untuk semua data (orang, sesi, foto, login).

- `index.html` – aplikasi
- `engine.js` – mesin undian & klasemen (dipakai aplikasi dan server)
- `core.js` – aturan peran dan semua aksi sesi (dipakai server, dan mode demo di browser)
- `worker/` – server Cloudflare: `index.js` (API, WebSocket, foto), `ai.js` (foto pro AI), `push.js` (notifikasi push), `logo.js`
- `sw.js` – service worker: menerima notifikasi panggilan di HP (tombol Siap / Skip dulu)
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
| Host | Semua urusan sesi: mulai sesi, Game start/ended, hitung skor, panggil, ganti pemain, court, database pemain | Dashboard HP + menu bawah |
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

## Host & wasit per court (v2.3)

- Satu sesi boleh punya **beberapa host** (dipilih di Mulai sesi atau **Atur**). Tiap host bisa ditugaskan sebagai
  **wasit satu court**; court miliknya tampil paling atas di HP-nya dengan tanda *Court kamu*. Host tetap bisa
  mengurus court lain; admin bisa semuanya.
- **Warna court**: biru, oranye, hijau, hitam (Mulai sesi atau Atur).
- Alur match: court terisi → **Game start** (bola padel bolak-balik + *Match in progress…*) → **Game ended** →
  popup skor. **Hitung skor** membuka papan skor besar: ketuk tim yang mendapat poin. Mode Poin menghitung 1, 2, 3…;
  mode Tenis menampilkan game besar dan poin 0–15–30–40, deuce bisa **golden point** (bawaan) atau **advantage**.
  Skor langsung terlihat di semua perangkat; saat Game ended popup skor sudah terisi.
- **Ganti pemain** bisa dengan pemain menunggu, atau **pemain/pasangan di court lain yang belum Game start**.
  Court yang sudah mulai tidak muncul di daftar (server juga menolaknya).

## Rencana sesi & ruang tunggu (lobi)

Sesi tidak langsung mulai. Host/admin menekan **Buat rencana sesi**, mengisi tanggal & jam (picker HP), venue
(tombol **Cari alamat** mengisi alamat dan link Google Maps otomatis), dan tema lobi. Setelah dibuat:

- Semua orang mendapat notifikasi **Sesi baru** (tombol *Ikut hadir*), dan kartu **Sesi berikutnya** muncul di beranda.
- Link lobi `/?lobby=<id>` bisa dibagikan: tombol **Bagikan** menyalin link + ajakan (nama sesi, jadwal, venue, Maps).
- Pemain menekan **Saya Bergabung** / **Batal Bergabung**; karakternya jatuh ke lapangan di semua layar (lewat
  WebSocket, umumnya < 1 detik). Admin memilih hadir sebagai host atau ikut main. Host bisa menambah atau menandai
  tidak hadir, mengubah rencana, dan mengganti tema.
- **Chat** di bawah tombol: pesan terbaru di atas, juga tampil sebagai gelembung di atas karakter. Hanya untuk yang
  login; penonton tanpa login melihat lobi tanpa chat dan keterangan *Belum terdaftar? Hubungi host atau admin*.
- **Pengingat** 12 jam dan 3 jam sebelum main dikirim ke yang hadir (nama sesi, jadwal, venue, tombol *Buka Maps*),
  dijadwalkan oleh alarm Durable Object. Pengingat yang waktunya sudah lewat saat rencana dibuat dilewati.
- **Mulai Sesi** (popup konfirmasi, minimal 4 pemain hadir) mengubah rencana jadi sesi berjalan dan semua layar pindah
  ke tampilan court. Salah tekan? **Kembali ke Lobi** (di dashboard dan bilah *Menunggu* papan iPad) selama belum ada
  match yang dimulai; daftar hadir dan chat tetap.
- Pasangan tetap yang belum diatur dipasangkan otomatis saat mulai (putra-putri dulu); opsi lengkap menyusul.
- Pratinjau dengan 30 pemain dummy: **`/?lobby=demo`**. Karakter sementara digambar kode; avatar chibi dari foto AI
  menyusul di Tahap 3.

Pencarian alamat memakai OpenStreetMap (gratis, data venue kecil kadang belum ada). Untuk hasil Google Maps, isi
secret opsional **`GOOGLE_MAPS_API_KEY`** (Places API, berbayar) di Cloudflare. Bila tidak ketemu, tempel link dari
aplikasi Google Maps.

Kode lobi: `lobby.js` + `lobby.css`; gambar latar di `img/lobby/`. Layar lebar memakai gambar ilustrasi per tema;
HP tegak memakai lapangan yang diputar (net melintang) dan digambar kode sampai ada gambar versi tegak.

**Menambah tema**: tambahkan entri di `THEMES` (`lobby.js`) berisi gambar dan koordinat 4 sudut garis lapangan
di gambar (piksel), zona tiap sisi, dan tempat host. Spesifikasi gambar:

| | Layar lebar | HP tegak |
|---|---|---|
| Ukuran | 16:10, minimal 1600 × 1000 | 9:16 atau lebih tinggi, minimal 1080 × 1920 |
| Sudut pandang | dari atas agak miring, net **tegak** di tengah (sisi kiri & kanan) | dari belakang baseline, net **melintang** di tengah (sisi atas & bawah) |
| Isi | lantai tengah kosong, dekorasi di pinggir, logo/tulisan PADDOC di dinding atau papan | sama |
| Jangan ada | orang, teks antarmuka (mis. label "Menunggu pemain lain") | sama |

## Sinkron & notifikasi

Server mengirim perubahan ke semua perangkat lewat WebSocket begitu terjadi; cek berkala tetap jalan setiap 30 detik
sebagai cadangan (3–4 detik bila WebSocket terputus).

**Notifikasi**: sesi baru, pengingat 12 jam & 3 jam sebelum main, dan panggilan court. Tombol **Panggil** di court mengirim notifikasi push ke HP keempat pemain berisi court, partner, dan
lawan, dengan tombol **Siap** / **Skip dulu**. Kunci VAPID dibuat otomatis oleh server, tidak perlu disetel.

- HP dan tablet **wajib memasang aplikasi ke layar utama** dulu (petunjuk iPhone/iPad dan Android; bila link terbuka di
  dalam WhatsApp/Instagram ada petunjuk membuka di Chrome/Safari). Link lobi yang dibuka di HP baru menampilkan
  ringkasan sesinya di layar pasang. Setelah terpasang: izinkan notifikasi (boleh nanti), lalu login. Laptop tidak wajib.
- iPhone/iPad: notifikasi hanya bisa bila app dipasang lewat *Bagikan → Tambah ke Layar Utama* (iOS 16.4+) dan izin
  diberikan dari dalam app.
- Notifikasi push berbunyi satu kali (suara bawaan HP; Android juga bergetar panjang). Alarm berulang hanya berjalan
  selama app terbuka, sampai pemain menekan Siap atau Skip.
- Pemain yang belum mengizinkan bisa menekan **Aktifkan notifikasi HP** di kartu statusnya.

## Keamanan

- PIN awal semua akun `123456`. Selama belum diganti, siapa pun yang tahu username bisa masuk sebagai orang itu. Profil
  menampilkan peringatan sampai PIN diganti; admin bisa mereset PIN ke `123456`.
- 8 kali salah PIN mengunci username itu 10 menit.
- Dashboard (nama, foto, klasemen) terlihat oleh siapa pun yang memegang link. Foto disajikan di `/photo/<id>.jpg`
  dengan ID acak yang sulit ditebak.

## Foto pro AI

Sama dengan v2.1: variasi baju/warna/raket/pose, logo Padel Doc di dada kiri, aturan hijab (lengan panjang, hijab
dipertahankan), host berseragam wasit. Admin difoto dengan **jas ala CEO** (pin Padel Doc di kerah, latar lounge padel). Model dicoba berurutan (`gpt-image-2.5-sunburst`, `gpt-image-2`,
`gpt-image-1.5`, `gpt-image-1`) dan yang berhasil diingat. Opsional (Variables di Cloudflare): `OPENAI_IMAGE_MODEL`
untuk memaksa model, `OPENAI_IMAGE_QUALITY` (`low`/`medium`/`high`, bawaan `medium`), `OPENAI_IMAGE_PROMPT` untuk prompt
sendiri (`{nama}` diganti nama pemain).

## Uji di komputer sendiri

```sh
npx wrangler dev --var APP_PIN:1234
```

Buka <http://localhost:8787>. Data lokal tersimpan di folder `.wrangler/`. Membuka `index.html` langsung dari file
menjalankan **mode demo** dengan data contoh di browser (masuk sebagai `admin`, `rudi`, atau `andi`, PIN `123456`).
