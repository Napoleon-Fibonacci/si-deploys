/**
 * Samarkan nama project untuk daftar publik di halaman depan.
 *
 * Halaman itu bisa dibuka siapa saja, jadi nama project orang lain — dan
 * sekaligus alamat URL-nya — tidak boleh ikut ke browser. Yang tersisa hanya
 * huruf pertama tiap bagian nama, paling banyak empat.
 *
 * "test-cheeses" → "TC" · "blog" → "B" · "a-b-c-d-e" → "ABCD" · "---" → "?"
 */
export function maskName(name: string): string {
  const initials = name
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase())
    .slice(0, 4)
    .join("");
  return initials || "?";
}
