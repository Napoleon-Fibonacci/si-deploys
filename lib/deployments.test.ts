import { afterEach, describe, expect, it, vi } from "vitest";
import { useDatabase, type QueryResult, type Queryable } from "./db";
import {
  NameTakenError,
  adminFilter,
  countLive,
  findLiveByName,
  listForAdmin,
  recentDeleted,
  reserveSlot,
  sweepStale,
} from "./deployments";

type Handler = (sql: string, params?: unknown[]) => { rows: unknown[]; rowCount?: number | null };

/** Adapter palsu: satu handler menentukan jawaban tiap kueri, kueri direkam. */
function fake(handler: Handler) {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const run = (sql: string, params?: unknown[]) => {
    queries.push({ sql, params });
    const out = handler(sql, params);
    return Promise.resolve({
      rows: out.rows,
      rowCount: out.rowCount ?? out.rows.length,
    } as QueryResult<never>);
  };
  const adapter = {
    query: run,
    connect: async () => ({ query: run, release: () => {} }),
  } as unknown as Queryable;
  return { adapter, queries };
}

afterEach(() => {
  useDatabase(null);
});

describe("adminFilter", () => {
  it("tanpa filter", () => {
    expect(adminFilter({})).toEqual({ clause: "", values: [] });
  });

  it("hanya status", () => {
    expect(adminFilter({ status: "active" })).toEqual({
      clause: "WHERE status = $1",
      values: ["active"],
    });
  });

  it("pencarian memakai pola LIKE dan spasi diabaikan", () => {
    expect(adminFilter({ q: "blog" })).toEqual({
      clause: "WHERE name ILIKE $1",
      values: ["%blog%"],
    });
    expect(adminFilter({ q: "   " })).toEqual({ clause: "", values: [] });
  });

  it("gabungan menjaga urutan parameter", () => {
    expect(adminFilter({ status: "failed", q: "a" })).toEqual({
      clause: "WHERE status = $1 AND name ILIKE $2",
      values: ["failed", "%a%"],
    });
  });
});

describe("countLive", () => {
  it("mengembalikan jumlah dan mengecualikan pending basi", async () => {
    const { adapter, queries } = fake(() => ({ rows: [{ count: 7 }] }));
    useDatabase(adapter);

    await expect(countLive()).resolves.toBe(7);
    expect(queries[0].sql).toContain("interval '600 seconds'");
    expect(queries[0].sql).toContain("status = 'pending'");
  });

  it("nol kalau tak ada baris", async () => {
    const { adapter } = fake(() => ({ rows: [] }));
    useDatabase(adapter);

    await expect(countLive()).resolves.toBe(0);
  });
});

describe("findLiveByName", () => {
  it("meneruskan nama sebagai parameter", async () => {
    const { adapter, queries } = fake(() => ({ rows: [{ found: 1 }] }));
    useDatabase(adapter);

    await expect(findLiveByName("blog")).resolves.toBe(true);
    expect(queries[0].params).toEqual(["blog"]);
  });

  it("false kalau tak ada baris hidup", async () => {
    const { adapter } = fake(() => ({ rows: [] }));
    useDatabase(adapter);

    await expect(findLiveByName("blog")).resolves.toBe(false);
  });
});

describe("recentDeleted", () => {
  it("membatasi limit minimal 1", async () => {
    const { adapter, queries } = fake(() => ({
      rows: [{ name: "a", deleted_at: "2026-01-01" }],
    }));
    useDatabase(adapter);

    await expect(recentDeleted(0)).resolves.toHaveLength(1);
    expect(queries[0].sql).toContain("LIMIT 1");
  });
});

describe("listForAdmin", () => {
  const handler: Handler = (sql) => {
    if (sql.includes("GROUP BY status")) {
      return {
        rows: [
          { status: "active", count: 3 },
          { status: "failed", count: 2 },
        ],
      };
    }
    if (sql.includes("LIMIT")) {
      return {
        rows: [
          {
            id: "1",
            name: "a",
            status: "active",
            source_type: "zip",
            url: null,
            created_at: "2026-01-01",
            deleted_at: null,
          },
        ],
      };
    }
    return { rows: [{ count: 9 }] };
  };

  it("mengisi semua status dengan nol lalu menimpa dari hitungan", async () => {
    const { adapter } = fake(handler);
    useDatabase(adapter);

    const list = await listForAdmin();
    expect(list.counts).toEqual({ pending: 0, active: 3, deleting: 0, deleted: 0, failed: 2 });
    expect(list.total).toBe(5);
    expect(list.matched).toBe(9);
    expect(list.rows).toHaveLength(1);
  });

  it("meneruskan filter yang sama ke kueri baris dan kueri hitung", async () => {
    const { adapter, queries } = fake(handler);
    useDatabase(adapter);

    await listForAdmin({ status: "failed", q: "a" });
    const filtered = queries.filter((entry) => entry.sql.includes("WHERE"));
    expect(filtered).toHaveLength(2);
    for (const entry of filtered) expect(entry.params).toEqual(["failed", "%a%"]);
  });
});

describe("reserveSlot", () => {
  it("menerjemahkan pelanggaran unique jadi NameTakenError", async () => {
    const { adapter, queries } = fake((sql) => {
      if (sql.startsWith("INSERT")) {
        throw Object.assign(new Error("duplicate key value"), { code: "23505" });
      }
      return { rows: [] };
    });
    useDatabase(adapter);

    await expect(reserveSlot("blog", "zip")).rejects.toBeInstanceOf(NameTakenError);
    expect(queries[0].sql).toBe("BEGIN");
    expect(queries.some((entry) => entry.sql === "ROLLBACK")).toBe(true);
  });

  it("mengembalikan rowId saat berhasil tanpa korban", async () => {
    const { adapter } = fake((sql) => {
      if (sql.includes("INSERT")) return { rows: [{ id: "row-1" }] };
      if (sql.includes("count(*)")) return { rows: [{ count: 3 }] };
      return { rows: [] };
    });
    useDatabase(adapter);

    await expect(reserveSlot("blog", "zip")).resolves.toEqual({ rowId: "row-1", victim: null });
  });

  it("memilih korban tertua saat slot penuh", async () => {
    const { adapter, queries } = fake((sql) => {
      if (sql.includes("INSERT")) return { rows: [{ id: "row-2" }] };
      if (sql.includes("count(*)")) return { rows: [{ count: 181 }] };
      if (sql.includes("RETURNING id, name")) {
        return { rows: [{ id: "old", name: "lama", vercelProjectId: "prj" }] };
      }
      return { rows: [] };
    });
    useDatabase(adapter);

    const result = await reserveSlot("blog", "zip");
    expect(result.victim).toEqual({ id: "old", name: "lama", vercelProjectId: "prj" });
    expect(queries.some((entry) => entry.sql === "COMMIT")).toBe(true);
  });
});

describe("sweepStale", () => {
  it("menandai pending basi dan menghapus yang menggantung", async () => {
    const { adapter, queries } = fake((sql) => {
      if (sql.startsWith("UPDATE deployments SET status = 'failed'")) {
        return { rows: [], rowCount: 2 };
      }
      if (sql.includes("SELECT id, vercel_project_id")) {
        return { rows: [{ id: "d1", vercel_project_id: null }] };
      }
      if (sql.includes("SET status = 'deleted'")) return { rows: [], rowCount: 1 };
      if (sql.includes("count(*)")) return { rows: [{ count: 0 }] };
      return { rows: [] };
    });
    useDatabase(adapter);

    await expect(sweepStale()).resolves.toEqual({ failed: 2, deleted: 1, remaining: 0 });
    expect(queries.some((entry) => entry.sql.includes("SET status = 'deleted'"))).toBe(true);
  });

  it("tetap lanjut walau penghapusan di Vercel gagal", async () => {
    vi.stubEnv("VERCEL_TOKEN", "");
    const { adapter, queries } = fake((sql) => {
      if (sql.startsWith("UPDATE deployments SET status = 'failed'")) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("SELECT id, vercel_project_id")) {
        return { rows: [{ id: "d1", vercel_project_id: "prj_1" }] };
      }
      if (sql.includes("count(*)")) return { rows: [{ count: 1 }] };
      return { rows: [] };
    });
    useDatabase(adapter);

    await expect(sweepStale()).resolves.toEqual({ failed: 0, deleted: 0, remaining: 1 });
    expect(queries.some((entry) => entry.sql.includes("SET status = 'deleted'"))).toBe(false);
    vi.unstubAllEnvs();
  });
});
