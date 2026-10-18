# PRD: Web Deployer Vercel

Versi: 0.1 (draft) · Tanggal: 12 Oktober 2026

## 1. Ringkasan

Web kecil untuk men-deploy situs HTML ke Vercel tanpa perlu akun Vercel sendiri. Pemilik menyimpan satu token API Vercel di server. Teman-teman memakai web ini lewat URL tanpa login. Semua deploy masuk ke akun Vercel pemilik. Jumlah project buatan deployer dibatasi 180: saat batas tercapai, project tertua otomatis dihapus sebelum deploy baru dijalankan.

## 2. Tujuan dan Non-Tujuan

**Tujuan**
- Teman bisa deploy situs HTML dari dua sumber: URL repo GitHub atau upload ZIP/folder.
- Hasil deploy memakai nama pilihan pengguna: `namaweb.vercel.app`.
- Jumlah project buatan deployer tidak pernah melebihi 180.
- Project pribadi pemilik tidak pernah tersentuh.

**Non-tujuan (versi ini)**
- Login atau akun per pengguna.
- Build framework (Next.js, Vite, dll.) pada situs yang di-deploy.
- Custom domain, edit situs setelah deploy, atau redeploy ke nama yang sama.
- Skala besar. Target hanya beberapa teman.

## 3. Pengguna

- **Pemilik:** mengelola token Vercel dan konfigurasi server.
- **Teman:** membuka URL deployer, mengisi nama, memilih sumber, lalu deploy.

## 4. Tech Stack

| Komponen | Pilihan |
|---|---|
| Framework | Next.js (App Router) |
| Hosting | Vercel |
| Database | Neon Postgres (Vercel Marketplace) |
| Penyimpanan upload sementara | Vercel Blob (lihat catatan teknis 9.1) |
| Integrasi deploy | Vercel REST API, token di env var server |

## 5. Fitur

### 5.1 Form deploy
Input:
1. **Nama project** (menjadi subdomain). Aturan: huruf kecil, angka, dan tanda hubung; panjang 3 sampai 40 karakter; tidak diawali atau diakhiri tanda hubung.
2. **Sumber** (pilih satu):
   - URL repo GitHub (hanya `github.com`, repo publik).
   - Upload ZIP atau folder (maks. 10 MB per ZIP, maks. 100 file).

### 5.2 Validasi nama
- Tolak jika nama sudah ada di tabel `deployments` (nama kembar ditolak, tidak ada timpa atau redeploy).
- Cek ketersediaan subdomain `nama.vercel.app` sebelum deploy.
- Setelah deploy, baca domain aktual dari respons Vercel dan tampilkan ke pengguna. Jika Vercel memberi akhiran acak karena nama sudah dipakai pihak lain, tampilkan URL aktual beserta pemberitahuan.

### 5.3 Auto-hapus project tertua
Aturan inti:
- Batas: **180 project aktif** buatan deployer.
- Saat ada permintaan deploy baru dan jumlah project aktif sudah 180: hapus 1 project tertua (berdasarkan `created_at`), lalu jalankan deploy baru. Total tetap maksimal 180.
- Penghapusan **hanya** terhadap project yang tercatat di database deployer, memakai `vercel_project_id` yang tersimpan. Deployer tidak pernah menghapus berdasarkan daftar project di akun Vercel.
- Penghapusan dan pencatatan jumlah dilakukan dalam satu transaksi dengan lock, agar dua deploy bersamaan tidak melewati batas.
- Jika penghapusan di Vercel gagal, deploy baru dibatalkan dan pengguna melihat pesan error.

### 5.4 Daftar project di halaman depan
Halaman depan menampilkan daftar project yang **sedang hidup** (20 terbaru) supaya terlihat ada aktivitas. Semula daftarnya berisi project yang baru dihapus lengkap dengan namanya, tapi halaman depan itu publik — nama project menunjuk langsung ke URL-nya — jadi diganti: yang tampil hanya dua huruf pertama nama, sisanya bintang, ditutup `.vercel.app`, tanpa tautan. Tidak ada masa perlindungan umur project.

## 6. Alur Deploy

1. Pengguna mengisi form dan menekan Deploy.
2. Server memvalidasi nama dan sumber (bagian 5.2 dan 8).
3. Server mengambil dan memeriksa file dari sumber.
4. Server mengunci dan menghitung project aktif. Jika sudah 180, hapus project tertua (5.3).
5. Server membuat project dan deployment lewat Vercel API (project `nama`, tanpa framework, produksi).
6. Server mencatat project ke database dan menampilkan URL final.
7. Jika langkah 5 gagal setelah langkah 4 menghapus project, hasil hapus tetap berlaku. Ini risiko yang diterima; pengguna diberi pesan error dan boleh mencoba lagi.

## 7. Model Data (Neon)

Tabel `deployments`:

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | uuid | primary key |
| name | text | unik, nama project |
| vercel_project_id | text | id project di Vercel |
| url | text | URL aktual hasil deploy |
| source_type | text | `github` atau `zip` |
| created_at | timestamptz | dasar penentuan "tertua" |
| deleted_at | timestamptz | null jika masih aktif |

- Project aktif: `deleted_at IS NULL`.
- Daftar terhapus: `deleted_at IS NOT NULL`, urut `deleted_at` menurun, limit 20.
- Nama yang sudah dihapus boleh dipakai lagi. Pakai unique index parsial hanya untuk baris aktif.

## 8. Batasan dan Validasi

- Situs yang di-deploy: HTML/CSS/JS statis. Boleh ada folder `api/` untuk serverless function. Tidak ada langkah build.
- ZIP maksimal 10 MB, maksimal 100 file.
- Tolak path berbahaya di dalam ZIP (`../`, path absolut) dan ZIP yang ukuran setelah ekstrak jauh melebihi batas (zip bomb).
- Sumber GitHub: hanya host `github.com`, hanya repo publik. Tolak host lain untuk mencegah SSRF.
- Wajib ada `index.html` di root, kecuali situs hanya berisi serverless function.

## 9. Catatan Teknis

### 9.1 Batas body request di Vercel Functions
Vercel Functions punya batas ukuran body request sekitar 4,5 MB (verifikasi di dokumentasi saat implementasi). Itu lebih kecil dari batas ZIP 10 MB. Solusi yang diusulkan: browser mengunggah ZIP langsung ke Vercel Blob (client upload), lalu server mengambil file dari Blob. Alternatif: turunkan batas ZIP menjadi 4 MB.

### 9.2 Token Vercel
Token disimpan sebagai env var server (`VERCEL_TOKEN`). Tidak pernah dikirim ke browser dan tidak pernah masuk log. Gunakan token dengan scope akun pemilik; pertimbangkan membuat tim Vercel khusus deployer agar project terpisah dari project pribadi.

### 9.3 Batas plan Vercel
Cek batas jumlah project, durasi function, dan aturan penggunaan pada plan Vercel yang dipakai. Angka 180 perlu dipastikan masih di bawah batas project plan tersebut.

## 10. Keamanan

Tanpa login, siapa pun yang mendapat URL bisa memakai token pemilik. Risikonya: spam deploy, project sampah, atau memicu auto-hapus berulang sampai project teman terhapus. Mitigasi yang diusulkan (lihat bagian 12, poin 1):
- URL deployer dirahasiakan dan tidak diindeks (`noindex`).
- Rate limit per IP (misalnya 5 deploy per jam).
- Batas ukuran dan jumlah file (bagian 8).
- Semua penghapusan berbasis `vercel_project_id` dari database (5.3).

Serverless function milik teman berjalan di akun pemilik dan memakai kuota pemilik. Pantau penggunaan secara berkala.

## 11. Kriteria Sukses

- Deploy HTML dari ketiga sumber menghasilkan URL yang bisa dibuka.
- Setelah project aktif mencapai 180, deploy berikutnya menghapus tepat 1 project tertua buatan deployer, dan total tetap 180.
- Tidak ada project pribadi pemilik yang terhapus dalam pengujian.
- Nama kembar ditolak dengan pesan jelas.
- Daftar project terhapus tampil di halaman depan.

## 12. Pertanyaan Terbuka

1. Mitigasi penyalahgunaan (bagian 10) belum dikonfirmasi: cukup URL rahasia + rate limit, atau tambah satu kode akses bersama?
2. Solusi batas upload 10 MB (bagian 9.1): pakai Vercel Blob atau turunkan batas ZIP?
3. Sumber GitHub: cukup repo publik saja?
4. Perlu cron ping berkala? Tidak perlu untuk Neon, tapi perlu dipikirkan jika nanti pindah DB.
