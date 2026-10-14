# Si Deploy — Web Deployer Vercel

Web kecil untuk men-deploy situs HTML ke Vercel tanpa akun Vercel sendiri.
Satu token Vercel disimpan di server. Teman membuka URL, mengisi nama,
memilih sumber (GitHub / ZIP / folder), lalu deploy.
Batas 180 project aktif; saat penuh, project tertua otomatis dihapus.

Acuan: `PRD-vercel-deployer.md`. Dokumen desain UI tidak disertakan di repo ini.

## Struktur

```
app/
  page.tsx                  Halaman depan (form deploy + ledger terhapus)
  layout.tsx                Font, metadata SEO, template judul
  globals.css               Palet gelap, token, keyframes, reduced motion
  icon.svg                  Favicon + ikon PWA (vektor)
  apple-icon.tsx            Ikon layar utama iOS, dirender jadi PNG
  opengraph-image.tsx       Gambar preview tautan 1200x630 (WhatsApp/OG)
  manifest.ts               Web app manifest
  robots.ts                 robots.txt: izinkan publik, tutup /api dan /admin
  sitemap.ts                sitemap.xml (situs satu halaman)
  admin/page.tsx            Daftar semua deploy + filter status + cari (server)
  admin/login/page.tsx      Form masuk admin (tanpa JS)
  api/deploy/route.ts       POST: alur deploy utama (NDJSON stream)
  api/upload/route.ts       POST: token client upload Vercel Blob
  api/check-name/route.ts   GET: cek ketersediaan nama (DB + DNS)
  api/cron/cleanup/route.ts GET/POST: sapuan nyangkut (cron harian Hobby)
  api/admin/login/route.ts  POST: set cookie sesi admin
  api/admin/logout/route.ts POST: hapus cookie sesi admin
  api/admin/sweep/route.ts  POST: tombol "Bersihkan" di menu admin
components/
  DeployForm.tsx            Form deploy + dropzone + status bar bawah (client);
                            hanya render + langganan handler, tanpa urutan deploy
  DeletedList.tsx           Ledger project terhapus (server)
  Capacity.tsx              Penanda slot terpakai di bar atas (server)
  Background.tsx            Latar kisi titik statis
  SideIcons.tsx             Ikon hiasan bergerak di tepi layar
  icons.tsx                 Set ikon outline SVG (inline)
  BrandMark.tsx             Lambang untuk gambar render mesin (inline style saja)
lib/
  site.ts                   Identitas situs: judul, deskripsi, URL, OG, Twitter
  db.ts                     Pool Neon + seam adapter database (useDatabase)
  vercel.ts                 createDeployment + polling + deleteProject
  sources.ts                github / zip (Blob)
  deploy-protocol.ts        kontrak kabel: tipe event, tahap, sumber,
                            encoder + parser NDJSON murni (dipakai 2 sisi)
  errors.ts                 AppError (kode + field) dan satu mapper ke Response
  deploy-client.ts          sisi klien alur deploy: batas, zip, unggah Blob,
                            panggilan /api/deploy, baca NDJSON (tanpa React)
  validate.ts               nama, path, ukuran, anti zip bomb + batas bersama
  deployments.ts            pemilik tabel deployments: kosakata status,
                            transaksi slot, transisi, bacaan, sapuan
  ratelimit.ts              kuota jendela tetap ber-scope (deploy, adminLogin)
  admin.ts                  Sesi admin: HMAC cookie + cek password
  *.test.ts                 Tes Vitest: validate, sources, protocol, errors,
                            deploy-client, deployments, ratelimit, vercel
db/schema.sql               Skema Neon (deployments, rate_limits)
db/migrations/              Migrasi untuk database yang sudah terlanjur dibuat
  001-rate-limit-scope.sql    tambah kolom scope + kunci utama baru
vercel.json                 Cron sapuan harian (batas Hobby)
vitest.config.mts           Konfigurasi tes (alias @, hanya lib/**)
```

## Setup lokal

```bash
npm install
cp .env.example .env.local   # isi VERCEL_TOKEN, DATABASE_URL, BLOB_READ_WRITE_TOKEN
psql "$DATABASE_URL" -f db/schema.sql
npm run dev
npm test                     # Vitest, tanpa database (adapter disuntik)
```

Sudah punya database dari versi sebelumnya? Jalankan juga berkas di
`db/migrations/` sesuai urutan nomornya (`psql "$DATABASE_URL" -f db/migrations/001-rate-limit-scope.sql`).
Berkas migrasi aman diulang dan tidak menghapus data.

Tanpa env, halaman tetap tampil; deploy dan cek nama memakai database.

## Tes

`npm test` (sekali jalan) atau `npm run test:watch`. Tak butuh database:
`lib/db.ts` menyediakan seam adapter (`useDatabase()`), jadi
`lib/deployments.ts` dan `lib/ratelimit.ts` bisa diuji di memori. Tes
`deployments` memakai adapter palsu untuk transisi slot, pemetaan
`NameTakenError`, dan perakitan daftar admin; tes `ratelimit` memakai
penghitung palsu yang meniru `ON CONFLICT`, jadi kenaikan kuota sungguhan
yang diuji. `lib/validate.ts` dan `stripRoot()` diuji langsung karena murni.

## SEO & preview tautan

Halaman depan sengaja terbuka untuk mesin pencari (`index, follow`); `/api`
dan `/admin` ditutup lewat `robots.txt`. `sitemap.xml`, `robots.txt`, dan
`manifest.webmanifest` semuanya mengambil judul dan deskripsi dari
`lib/site.ts`, jadi kalimatnya tak bisa berbeda antar tempat.

Kartu preview WhatsApp/Twitter dibangun oleh `app/opengraph-image.tsx`
(1200x630, PNG, sekitar 42 KB) dan dirender saat build — tak ada berkas
gambar yang perlu disimpan di repo. WhatsApp membaca `og:title`,
`og:description`, `og:image`, dan `og:image:width/height`; URL gambar wajib
absolut, sebab itu `metadataBase` diisi dari `SITE.url`.

`SITE.url` diambil berurutan dari `NEXT_PUBLIC_SITE_URL` →
`VERCEL_PROJECT_PRODUCTION_URL` → `http://localhost:3000`. Dua yang pertama
adalah env **waktu build**: `robots.txt` dan `sitemap.xml` diprerender saat
build, jadi mengganti domain perlu deploy ulang.

Catatan saat menguji: WhatsApp menyimpan cache preview per URL. Paksa ambil
ulang dengan menambahkan query (`?v=2`) atau lewat Facebook Sharing Debugger.
Kalau Deployment Protection dinyalakan nanti, crawler WhatsApp tak bisa
mengambil gambarnya.

## Menu admin

Buka `/admin`. Dilindungi password tunggal dari env `ADMIN_PASSWORD`.
Kosong = menu admin nonaktif (halaman menampilkan pesan). Setelah masuk,
cookie sesi httpOnly bertanda tangan HMAC berlaku 12 jam; tombol Keluar
menghapusnya. Isinya: daftar semua baris `deployments` (100 terbaru),
filter per status, dan pencarian nama. Tombol **Bersihkan** menjalankan
sapuan yang sama dengan cron: pending basi ditandai gagal, deleting
menggantung diulang penghapusannya di Vercel.

Tebakan password dibatasi **10 percobaan per 15 menit per IP**
(`RATE_LIMITS.adminLogin`). Penghitungan terjadi sebelum password diperiksa,
jadi tebakan salah pun terhitung. Kalau database tak bisa dihubungi, login
**ditolak** (gagal-tertutup): tanpa penghitung tak ada proteksi, dan menu
admin memang butuh database. Pesan yang muncul dibedakan: `?error=limit`,
`?error=db`, `?error=1` (password salah), `?error=off` (admin nonaktif).

## Deploy ke Vercel

1. Push repo ini, import ke Vercel.
2. Tambahkan integrasi **Neon** (Marketplace) dan **Blob** (Storage) pada project.
3. Set env `VERCEL_TOKEN` (server only), opsional `VERCEL_TEAM_ID`, `MAX_PROJECTS=180`, dan `ADMIN_PASSWORD` untuk menu `/admin`.
   Opsional juga `NEXT_PUBLIC_SITE_URL` (mis. `https://si-deploy.vercel.app`) kalau memakai domain sendiri — dipakai `robots.txt`, `sitemap.xml`, canonical, dan URL `og:image`. Kalau kosong, diambil dari domain produksi Vercel.
4. Jalankan `db/schema.sql` di database Neon (kalau database-nya sudah ada
   dari versi sebelumnya, jalankan berkas di `db/migrations/` sesuai urutan).
5. Cron sapuan otomatis dari `vercel.json` (`/api/cron/cleanup`, harian).
   Vercel Hobby hanya mengizinkan cron sekali sehari; ekspresi per jam
   membuat deploy ditolak.

## Keputusan implementasi

- Satu modul, `lib/deployments.ts`, memegang tabel `deployments`: kosakata
  status, semua query, dan semua transisi. Tidak ada SQL `deployments` di
  luar modul itu.
- Seam database tinggal di `lib/db.ts` (`useDatabase()`, `getDatabase()`),
  bukan di tiap modul. Produksi memakai pool Neon; tes menyuntik adapter
  palsu satu kali dan `deployments.ts` maupun `ratelimit.ts` ikut memakainya.
- `lib/deploy-protocol.ts` adalah satu-satunya tempat tipe `DeployEvent`,
  tahap (`files`/`slot`/`create`), dan bentuk `source` dideklarasikan. Klien
  dan server mengimpornya; parser NDJSON (`decodeEvents`) murni dan diuji
  tanpa React. `STAGE_INDEX` berbentuk `Record` atas union tahap, jadi
  menambah tahap memaksa keputusan di sana, bukan diam-diam jatuh ke 0.
- Batas dan aturan dibagi lewat `lib/validate.ts`, bukan disalin: klien
  memakai `isValidName()`, `MAX_ZIP_BYTES`, `MAX_FILES`, `ZIP_ACCEPT`,
  `NAME_RULE_TEXT`; route upload memakai `MAX_ZIP_BYTES` dan
  `ZIP_CONTENT_TYPES`. Tes menjaga `isValidName` dan `validateName` tak
  berbeda pendapat. `validate.ts` bebas impor runtime, jadi aman dipakai
  komponen klien.
- Urutan deploy ada di `lib/deploy-client.ts`, bukan di `DeployForm.tsx`.
  Komponen hanya meneruskan input dan berlangganan handler (`onStage`,
  `onDone`, `onError`); batas ukuran, pembuatan ZIP, unggah Blob, panggilan
  `/api/deploy`, dan pembacaan NDJSON semuanya di modul itu, jadi bisa
  dipanggil dan diuji tanpa merender React. `@vercel/blob/client` diimpor
  dinamis supaya modul tetap bisa diimpor Node saat tes.
- Makna error ada di `lib/errors.ts`: `AppError` membawa kode HTTP dan field
  formulir yang terdampak. Turunannya: `ValidationError` (400; 400 + field
  `name` kalau dari `validateName`), `NameTakenError` (409, field `name`),
  `VercelApiError` (kode dari respons Vercel, default 502), `RateLimitError`
  (429, pesannya diambil dari kebijakan yang kena). Tak ada route yang
  menyalin status atau menebak field dari teks pesan; klien memakai `field`
  dari event NDJSON. Route upload tetap memakai 400 untuk kegagalan
  penerbitan token Blob (keputusan lokal, bukan 500).
- Rate limit adalah satu tabel (`rate_limits`) dengan kolom `scope`, bukan
  satu tabel per kebijakan: `RATE_LIMITS` di `lib/ratelimit.ts` memegang
  batas, jendela, dan pesan tiap scope (`deploy` 5/jam, `adminLogin`
  10/15 menit). Halaman login mengimpor pesan itu, jadi kalimatnya tak bisa
  berbeda dari yang dipakai server. Jendelanya tetap (bukan meluncur):
  ledakan tepat di batas jendela masih mungkin, dan kuota per IP saja tak
  menahan serangan dari banyak IP — cukup untuk panel milik sendiri, bukan
  untuk panel banyak pengguna. Kegagalan database di login admin ditolak
  (gagal-tertutup), bukan dilewatkan.
- Validasi lokal (`validateName`) dijalankan sebelum rate limit dan database,
  jadi input tak valid tak memakai kuota dan galatnya bisa ditandai ke nama.
- Pending basi ditangani di titik baca, bukan di cron: baris `pending` yang
  lebih tua dari `PENDING_TTL_MS` (10 menit) tidak memakai slot dan tidak
  mengunci nama. Jadi kebenaran tidak bergantung pada frekuensi cron —
  penting karena Vercel Hobby hanya mengizinkan cron sekali sehari. Cron dan
  tombol admin hanya jaring pengaman.
- Respons `/api/deploy` berupa NDJSON stream: event `stage` per tahap
  (files → slot → create), lalu `done` atau `error` dengan kode 400/409/429/502.
- ZIP diunggah browser langsung ke Vercel Blob (client upload) agar lolos
  batas body 4,5 MB (PRD 9.1). Folder dikemas jadi ZIP di browser (fflate).
- Auto-hapus: transaksi + `pg_advisory_xact_lock`, hapus hanya via
  `vercel_project_id` dari tabel `deployments`, di luar lock.
- Animasi murni CSS (satu reveal saat muat, rail tahap deploy mengikuti
  stream NDJSON, tab geser, reduced motion dihormati). Latar kisi titik
  statis; tanpa glow, tanpa cursor light, library Motion tidak dipakai.
- Metadata disusun supaya tak saling menimpa: `openGraph` yang disetel di
  halaman **mengganti** milik layout, bukan menyatu. Karena itu dasarnya
  (`OPEN_GRAPH`, `TWITTER`) tinggal di `lib/site.ts` dan halaman depan
  menyebarnya, bukan menulis ulang sebagian. Template judul juga menambah
  " — Si Deploy" sekali, jadi judul halaman admin tak boleh memuatnya lagi.
- Endpoint Vercel sudah dicek ke dokumentasi resmi (14 Okt 2026):
  `POST /v13/deployments` (query `skipAutoDetectionConfirmation`, `teamId`),
  `GET /v13/deployments/{idOrUrl}`, `DELETE /v9/projects/{idOrName}`.
  Temuan penting: entri `files` **wajib** menyertakan `encoding: "base64"`.
  Tanpa itu Vercel membaca `data` sebagai teks utf-8, jadi tiap file terisi
  string base64, bukan isi aslinya. Tes di `lib/vercel.test.ts` menjaga
  bentuk body ini.
