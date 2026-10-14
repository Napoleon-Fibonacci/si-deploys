-- Migrasi untuk database Neon yang sudah dibuat sebelum rate limit ber-scope.
-- Jalankan sekali di SQL Editor Neon. Aman diulang; tidak menghapus data.
--
-- Sebelum ini, tabel rate_limits hanya dipakai oleh kuota deploy, jadi baris
-- lama otomatis ber-scope 'deploy' lewat nilai DEFAULT di bawah.

ALTER TABLE rate_limits
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'deploy';

ALTER TABLE rate_limits DROP CONSTRAINT IF EXISTS rate_limits_pkey;

-- Kunci utama baru: satu baris per (scope, IP, jendela).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'rate_limits'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE rate_limits ADD PRIMARY KEY (scope, ip, window_start);
  END IF;
END $$;
