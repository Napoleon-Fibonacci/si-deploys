import { getDatabase } from "./db";
import type { SourceType } from "./deploy-protocol";
import { AppError, NAME_TAKEN_MESSAGE } from "./errors";
import { MAX_PROJECTS } from "./validate";
import { deleteProject, projectExists } from "./vercel";

/**
 * Satu modul pemilik tabel `deployments`. Semua konsumen memanggil operasi
 * bernama di sini; tak ada yang menulis SQL langsung dari luar.
 *
 * Aturan penting: baris "hidup" memakai slot dan mengunci nama lewat unique
 * index parsial. Pending yang lebih tua dari PENDING_TTL_MS dianggap mati
 * (basi), jadi kebenaran tidak bergantung pada jadwal cron — di Vercel Hobby
 * cron hanya boleh jalan sekali sehari. Cron menjadi jaring pengaman saja.
 */

const TABLE = "deployments";

/** Kosakata status. Harus sinkron dengan CHECK di db/schema.sql. */
export const DEPLOY_STATUSES = ["pending", "active", "deleting", "deleted", "failed"] as const;
export type DeployStatus = (typeof DEPLOY_STATUSES)[number];

export const STATUS_LABEL: Record<DeployStatus, string> = {
  pending: "Menunggu",
  active: "Aktif",
  deleting: "Menghapus",
  deleted: "Terhapus",
  failed: "Gagal",
};

export const PENDING_TTL_MS = 10 * 60 * 1000;
const STALE_SQL = `interval '${Math.floor(PENDING_TTL_MS / 1000)} seconds'`;

/** Predikat SQL untuk baris hidup. Pending basi tidak termasuk. */
const LIVE_SQL = `(status IN ('active','deleting') OR (status = 'pending' AND created_at > now() - ${STALE_SQL}))`;

const FAIL_STALE_SQL = `UPDATE ${TABLE} SET status = 'failed'
  WHERE status = 'pending' AND created_at <= now() - ${STALE_SQL}`;

/**
 * Buang jendela rate limit yang sudah lewat. Jendelanya tetap, jadi baris
 * lama tak akan pernah disentuh lagi dan hanya menumpuk di Neon; sapuan
 * harian yang merapikannya. Satu hari jauh lebih tua dari jendela terpanjang
 * (satu jam untuk deploy), jadi tak ada kuota berjalan yang ikut terhapus.
 */
const PRUNE_RATE_LIMITS_SQL = `DELETE FROM rate_limits
  WHERE window_start < now() - interval '1 day'`;

/* ---------- Kesalahan domain ---------- */

export class NameTakenError extends AppError {
  constructor() {
    super(409, NAME_TAKEN_MESSAGE, "name");
    this.name = "NameTakenError";
  }
}

/* ---------- Bentuk yang dikembalikan modul ---------- */

export interface ReservedVictim {
  id: string;
  name: string;
  vercelProjectId: string | null;
}

export interface Reservation {
  rowId: string;
  victim: ReservedVictim | null;
}

export interface ActiveRow {
  id: string;
  name: string;
  created_at: string | Date;
}

export interface AdminRow {
  id: string;
  name: string;
  status: DeployStatus;
  source_type: string;
  url: string | null;
  created_at: string | Date;
  deleted_at: string | Date | null;
}

export interface AdminList {
  rows: AdminRow[];
  counts: Record<DeployStatus, number>;
  total: number;
  matched: number;
}

export interface AdminFilter {
  status?: DeployStatus | null;
  q?: string;
}

export interface SweepResult {
  failed: number;
  deleted: number;
  /** Baris yang mengaku hidup tapi project-nya sudah tak ada di Vercel. */
  gone: number;
  remaining: number;
}

/* ---------- Transisi ---------- */

/**
 * Reservasi slot dalam satu transaksi dengan advisory lock.
 * Pending basi dibebaskan lebih dulu supaya nama dan slotnya bisa dipakai
 * ulang tanpa menunggu cron. Lock hanya dipegang selama transaksi singkat;
 * panggilan Vercel API terjadi di luar lock.
 */
export async function reserveSlot(
  name: string,
  sourceType: SourceType
): Promise<Reservation> {
  const client = await getDatabase().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(1)");
    await client.query(FAIL_STALE_SQL);

    let rowId: string;
    try {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO ${TABLE} (name, source_type, status)
         VALUES ($1, $2, 'pending')
         RETURNING id`,
        [name, sourceType]
      );
      rowId = inserted.rows[0].id;
    } catch (error) {
      // try/catch, bukan .catch(): adapter yang melempar sinkron pun
      // harus tetap jadi NameTakenError.
      if (isUniqueViolation(error)) throw new NameTakenError();
      throw error;
    }

    let victim: ReservedVictim | null = null;
    const counted = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM ${TABLE} WHERE ${LIVE_SQL}`
    );
    if ((counted.rows[0]?.count ?? 0) > MAX_PROJECTS) {
      const oldest = await client.query<ReservedVictim>(
        `UPDATE ${TABLE}
         SET status = 'deleting'
         WHERE id = (
           SELECT id FROM ${TABLE}
           WHERE ${LIVE_SQL} AND status <> 'deleting'
           ORDER BY created_at ASC
           LIMIT 1
           FOR UPDATE SKIP LOCKED
         )
         RETURNING id, name, vercel_project_id AS "vercelProjectId"`
      );
      victim = oldest.rows[0] ?? null;
      if (!victim) {
        throw new Error("Batas tercapai tapi tidak ada project hidup untuk dihapus.");
      }
    }

    await client.query("COMMIT");
    return { rowId, victim };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Transaksi mungkin sudah batal; kesalahan asli yang dilaporkan.
    }
    throw error;
  } finally {
    client.release();
  }
}

/** Pelanggaran unique index (Postgres 23505). */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "23505"
  );
}

export async function markActive(
  rowId: string,
  vercelProjectId: string,
  url: string
): Promise<void> {
  await getDatabase().query(
    `UPDATE ${TABLE} SET status = 'active', vercel_project_id = $2, url = $3 WHERE id = $1`,
    [rowId, vercelProjectId, url]
  );
}

export async function markFailed(rowId: string): Promise<void> {
  await getDatabase().query(`UPDATE ${TABLE} SET status = 'failed' WHERE id = $1`, [rowId]);
}

export async function markDeleted(rowId: string): Promise<void> {
  await getDatabase().query(
    `UPDATE ${TABLE} SET status = 'deleted', deleted_at = now() WHERE id = $1`,
    [rowId]
  );
}

/** Penghapusan di Vercel gagal: project tertua kembali 'active'. */
export async function revertVictim(rowId: string): Promise<void> {
  await getDatabase().query(`UPDATE ${TABLE} SET status = 'active' WHERE id = $1`, [rowId]);
}

/* ---------- Penghapusan manual dari menu admin ---------- */

/**
 * "done" = baris kini berstatus 'deleted' (Vercel sudah bersih atau tak pernah
 * punya project). "retry" = penghapusan di Vercel gagal, sapuan yang mengulang.
 */
export type DeleteOutcome = "done" | "retry";

export interface DeleteOneResult {
  name: string;
  outcome: DeleteOutcome;
}

/**
 * Hapus satu baris dari menu admin: tandai 'deleting', hapus project-nya di
 * Vercel, lalu tandai 'deleted'.
 *
 * Sengaja tidak memakai `revertVictim` saat Vercel menolak. Baris 'deleting'
 * masih memakai slot dan mengunci namanya (lihat LIVE_SQL), jadi niat hapus
 * tidak hilang diam-diam dan sapuan berikutnya bisa mengulanginya. Yang
 * membebaskan slot dan nama hanya status 'deleted'.
 */
export async function deleteOne(rowId: string): Promise<DeleteOneResult> {
  const found = await getDatabase().query<{
    name: string;
    status: DeployStatus;
    vercel_project_id: string | null;
  }>(`SELECT name, status, vercel_project_id FROM ${TABLE} WHERE id = $1`, [rowId]);

  const row = found.rows[0];
  if (!row) throw new AppError(404, "Baris tidak ditemukan.");
  if (row.status === "deleted") return { name: row.name, outcome: "done" };

  await getDatabase().query(`UPDATE ${TABLE} SET status = 'deleting' WHERE id = $1`, [rowId]);

  try {
    if (row.vercel_project_id) await deleteProject(row.vercel_project_id);
  } catch {
    return { name: row.name, outcome: "retry" };
  }

  await markDeleted(rowId);
  return { name: row.name, outcome: "done" };
}

/* ---------- Bacaan ---------- */

/** Jumlah slot terpakai. Pending basi tidak dihitung. */
export async function countLive(): Promise<number> {
  const result = await getDatabase().query<{ count: number }>(
    `SELECT count(*)::int AS count FROM ${TABLE} WHERE ${LIVE_SQL}`
  );
  return result.rows[0]?.count ?? 0;
}

/** Apakah nama dipakai baris hidup? Pending basi tidak menghalangi. */
export async function findLiveByName(name: string): Promise<boolean> {
  const result = await getDatabase().query(
    `SELECT 1 FROM ${TABLE} WHERE name = $1 AND ${LIVE_SQL} LIMIT 1`,
    [name]
  );
  return result.rows.length > 0;
}

/**
 * Project yang sedang hidup (termasuk yang sedang dihapus: selama barisnya
 * belum 'deleted', situsnya masih dilayani), terbaru lebih dulu. Dipakai
 * daftar publik di halaman depan.
 *
 * `name` ikut dibaca justru supaya bisa disamarkan di server lewat
 * `maskName`; nama aslinya tidak pernah sampai ke browser.
 */
export async function recentActive(limit = 20): Promise<ActiveRow[]> {
  const result = await getDatabase().query<ActiveRow>(
    `SELECT id, name, created_at FROM ${TABLE}
     WHERE status IN ('active','deleting')
     ORDER BY created_at DESC
     LIMIT ${Math.max(1, Math.floor(limit))}`
  );
  return result.rows;
}

/** Susun klausa WHERE untuk daftar admin. Murni, bisa dites tanpa database. */
export function adminFilter({ status, q }: AdminFilter): {
  clause: string;
  values: unknown[];
} {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (status) {
    values.push(status);
    conditions.push(`status = $${values.length}`);
  }
  const search = q?.trim();
  if (search) {
    values.push(`%${search}%`);
    conditions.push(`name ILIKE $${values.length}`);
  }
  return {
    clause: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    values,
  };
}

export async function listForAdmin(
  filter: AdminFilter & { limit?: number } = {}
): Promise<AdminList> {
  const { clause, values } = adminFilter(filter);
  const limit = Math.max(1, Math.floor(filter.limit ?? 100));

  const [rows, perStatus, matched] = await Promise.all([
    getDatabase().query<AdminRow>(
      `SELECT id, name, status, source_type, url, created_at, deleted_at
       FROM ${TABLE} ${clause}
       ORDER BY created_at DESC
       LIMIT ${limit}`,
      values
    ),
    getDatabase().query<{ status: DeployStatus; count: number }>(
      `SELECT status, count(*)::int AS count FROM ${TABLE} GROUP BY status`
    ),
    getDatabase().query<{ count: number }>(
      `SELECT count(*)::int AS count FROM ${TABLE} ${clause}`,
      values
    ),
  ]);

  const counts = Object.fromEntries(DEPLOY_STATUSES.map((key) => [key, 0])) as Record<
    DeployStatus,
    number
  >;
  for (const row of perStatus.rows) counts[row.status] = row.count;

  return {
    rows: rows.rows,
    counts,
    total: DEPLOY_STATUSES.reduce((sum, key) => sum + counts[key], 0),
    matched: matched.rows[0]?.count ?? 0,
  };
}

/* ---------- Janitor ---------- */

/**
 * Rapikan baris 'active' yang project-nya sudah tidak ada di Vercel.
 *
 * Project bisa hilang tanpa lewat aplikasi ini: dihapus dari dasbor Vercel,
 * atau dibersihkan pemilik akun saat merapikan. Tanpa pemeriksaan ini barisnya
 * tetap mengaku 'active' — halaman depan memajangnya sebagai "Sedang hidup",
 * slotnya terpakai, dan namanya terkunci walau situsnya sudah tak ada.
 *
 * Hanya 404 yang dianggap bukti. Jawaban lain dari Vercel (`null`) dibiarkan
 * apa adanya supaya nama tidak dibebaskan hanya karena API sedang tak bisa
 * dihubungi — kalau salah bebaskan, orang lain bisa memakai nama itu sementara
 * situs lamanya masih melayani.
 */
export async function reconcileGone(limit = MAX_PROJECTS): Promise<number> {
  const result = await getDatabase().query<{ id: string; vercel_project_id: string }>(
    `SELECT id, vercel_project_id FROM ${TABLE}
     WHERE status = 'active' AND vercel_project_id IS NOT NULL
     ORDER BY created_at ASC
     LIMIT ${Math.max(1, Math.floor(limit))}`
  );

  let gone = 0;
  // Dua belas permintaan sekaligus: cukup cepat untuk seluruh isi tabel (batas
  // slot adalah batas atasnya), tapi tidak membanjiri API Vercel.
  const CONCURRENCY = 12;
  for (let start = 0; start < result.rows.length; start += CONCURRENCY) {
    const batch = result.rows.slice(start, start + CONCURRENCY);
    const checks = await Promise.all(
      batch.map(async (row) => ((await projectExists(row.vercel_project_id)) === false ? row.id : null))
    );
    for (const id of checks) {
      if (!id) continue;
      await markDeleted(id);
      gone += 1;
    }
  }
  return gone;
}

/**
 * Sapuan manual (dipakai cron harian dan tombol admin):
 * pending basi ditandai failed, deleting yang menggantung diulang
 * penghapusannya di Vercel, baris yang project-nya sudah hilang dari Vercel
 * ditutup, dan jendela rate limit yang sudah kedaluwarsa dibuang supaya
 * tabelnya tidak menumpuk.
 */
export async function sweepStale(limit = 10): Promise<SweepResult> {
  await getDatabase().query(PRUNE_RATE_LIMITS_SQL);

  const failedResult = await getDatabase().query(FAIL_STALE_SQL);

  const pendingDeletions = await getDatabase().query<{ id: string; vercel_project_id: string | null }>(
    `SELECT id, vercel_project_id FROM ${TABLE}
     WHERE status = 'deleting'
     ORDER BY created_at ASC
     LIMIT ${Math.max(1, Math.floor(limit))}`
  );

  let deleted = 0;
  for (const row of pendingDeletions.rows) {
    try {
      if (row.vercel_project_id) {
        await deleteProject(row.vercel_project_id);
      }
      await markDeleted(row.id);
      deleted += 1;
    } catch {
      // Coba lagi pada sapuan berikutnya.
    }
  }

  // Setelah hapus-menggantung dirapikan, sisanya yang masih mengaku hidup.
  const gone = await reconcileGone();

  const remaining = await getDatabase().query<{ count: number }>(
    `SELECT count(*)::int AS count FROM ${TABLE} WHERE status = 'deleting'`
  );

  return {
    failed: failedResult.rowCount ?? 0,
    deleted,
    gone,
    remaining: remaining.rows[0]?.count ?? 0,
  };
}
