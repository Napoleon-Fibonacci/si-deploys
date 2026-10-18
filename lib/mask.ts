/**
 * Samarkan nama project untuk daftar publik di halaman depan.
 *
 * Halaman itu bisa dibuka siapa saja, jadi nama project orang lain — dan
 * sekaligus alamat URL-nya — tidak boleh ikut ke browser. Yang tersisa hanya
 * dua huruf pertama; sisanya jadi bintang, satu per huruf, jadi panjangnya
 * masih terbaca dan dua nama berbeda tetap terlihat berbeda.
 *
 * "test-cheeses" → "te**********" · "blog" → "bl**" · "ab" → "a*"
 *
 * Nama 0–1 huruf tak menyisakan apa pun untuk disembunyikan, jadi seluruhnya
 * jadi bintang. Nama kosong hanya mungkin dari data rusak; hasilnya "?".
 */
export function maskName(name: string): string {
  if (name.length === 0) return "?";

  const shown = Math.max(0, Math.min(2, name.length - 1));
  return name.slice(0, shown) + "*".repeat(name.length - shown);
}
