# Paddoc Host v2.12

Aplikasi undian dan rotasi pemain padel untuk Paddoc: akun admin/host/pemain, dashboard publik, sinkron langsung
antar perangkat, notifikasi giliran, dan foto pro AI. Semua berjalan di **Cloudflare** (gratis): satu Worker untuk
aplikasi dan API, satu Durable Object (SQLite) untuk semua data (orang, sesi, foto, login), dan Durable Object kecil
per lobi untuk mode main (analog & bola).

- `index.html` – aplikasi
- `engine.js` – mesin undian & klasemen (dipakai aplikasi dan server)
- `core.js` – aturan peran dan semua aksi sesi (dipakai server, dan mode demo di browser)
- `worker/` – server Cloudflare: `index.js` (API, WebSocket, foto, mode main lobi), `ai.js` (foto pro AI), `push.js` (notifikasi push), `logo.js`
- `lobby.js` + `lobby.css` – ruang tunggu (lobi); `play.js` – hitungan mode main yang sama di semua layar (gerak, bola);
  `ceremony.js` – podium akhir sesi (canvas, simpan foto/video)
- `sw.js` – service worker: menerima notifikasi panggilan di HP (tombol Siap / Skip dulu)
- `config.js` – alamat API (`/api`), nomor WhatsApp admin, dan URL Apps Script lama (hanya untuk pindahan data)
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
- **Mulai Sesi** (popup konfirmasi, atau pilihan pasangan untuk sesi pasangan tetap; minimal 4 pemain hadir) mengubah rencana jadi sesi berjalan dan semua layar pindah
  ke tampilan court. Salah tekan? **Kembali ke Lobi** (di dashboard dan bilah *Menunggu* papan iPad) selama belum ada
  match yang dimulai; daftar hadir dan chat tetap.
- **Pasangan tetap**: saat menekan Mulai Sesi, host memilih cara memasangkan dari yang benar-benar hadir:
  **acak campuran** (putra + putri dulu), **acak putra**, **acak putri**, **best player** (pilih unggulan, partnernya
  diacak dari pemain lain), atau **manual** (isi semua tim). Hasil acak bisa diubah per baris; memilih pemain yang
  sudah di tim lain menukar tempatnya. *Pasangkan sisanya otomatis* (bawaan aktif) memasangkan yang belum punya tim;
  bila dimatikan mereka belum ikut main. Pilihan yang sama ada di bagian **Pasangan** saat membuat rencana.
- Pratinjau dengan 30 pemain dummy: **`/?lobby=demo`**.
- Tidak ada teks yang saling menutupi di panggung: label nama atau gelembung yang bertabrakan disembunyikan sementara
  (prioritas: chat, gelembung, nama sendiri, host, pemain terdepan), dan karakter menjaga jarak saat berjalan.

### Avatar chibi (Tahap 3)

- Dibuat **sekali** lewat OpenAI dari foto pro AI (atau foto asli): seluruh badan, kepala besar, latar transparan, logo
  Padel Doc di baju, pegang raket. Pemain berhijab: lengan & kaki tertutup; lainnya boleh lengan pendek, tidak tanpa
  lengan. Host berbaju wasit. Bila model tidak bisa latar transparan, dibuat berlatar polos lalu dibersihkan otomatis.
- Otomatis dibuat setelah foto pro AI selesai. Di **Database pemain**, tombol **Avatar lobi (N)** membuat avatar untuk
  semua yang belum punya; di editor tiap orang ada **Buat ulang avatar** (hanya admin/host).
- HP admin/host mengecilkan avatar sekali (320 × 480, ±10–60 KB) dan menyimpannya; lobi hanya memuat versi kecil, jadi
  30 karakter tetap ringan dan **membuka lobi tidak pernah memanggil OpenAI**.
- Pemain melihat avatarnya di **Profil** (tanpa tombol ubah). Sebelum avatar dibuat, lobi memakai karakter bawaan
  (siluet berinisial bila belum ada foto).

Pencarian alamat memakai OpenStreetMap (gratis, data venue kecil kadang belum ada). Untuk hasil Google Maps, isi
secret opsional **`GOOGLE_MAPS_API_KEY`** (Places API, berbayar) di Cloudflare. Bila tidak ketemu, tempel link dari
aplikasi Google Maps.

Kode lobi: `lobby.js` + `lobby.css`; gambar latar di `img/lobby/`. Layar lebar memakai gambar ilustrasi per tema;
HP tegak memakai lapangan yang diputar (net melintang) dan digambar kode sampai ada gambar versi tegak.

### Tema ruang tunggu (Tahap 4)

Admin: **Menu → Tema ruang tunggu**. Tiap tema punya gambar **layar lebar** (iPad/TV) dan boleh punya gambar
**HP tegak**; tanpa gambar tegak, HP memakai lapangan yang digambar aplikasi.

- **Tema baru** (mis. Agustusan, Ramadan, final turnamen): isi nama, unggah gambar, lalu ketuk **4 sudut lantai**
  berurutan: 1 kiri belakang, 2 kanan belakang, 3 kanan depan, 4 kiri depan (titik bisa digeser). Pratinjau
  menampilkan lantai, sisi A/B, garis net, dan tempat host; titik **H** opsional untuk memindahkan tempat host.
  Urutan sudut yang tertukar ditolak.
- **Tema bawaan** bisa diberi gambar HP tegak, diganti gambarnya, atau disembunyikan; **Kembalikan bawaan** menghapus
  gambar unggahan. *Logo Paddoc di pojok* untuk gambar yang belum berlogo.
- Gambar diperkecil di HP admin (maks. 1800 px, JPEG) lalu disimpan di Durable Object seperti foto. Daftar tema ikut
  data sinkron, jadi lobi yang terbuka langsung berganti tanpa muat ulang.

Tema bawaan ada di `THEMES` (`lobby.js`). Spesifikasi gambar:

| | Layar lebar | HP tegak |
|---|---|---|
| Ukuran | 16:10, minimal 1600 × 1000 | 9:16 atau lebih tinggi, minimal 1080 × 1920 |
| Sudut pandang | dari atas agak miring, net **tegak** di tengah (sisi kiri & kanan) | dari belakang baseline, net **melintang** di tengah (sisi atas & bawah) |
| Isi | lantai tengah kosong, dekorasi di pinggir, logo/tulisan PADDOC di dinding atau papan | sama |
| Jangan ada | orang, teks antarmuka (mis. label "Menunggu pemain lain") | sama |

## Foto wasit di papan iPad

Court yang punya wasit (host court) menampilkan foto dan nama depan host itu di **tengah atas court** pada papan iPad.
Bila court sempit (mis. 4 court berjajar), foto pindah ke baris sendiri di atas nomor court supaya tidak menutupi teks.

## Kudos setelah sesi (Tahap 5)

- Saat host/admin menekan **Akhiri sesi**, semua yang hadir (pemain dan host) mendapat notifikasi **Beri kudos**;
  HP pemain yang sedang membuka app juga langsung ditawari, dan dashboard menampilkan ajakan dengan tombol **Lewati**.
- Tiap orang memberi **1–2 kudos** untuk tiap pemain dan host yang hadir (boleh semua, boleh dilewati, bisa diubah
  selama 7 hari). Kudos pemain: Wall Master, Lob Specialist, Vibora Specialist, Bandeja Master, Smash Machine,
  Volley Expert, Block Master, Spin Doctor, Chiquita Artist, Bajada Specialist, Drop Shot Artist, Tactical Genius,
  Game Reader, Positioning Pro, Defensive Wall, Rally Machine, Predator, Dream Partner, Hype Partner, Smart Supporter,
  Silent Killer. Kudos host: Super Host, Organized Host, Vibe Master, Problem Solver, Game Day Hero, Reliable Host.
- Kudos tersimpan per orang dan terakumulasi antar sesi. **Profil → Kudos untukmu** menampilkan jumlah per kudos dan
  siapa pemberinya; orang lain tidak bisa melihatnya. Admin melihat semua di **Database → Kudos**.

## Power Cup (v2.11: per ronde + kartu power · v2.12: gambar & animasi kartu)

Format turnamen khusus: pilih **Power Cup** di *Buat rencana sesi*. Aturannya tetap, tidak ikut pengaturan skor,
rotasi, atau klasemen biasa.

### Pemain, pasangan, court
- **Pemain maksimal court × 4** (2 court = 8, 4 court = 16, 6 court = 24), jadi semua tim main tiap ronde. Yang
  bergabung setelah penuh masuk **waiting list** (urut waktu bergabung): di lobi avatarnya berbaris di luar court
  (label `#1 Nama`). Ada yang batal → waiting list teratas naik ke daftar main dan mendapat notifikasi.
- **Pasangan tetap level atas + bawah.** Tandai level atas saat membuat rencana atau saat *Mulai Sesi*; tiap pemain
  level atas dipasangkan acak dengan satu pemain level bawah. Level tidak seimbang → sebanyak mungkin atas + bawah,
  sisanya acak. Mode *Manual* tetap ada. Hadir selalu full (tanpa jam hadir 1/2 jam).
- **Nilai court** ±1 sampai ±6 (bawaan = nomor court; Court 1 hijau, 2 oranye, 3 navy), bisa diubah di rencana atau
  *Atur* (berlaku untuk match berikutnya).
- **Match = 5 game, selalu dimainkan penuh** (skor game total 5). Skor 15-30-40; 40-40 = poin penentu.

### Ronde
- Semua tim main bersamaan; **ronde berikutnya diundi setelah semua court selesai** (court yang selesai lebih dulu
  menunggu court lain).
- **Lawan berputar sampai semua tim bertemu**: jadwal round-robin dari urutan tim yang diacak (n tim → n−1 ronde, tiap
  pasangan tim bertemu tepat sekali), ronde jadwal dipakai dalam urutan acak; bila sama, tim kalah bertemu tim menang.
  Tim berubah / ada yang belum siap → undian dengan pertemuan ulang paling sedikit. Tim ganjil / lebih banyak dari court
  → yang istirahat bergiliran.
- **Penantang** = tim yang kalah di match terakhirnya (ronde pertama acak). **Urutan memilih court dikocok**; penantang
  memilih court lewat HP (siapa berani court bernilai besar), host bisa memilihkan di iPad atau **Acak court**. Court
  terakhir yang tersisa otomatis.
- **Klasemen**: total poin court (menang +nilai, kalah −nilai, boleh minus; efek kartu ikut), lalu selisih game.
- Batal match → tantangan yang sama kembali memilih court, kartu yang dipakai kembali ke tangan. Pemain *Belum siap* /
  keluar → tantangannya batal, lawannya istirahat ronde itu.

### Kartu power (dek digital 28 kartu)
| Kartu | Jumlah | Waktu pakai | Efek di aplikasi |
|---|---|---|---|
| Free 15 / Free 30 | 3 / 1 | sebelum match | tiap game pemegang mulai 15-0 / 30-0 (otomatis di papan skor wasit) |
| Golden Point | 2 | sebelum match | 40-40 langsung game untuk pemegang (otomatis); kedua tim memakai → keduanya batal |
| Double Point | 2 | sebelum match | menang: poin court ×2 (klasemen) |
| Tukar Ranking | 1 | sebelum match | menang & total masih di bawah lawan: total poin ditukar setelah match (klasemen) |
| Pilih Lawan | 2 | sebelum match dimulai (masih menunggu court atau sudah di court) | pilih tim lain yang sudah punya lawan dan belum mulai: pemegang melawan tim itu, lawan lama kedua tim saling bertemu (tim & pemain di court ikut pindah) |
| No Smash / No Glass | 2 / 2 | sebelum servis sebuah game, 2 game | dicatat & tampil di court (game n–n+1); pelanggaran = wasit memberi poin |
| Switch Hand | 2 | sebelum match, game 1–2 | **kedua pemain lawan** memakai tangan non-dominan di game 1 dan 2 |
| Ambil Semua Poin | 1 | sebelum match | menang: poin **klasemen** lawan (bila > 0) pindah ke pemegang, lawan jadi 0 lalu −nilai court; kalah: hangus (klasemen) |
| Block / Reverse | 3 / 1 | menjawab kartu lawan, sebelum poin berikutnya | Block membatalkan kartu apa pun; Reverse membalik No Smash, No Glass, Switch Hand, Ambil Semua Poin |
| Zonk | 6 | — | langsung dibuang |

- Tim **kalah** berhak mengambil 1 kartu (maks 2 di tangan; Zonk langsung dibuang dan tidak mengisi slot). Kartunya
  **diambil manual**: tombol *Ambil kartu power* di HP tim itu (kartu diacak lalu berhenti di satu kartu, hanya tim itu
  yang melihat), atau host mengambilkan di papan iPad lewat antrean **Ambil kartu · urut selesai main** (kartu tampil
  terbuka di layar). Tim kalah dikabari lewat notifikasi; partner dikabari kartu yang didapat. Saat diambil tangan sudah
  penuh → tidak mendapat kartu.
- **Kartu tidak pernah habis**: tumpukan habis → tumpukan buang dikocok ulang; bila semua kartu sedang dipegang / dipakai
  → dek baru 28 kartu dari awal.
- **Maks 1 kartu per tim per match** (termasuk Block / Reverse). **Penantang mengumumkan lebih dulu** (atau menekan
  *Umumkan: tanpa kartu*), lalu lawan. Kartu sebelum-match ditutup saat Game start.
- **Batalkan kartu**: kartu yang sudah dipasang bisa dibatalkan (kembali ke tangan) selama match belum dimulai dan belum
  dijawab lawan. Jawaban Block / Reverse tidak bisa dibatalkan. Pilih Lawan yang dibatalkan → lawan kembali seperti semula.
- **Kartu di tangan rahasia**: data sesi publik (papan iPad, penonton) hanya berisi jumlah kartu; isi tangan hanya
  terlihat di HP tim itu sendiri (dan admin/host lewat tombol **Kartu**; host sesi yang ikut bermain hanya timnya).
- **Papan iPad**: kartu yang dipakai tampil sebagai gambar kartu di court (kiri atas untuk tim kiri, kanan bawah untuk
  tim kanan) dengan cap *diblok* / *dibalik* dan keterangan *game n–n+1* / pemain Switch Hand, plus jumlah kartu di
  tangan kedua tim. Riwayat match & papan skor wasit menampilkan kartu dan efeknya (label teks).

### Gambar & animasi kartu (v2.12)
- Gambar dek ada di `img/cards/<kunci>.webp` (600×840): `free15`, `free30`, `golden`, `double`, `pick`, `nosmash`,
  `noglass`, `swh`, `steal`, `swap`, `block`, `reverse`, `zonk`, dan `back` (sisi belakang). Mengganti desain cukup
  menimpa file dengan nama yang sama.
- **Kartu dipakai** (papan iPad): kartu terbalik muncul di tengah layar, dibuka, keterangan "Tim X memakai …", lalu
  kartunya terbang ke sisi tim itu di court. **Block** menghantam kartu lawan (cap *DIBLOK!*), **Reverse** memutar
  balik kartu lawan (cap *DIBALIK!*). **Zonk** yang diambil tim kalah ikut tampil (cap *DIBUANG*).
- **Ambil kartu**: kartu diacak cepat, melambat, lalu berhenti di kartu yang didapat (hasilnya diundi server). Di HP
  hanya tim itu yang melihat; di papan iPad (host mengambilkan) kartunya tampil terbuka. Zonk mendapat cap *DIBUANG*.
- **HP pemain**: animasi yang sama untuk kartu yang dipakai oleh / ke timnya, Zonk timnya, dan **kartu baru** yang
  diambilkan host untuk timnya (rahasia, hanya di HP tim itu; papan iPad tidak menampilkan kartu yang diambil di HP).
- Di tangan (HP) kartu tampil sebagai gambar; ketuk untuk melihat gambar besar & memakainya.
- Kartu yang sudah ada saat aplikasi dibuka tidak dianimasikan; beberapa kartu sekaligus diputar bergiliran (maks 6
  antre). Ketuk layar untuk melewati. Perangkat dengan *kurangi gerakan* hanya mendapat animasi pudar.
- Koreksi skor yang menukar pemenang: kartu yang diambil tim sebelumnya ditarik (bila belum dipakai), tim kalah baru
  mengambil.

### Tahap 3: ronde, court, podium, notifikasi (v2.12)
- **Pergantian ronde**: "Ronde N" besar di papan iPad & HP, lalu urutan memilih court diacak di depan mata sebelum
  berhenti di urutan sebenarnya. Di HP baris timmu disorot ("Timmu memilih court urutan ke-1"). Ronde yang court-nya
  langsung terisi otomatis menampilkan daftar lawan + court. Ronde 1 hanya tampil bila sesi baru saja dimulai.
- **Court dipilih**: court yang baru dipilih penantang menyala dengan warna court-nya ±3 detik, dengan tulisan
  "Tim X memilih court ini ±N" (papan iPad; court mini di HP ikut menyala).
- **Podium Power Cup**: poin court berwarna (hijau plus, merah minus), baris juara memuat jumlah kartu yang dipakai,
  label "POWER CUP" di atas judul (kecuali nama sesi sudah memuat Power Cup).
- **Notifikasi kartu lawan**: lawan memakai kartu ke timmu → HP kedua pemain dikabari, plus pengingat bila timmu
  memegang Block / Reverse. Pilih Lawan mengabari tim yang dipilih dan dua tim yang lawannya berubah. Kartu yang diblok /
  dibalik dikabarkan ke pemakainya.
- **Pengingat ambil kartu**: saat ronde baru dimulai, tim yang belum mengambil kartu haknya diingatkan sekali.

## Lobi: sudah datang & waiting list (v2.11)

- Di daftar *Hadir* tiap pemain punya status **Datang / Belum datang**. Pemain menandai dirinya sendiri (*Saya sudah
  datang*); admin, host, dan host sesi bisa menandai siapa pun.
- Saat *Mulai Sesi*: yang belum ditandai datang **tidak masuk putaran** (tercatat "Belum datang — tidak diundi") sampai
  menekan *Saya sudah datang* di HP-nya. Host bisa memilih *Semua sudah datang* atau *Mulai tanpa mereka*.
  Bila status datang belum dipakai sama sekali, semua dianggap datang (perilaku lama).
- Power Cup: yang main = yang sudah datang, urut waktu bergabung, maksimal court × 4; waiting list yang sudah datang
  menggantikan yang belum datang. Sisanya jadi **cadangan**.

## Home: halaman pembuka (v2.9.1)

- Semua yang login (admin, host, pemain) membuka app langsung di **Home**; di **Menu**, *Home* ada paling atas, di
  atas *Profil saya*. Penonton tanpa akun tetap ke dashboard publik. Link khusus (lobi, panggilan court, kudos,
  podium) tetap langsung ke halamannya.
- Pengecualian: perangkat yang sengaja dipilih admin sebagai papan court (*Menu → Papan court besar (iPad)*) langsung
  membuka papan court **selama sesi berjalan**, supaya papan tidak hilang dari layar penonton saat app dimuat ulang.
- Admin/host: tombol **Buat rencana sesi** & **Database pemain**, sesi berikutnya, sesi berjalan, sesi sebelumnya.
- Pemain: sapaan, sesi berikutnya (Buka lobi / Saya hadir), sesi yang sedang berjalan (ketuk atau **Buka dashboard
  court**), dan 4 sesi terakhir (ketuk → ringkasan & klasemen; *Lihat semua riwayat sesi*). Home berganti sendiri saat
  sesi dimulai atau selesai.

## Main bola di lobi (v2.9)

- Pemain yang sudah **Bergabung** (termasuk host) mendapat tombol **bola** di pojok kanan atas panggung lobi. Ketuk untuk
  mode main: **analog** di kiri bawah (atau tombol panah / WASD di laptop) dan **tombol lempar** di kanan bawah (atau spasi).
  Ketuk lagi untuk selesai. Penonton dan yang belum bergabung hanya melihat.
- **Otomatis atau manual**: tanpa analog avatar berjalan sendiri. Analog dilepas 8 detik → kembali jalan otomatis.
  Pemain tetap di sisi net-nya; host boleh ke mana saja.
- **Bola**: maksimal 1 bola per orang (jeda 1,5 detik) dan 6 bola sekaligus per lobi. Kena avatar lain → memantul dan
  dibalas ke seberang net seperti reli. Avatar yang dikendalikan analog membalas ke arah analognya (hampir tepat);
  avatar otomatis membalas ke pemukul terakhir dengan meleset sampai ±31°. Dinding memantulkan bola tapi tidak
  memperpanjang umurnya: bola hilang (berkedip dulu) **3 detik setelah pantulan avatar terakhir**, paling lama 20 detik.
- **Sama di semua layar**: gerak otomatis dihitung dari jam server + ID pemain (`play.js`), jadi iPad dan semua HP
  menghitung posisi yang sama tanpa mengirim apa pun; jam HP yang meleset disamakan ke jam server saat tersambung.
  Lintasan bola memakai rumus tertutup (lurus + pantul dinding) dari lemparan/pantulan terakhir.
- **Yang dikirim lewat internet**: posisi analog maks 4×/detik dan hanya selama ditekan, lemparan, dan pantulan.
  Pantulan diputuskan HP pemilik avatar yang kena; untuk avatar yang pemiliknya tidak sedang membuka lobi, oleh HP
  pelempar. Urutan dari server menentukan bila dua HP bentrok.
- **Server terpisah**: `/play?lobby=<id>` dilayani Durable Object `PaddocPlay` per lobi yang hanya meneruskan pesan
  (tidak menyimpan data sesi). Server utama hanya disentuh saat cek akun & laporan pemakaian, jadi skor, chat, dan
  undian tidak ikut melambat. HP yang mengirim lebih dari ±6 pesan/detik diputus.
- **Batas harian**: mode main semua lobi bersama-sama dibatasi **7.500 request/hari = 7,5% kuota gratis** Durable
  Objects (100.000/hari). Hitungannya mengikuti Cloudflare: 20 pesan WebSocket masuk = 1 request, sambungan baru = 1.
  Bila tercapai, mode main berhenti sampai **07.00 WIB** (reset kuota 00.00 UTC); lobi, chat, dan skor tetap jalan.
  Batas bisa diubah lewat Variable `PLAY_BUDGET` (satuan pesan, bawaan `150000`).
- Perkiraan pemakaian: 1 orang menggerakkan analog terus ±720 request/jam; satu lemparan di lobi 8 / 16 / 24 orang rata-rata
  memantul 3,5 / 10 / 23 kali (±0,2 / 0,5 / 1,2 request). Gerak otomatis dan menonton: 0. Membuka lobi: ±2 request.
- Saluran mode main hanya tersambung selama lobi terbuka di layar (ditutup saat app di latar belakang) dan otomatis
  mati saat **Mulai Sesi**. Pratinjau `?lobby=demo` bisa dicoba tanpa server.

## Podium akhir sesi, klasemen, foto pemain (v2.8)

- **Klasemen utama**: jumlah **menang**, lalu **selisih poin** (poin dapat − poin kebobolan, dijumlah tiap match;
  contoh 3-2 = +1, 1-4 = −3, 5-0 = +5 → total +3). Sesi baru memakai urutan ini; *Total poin* dan *Rata-rata*
  tetap bisa dipilih. Sesi lama memakai pilihan saat dibuat.
- **Foto pemain layar penuh**: ketuk foto pemain di mana saja. Foto yang berada di dalam tombol (mis. kartu pemain di
  papan iPad untuk ganti pemain) dibuka dengan **tekan lama** supaya tombolnya tetap berfungsi.
- **Podium** (`ceremony.js`) muncul otomatis saat sesi ditutup di iPad dan HP semua yang membuka app:
  juara 1–3 di podium (avatar chibi melompat girang, foto pro AI di atas kepala, lencana peringkat, trofi), pemain lain sebagai penonton
  yang bersorak, confetti, lampu sorot, dan klasemen akhir (menang · selisih) di samping (iPad) atau di bawah (HP).
  **Simpan foto** (PNG) dan **Rekam video** ±8 detik (MP4/WebM; tombol disembunyikan bila browser tidak mendukung),
  lalu dibagikan/diunduh. Bisa dibuka lagi: dashboard (*Lihat podium*), Menu, dan Riwayat sesi.
- Selebrasi murni **animasi** dari avatar chibi yang sudah ada: tidak ada pembuatan gambar AI tambahan, jadi membuka
  podium tidak pernah memanggil OpenAI.
- **Setelah sesi ditutup**: notifikasi *Terima kasih sudah bergabung! … VAMOS!!!* → podium → kartu terima kasih →
  halaman kudos.

## Jam hadir: full, 1 jam, atau 2 jam (v2.7)

- Rencana sesi punya **jam mulai** dan **jam selesai** booking (boleh lewat tengah malam, maks. 12 jam).
- Saat **Saya Bergabung**, pemain memilih **Full** atau hanya **1 jam / 2 jam** dan menentukan sendiri jamnya
  (mis. booking 19.00–22.00: 19–20, 20–21, 21–22, 19–21, 20–22). Jam bisa diubah lewat tombol kalender di lobi.
  Host selalu full; biaya sama untuk semua.
- Lobi menampilkan jam tiap pemain dan **jumlah pemain per jam** supaya host bisa memperkirakan court.
- Saat sesi berjalan: pemain yang jamnya belum mulai dijeda (*mulai 20.00*) dan otomatis masuk antrean undian
  5 menit sebelum jamnya; 10 menit sebelum jamnya habis ia berhenti diundi (match yang sedang dimainkan tetap selesai).
  Keduanya berjalan sendiri lewat alarm Durable Object dan dikabari lewat notifikasi. Datang lebih awal? **Saya sudah
  datang**. Mau lanjut setelah jamnya habis? **Main lagi**.
- Mengubah jadwal di *Ubah rencana* mengembalikan pilihan jam sebagian ke full (pemain diminta memilih lagi).
- Mulai Sesi butuh minimal 4 pemain yang jamnya sudah mulai.

## Host sesi dari pemain (v2.6)

Admin/host bisa menunjuk pemain jadi **host sesi** (lobi: *Ubah rencana*; saat main: panel **Pemain**, tombol bendera).
Host sesi bisa Game start, Panggil, memasukkan/mengubah skor, mengganti dan mengeluarkan/menambah pemain, serta
mereview koreksi skor, **hanya di sesi itu**. Mengakhiri sesi, mengatur court, mengganti host, payment collector,
dan database tetap khusus admin/host.

## Pembayaran sesi (v2.6)

- **Biaya per orang** diisi saat membuat rencana (bisa diubah di *Ubah rencana* atau panel Pembayaran). Tampil di kartu
  *Sesi berikutnya*, header lobi, teks ajakan yang dibagikan, dashboard, dan riwayat sesi.
- Admin/host memilih **payment collector** dari host atau pemain. Collector mengisi bank, nama, dan nomor rekening
  (tersimpan di akunnya, otomatis terisi di sesi berikutnya). Pemain bisa **Salin** nomor rekening (angka saja) dan nominal.
- Pemain menekan **Bayar** (lobi, dashboard, Menu → Pembayaran sesi) lalu **unggah bukti**: tanda hijau langsung
  muncul dan collector mendapat notifikasi. Collector bisa **Batalkan** (dengan alasan; pemain diberi tahu) atau
  **Tandai lunas** untuk bayar tunai. Pembayaran tetap bisa setelah sesi selesai.
- Yang membayar: pemain yang hadir (host tidak). Rekening hanya terlihat oleh yang login dan ikut sesi; foto bukti hanya
  oleh pengirim, collector, dan admin/host. Status hijau terlihat semua yang ikut.

## Riwayat match, koreksi skor, riwayat sesi (v2.6)

- **Riwayat match** (tombol di dashboard) untuk semua: lama tiap match (dari Game start sampai skor masuk), filter
  **Match saya**.
- Pemain di match yang sudah selesai bisa **Koreksi skor** (skor usulan mengikuti aturan skor sesi + keterangan).
  Admin, host sesi, dan host mendapat notifikasi dan bar *koreksi menunggu review*; **Simpan skor ini** memperbaiki skor
  (klasemen ikut berubah) atau **Tolak**, dan pemain diberi tahu hasilnya.
- **Riwayat sesi** (Menu atau dashboard) untuk semua yang login: daftar sesi yang selesai (podium, *Kamu ikut*, filter
  *Yang saya ikuti*), detail berisi klasemen akhir, durasi sesi, riwayat match + durasi, dan status pembayaran.

## Sinkron & notifikasi

Server mengirim perubahan ke semua perangkat lewat WebSocket begitu terjadi; cek berkala tetap jalan setiap 30 detik
sebagai cadangan (3–4 detik bila WebSocket terputus).

**Notifikasi**: sesi baru, pengingat 12 jam & 3 jam sebelum main, panggilan court, ajakan kudos setelah sesi, ditunjuk
jadi host sesi/payment collector, bukti bayar masuk/dibatalkan, koreksi skor (masuk & hasil review), serta jam
main dimulai/selesai bagi pemain yang hadir sebagian. Tombol **Panggil** di court mengirim notifikasi push ke HP keempat pemain berisi court, partner, dan
lawan, dengan tombol **Siap** / **Skip dulu**. Kunci VAPID dibuat otomatis oleh server, tidak perlu disetel.

- Link Paddoc Host di **Android** terbuka langsung di aplikasi yang sudah terpasang (aplikasi yang sedang terbuka
  langsung pindah ke halaman link). Di **iPhone/iPad** link selalu terbuka di Safari (aturan Apple); layar di Safari
  mengarahkan untuk membuka Paddoc Host dari layar utama, dan sesinya ada di beranda.
- HP dan tablet **wajib memasang aplikasi ke layar utama** dulu (petunjuk iPhone/iPad dan Android; bila link terbuka di
  dalam WhatsApp/Instagram ada petunjuk membuka di Chrome/Safari). Link lobi yang dibuka di HP baru menampilkan
  ringkasan sesinya di layar pasang. Setelah terpasang: izinkan notifikasi (boleh nanti), lalu login. Laptop tidak wajib.
- **Belum punya akun?** Halaman masuk, layar pasang, dan lobi (bagi yang belum login) punya tombol **Chat admin di
  WhatsApp** (`wa.me`) dengan pesan pembuatan akun yang sudah terisi: nama lengkap, nama panggilan, putra/putri,
  berhijab, sesi yang ingin diikuti (bila dari link lobi), dan pengingat mengirim 1 foto wajah. Nomor admin diatur di
  `config.js` (`PADDOC_ADMIN_WA`, sekarang `085121300042`; awalan `0` otomatis menjadi `62`).
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
