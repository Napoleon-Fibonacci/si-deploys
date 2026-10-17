import { getDatabase } from "./db";
import { AppError } from "./errors";

/**
 * Rate limit jendela tetap, per (scope, identitas). Satu tabel `rate_limits`
 * melayani semua kebijakan; tiap kebijakan punya jendela dan pesannya sendiri.
 *
 * Catatan: jendela tetap (bukan sliding) — ledakan tepat di batas jendela
 * masih mungkin. Untuk panel admin milik sendiri itu cukup.
 */

export interface RateLimitPolicy {
  /** Percobaan yang diizinkan per jendela. */
  max: number;
  windowMs: number;
  message: string;
}

export const RATE_LIMITS = {
  deploy: {
    max: 5,
    windowMs: 60 * 60 * 1000,
    message: "Terlalu banyak deploy. Coba lagi dalam satu jam.",
  },
  /**
   * Menerbitkan token unggah Blob. Scope sendiri, bukan warisan `deploy`:
   * satu percobaan deploy mengunggah ZIP dulu, jadi kalau keduanya berbagi
   * jatah, tiap percobaan memakan dua jatah dan tinggal 2,5 percobaan sejam.
   */
  upload: {
    max: 20,
    windowMs: 60 * 60 * 1000,
    message: "Terlalu banyak unggahan. Coba lagi dalam satu jam.",
  },
  adminLogin: {
    max: 10,
    windowMs: 15 * 60 * 1000,
    message: "Terlalu banyak percobaan masuk. Coba lagi nanti.",
  },
} as const satisfies Record<string, RateLimitPolicy>;

export type RateLimitScope = keyof typeof RATE_LIMITS;

export class RateLimitError extends AppError {
  constructor(message: string) {
    super(429, message);
    this.name = "RateLimitError";
  }
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Awal jendela tetap untuk satu kebijakan. Murni, bisa dites tanpa database. */
export function windowStartFor(scope: RateLimitScope, now = Date.now()): Date {
  const { windowMs } = RATE_LIMITS[scope];
  return new Date(Math.floor(now / windowMs) * windowMs);
}

/**
 * Catat satu percobaan dan lempar RateLimitError kalau sudah lewat batas.
 * Kegagalan database dilempar apa adanya: pemanggil yang memutuskan apakah
 * menolak (admin, gagal-tertutup) atau melaporkan galat (deploy).
 */
export async function enforceRateLimit(
  scope: RateLimitScope,
  identifier: string
): Promise<void> {
  const policy = RATE_LIMITS[scope];
  const result = await getDatabase().query<{ count: number }>(
    `INSERT INTO rate_limits (scope, ip, window_start, count)
     VALUES ($1, $2, $3, 1)
     ON CONFLICT (scope, ip, window_start)
     DO UPDATE SET count = rate_limits.count + 1
     RETURNING count`,
    [scope, identifier, windowStartFor(scope).toISOString()]
  );
  const count = result.rows[0]?.count ?? 0;
  if (count > policy.max) {
    throw new RateLimitError(policy.message);
  }
}
