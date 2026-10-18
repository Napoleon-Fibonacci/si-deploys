-- Migrasi untuk database Neon yang dibuat saat halaman depan masih punya
-- daftar "Baru dihapus". Daftar itu sudah diganti daftar project hidup dengan
-- nama tersamar, jadi indeksnya tidak dipakai kueri mana pun lagi dan hanya
-- jadi beban tulis. Aman diulang; tidak menghapus data.

DROP INDEX IF EXISTS deployments_deleted_recent;
