import { afterEach, describe, expect, it } from "vitest";
import { useDatabase, type Queryable } from "./db";
import {
  RATE_LIMITS,
  RateLimitError,
  enforceRateLimit,
  getClientIp,
  windowStartFor,
} from "./ratelimit";

/**
 * Adapter palsu yang meniru `INSERT ... ON CONFLICT` pada tabel rate_limits:
 * satu penghitung per (scope, IP, jendela). Jadi tesnya menguji kenaikan
 * sungguhan, bukan sekadar bentuk SQL-nya.
 */
function fakeCounter(): {
  adapter: Queryable;
  calls: Array<{ sql: string; values: unknown[] }>;
} {
  const counters = new Map<string, number>();
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const adapter = {
    async query(sql: string, values: unknown[] = []) {
      calls.push({ sql, values });
      const [scope, ip, windowStart] = values as [string, string, string];
      const key = `${scope}|${ip}|${windowStart}`;
      const count = (counters.get(key) ?? 0) + 1;
      counters.set(key, count);
      return { rows: [{ count }], rowCount: 1 };
    },
    async connect(): Promise<never> {
      throw new Error("connect tidak dipakai di tes ini");
    },
  } as unknown as Queryable;
  return { adapter, calls };
}

afterEach(() => {
  useDatabase(null);
});

describe("windowStartFor", () => {
  it("membulatkan awal jendela sesuai kebijakan scope", () => {
    const now = 1_700_000_000_000;

    for (const [scope, policy] of Object.entries(RATE_LIMITS)) {
      const start = windowStartFor(scope as keyof typeof RATE_LIMITS, now).getTime();
      expect(start % policy.windowMs, scope).toBe(0);
      expect(start, scope).toBeLessThanOrEqual(now);
      expect(now - start, scope).toBeLessThan(policy.windowMs);
    }
  });
});

describe("enforceRateLimit", () => {
  it("mengizinkan sampai batas, lalu melempar", async () => {
    const { adapter } = fakeCounter();
    useDatabase(adapter);
    const ip = "1.2.3.4";

    for (let attempt = 0; attempt < RATE_LIMITS.deploy.max; attempt += 1) {
      await expect(enforceRateLimit("deploy", ip)).resolves.toBeUndefined();
    }
    await expect(enforceRateLimit("deploy", ip)).rejects.toBeInstanceOf(RateLimitError);
  });

  it("memisahkan kuota antar scope untuk IP yang sama", async () => {
    const { adapter } = fakeCounter();
    useDatabase(adapter);
    const ip = "1.2.3.4";

    for (let attempt = 0; attempt < RATE_LIMITS.deploy.max; attempt += 1) {
      await enforceRateLimit("deploy", ip);
    }
    await expect(enforceRateLimit("deploy", ip)).rejects.toBeInstanceOf(RateLimitError);

    // Kuota percobaan masuk admin tak terpengaruh kuota deploy.
    await expect(enforceRateLimit("adminLogin", ip)).resolves.toBeUndefined();
  });

  it("memisahkan kuota antar IP", async () => {
    const { adapter } = fakeCounter();
    useDatabase(adapter);

    for (let attempt = 0; attempt <= RATE_LIMITS.adminLogin.max; attempt += 1) {
      await enforceRateLimit("adminLogin", "10.0.0.1").catch(() => undefined);
    }
    await expect(enforceRateLimit("adminLogin", "10.0.0.2")).resolves.toBeUndefined();
  });

  it("memakai pesan milik scope saat batas terlampaui", async () => {
    const { adapter } = fakeCounter();
    useDatabase(adapter);

    let caught: unknown;
    for (let attempt = 0; attempt <= RATE_LIMITS.adminLogin.max; attempt += 1) {
      try {
        await enforceRateLimit("adminLogin", "5.5.5.5");
      } catch (error) {
        caught = error;
        break;
      }
    }

    expect(caught).toBeInstanceOf(RateLimitError);
    expect((caught as RateLimitError).message).toBe(RATE_LIMITS.adminLogin.message);
    expect((caught as RateLimitError).message).not.toBe(RATE_LIMITS.deploy.message);
  });

  it("mengirim scope dan awal jendela ke database", async () => {
    const { adapter, calls } = fakeCounter();
    useDatabase(adapter);

    await enforceRateLimit("adminLogin", "9.9.9.9");

    expect(calls).toHaveLength(1);
    expect(calls[0].values).toEqual([
      "adminLogin",
      "9.9.9.9",
      windowStartFor("adminLogin").toISOString(),
    ]);
  });

  it("melempar galat database apa adanya, bukan RateLimitError", async () => {
    useDatabase({
      async query(): Promise<never> {
        throw new Error("Neon mati");
      },
      async connect(): Promise<never> {
        throw new Error("Neon mati");
      },
    } as unknown as Queryable);

    await expect(enforceRateLimit("adminLogin", "1.1.1.1")).rejects.toThrow("Neon mati");
  });
});

describe("getClientIp", () => {
  it("mengambil IP pertama dari x-forwarded-for", () => {
    const request = new Request("https://si-deploy.test", {
      headers: { "x-forwarded-for": "1.1.1.1, 2.2.2.2" },
    });
    expect(getClientIp(request)).toBe("1.1.1.1");
  });

  it("turun ke x-real-ip lalu 'unknown'", () => {
    expect(
      getClientIp(new Request("https://si-deploy.test", { headers: { "x-real-ip": "3.3.3.3" } }))
    ).toBe("3.3.3.3");
    expect(getClientIp(new Request("https://si-deploy.test"))).toBe("unknown");
  });
});
