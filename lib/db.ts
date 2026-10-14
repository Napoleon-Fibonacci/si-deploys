import { Pool } from "@neondatabase/serverless";

/**
 * Seam database: semua modul menyentuh database lewat `getDatabase()`,
 * sehingga satu adapter palsu cukup untuk menguji semuanya tanpa Neon.
 */

export interface QueryResult<T> {
  rows: T[];
  rowCount: number | null;
}

export interface QueryClient {
  query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<QueryResult<T>>;
  release(): void;
}

export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<QueryResult<T>>;
  connect(): Promise<QueryClient>;
}

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL tidak diset. Hubungkan Neon di Vercel.");
    }
    pool = new Pool({ connectionString, max: 5 });
  }
  return pool;
}

let adapter: Queryable | null = null;

/** Produksi memakai pool Neon; tes menyuntik adapter lain lewat sini. */
export function useDatabase(next: Queryable | null): void {
  adapter = next;
}

/** Adapter aktif. Produksi: pool Neon. Tes: apa pun yang disuntik di atas. */
export function getDatabase(): Queryable {
  return adapter ?? (getPool() as unknown as Queryable);
}
