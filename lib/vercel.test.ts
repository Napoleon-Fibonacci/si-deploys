import { afterEach, describe, expect, it, vi } from "vitest";
import { VercelApiError, createDeployment, deleteProject, pickHost, projectExists } from "./vercel";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** Balas fetch per metode HTTP; satu respons boleh dipakai berulang. */
function stubApi(routes: Record<string, Response | Response[]>): ReturnType<typeof vi.fn> {
  const queue = new Map<string, Response[]>();
  for (const [method, value] of Object.entries(routes)) {
    queue.set(method, Array.isArray(value) ? [...value] : [value]);
  }
  const mock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const list = queue.get(method) ?? [];
    const next = list.length > 1 ? list.shift() : list[0];
    if (!next) throw new Error(`tak ada respons untuk ${method}`);
    // Klon: satu respons boleh dipakai berkali-kali, karena badan Response
    // hanya bisa dikonsumsi sekali.
    return next.clone();
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function ready(overrides: Record<string, unknown> = {}): Response {
  return json({
    id: "dpl_1",
    projectId: "prj_1",
    readyState: "READY",
    alias: [],
    url: "abc-9f3k2.vercel.app",
    ...overrides,
  });
}

const FILES = [{ path: "index.html", data: new TextEncoder().encode("<h1>hi</h1>") }];

/** Jawaban GET /v9/projects/{id}/domains. */
function domains(...names: string[]): Response {
  return json({ domains: names.map((name) => ({ name, gitBranch: null })) });
}

describe("pickHost", () => {
  it("mendahulukan host yang persis sama dengan nama project", () => {
    expect(pickHost(["abc-9f3k2-ditzs-projects.vercel.app", "abc.vercel.app"], "abc")).toBe(
      "abc.vercel.app"
    );
  });

  it("tanpa yang persis, ambil yang terpendek", () => {
    expect(pickHost(["abc-9f3k2-ditzs-projects.vercel.app", "abc.vercel.app"], "lain")).toBe(
      "abc.vercel.app"
    );
  });

  it("membuang alias branch dan bukan .vercel.app", () => {
    expect(pickHost(["abc-git-main-u.vercel.app", "situsku.id"], "abc")).toBeNull();
  });

  it("null kalau tak ada kandidat", () => {
    expect(pickHost([], "abc")).toBeNull();
  });
});

describe("createDeployment", () => {
  it("mengirim file sebagai base64 dengan encoding yang benar", async () => {
    vi.stubEnv("VERCEL_TOKEN", "tok");
    const mock = stubApi({
      POST: json({ id: "dpl_1" }),
      GET: [ready(), domains("abc.vercel.app")],
    });

    await createDeployment("abc", [
      ...FILES,
      { path: "assets\\a.css", data: new TextEncoder().encode("a{}") },
    ]);

    const [url, init] = mock.mock.calls[0] as [RequestInfo | URL, RequestInit];
    expect(String(url)).toBe(
      "https://api.vercel.com/v13/deployments?skipAutoDetectionConfirmation=1"
    );
    expect(init.method).toBe("POST");

    const body = JSON.parse(String(init.body)) as {
      name: string;
      target: string;
      projectSettings: { framework: null };
      files: Array<{ file: string; data: string; encoding: string }>;
    };
    expect(body.name).toBe("abc");
    expect(body.target).toBe("production");
    expect(body.projectSettings.framework).toBeNull();
    // `encoding` wajib: tanpanya Vercel membaca `data` sebagai teks utf-8.
    expect(body.files).toEqual([
      {
        file: "index.html",
        data: Buffer.from("<h1>hi</h1>").toString("base64"),
        encoding: "base64",
      },
      { file: "assets/a.css", data: Buffer.from("a{}").toString("base64"), encoding: "base64" },
    ]);
  });

  it("menambahkan teamId ke query kalau diset", async () => {
    vi.stubEnv("VERCEL_TOKEN", "tok");
    vi.stubEnv("VERCEL_TEAM_ID", "team_1");
    const mock = stubApi({
      POST: json({ id: "dpl_1" }),
      GET: [ready(), domains("abc.vercel.app")],
    });

    await createDeployment("abc", FILES);

    expect(String(mock.mock.calls[0][0])).toBe(
      "https://api.vercel.com/v13/deployments?skipAutoDetectionConfirmation=1&teamId=team_1"
    );
  });

  it("menunggu sampai status siap, lalu memakai alias persis", async () => {
    vi.stubEnv("VERCEL_TOKEN", "tok");
    stubApi({
      POST: json({ id: "dpl_1" }),
      GET: [
        json({ id: "dpl_1", projectId: "prj_1", readyState: "BUILDING" }),
        ready({ alias: ["abc.vercel.app", "abc-git-main-u.vercel.app"] }),
      ],
    });

    const result = await createDeployment("abc", FILES);

    expect(result).toEqual({
      projectId: "prj_1",
      deploymentId: "dpl_1",
      url: "https://abc.vercel.app",
      renamed: false,
    });
  });

  it("menandai rename saat Vercel memberi akhiran acak dan mengabaikan alias branch", async () => {
    vi.stubEnv("VERCEL_TOKEN", "tok");
    stubApi({
      POST: json({ id: "dpl_1" }),
      GET: ready({ alias: ["abc-9f3k2.vercel.app", "abc-git-main-u.vercel.app"] }),
    });

    const result = await createDeployment("abc", FILES);

    expect(result.url).toBe("https://abc-9f3k2.vercel.app");
    expect(result.renamed).toBe(true);
  });

  it("memakai domain project saat alias deployment masih kosong", async () => {
    vi.stubEnv("VERCEL_TOKEN", "tok");
    const mock = stubApi({
      POST: json({ id: "dpl_1" }),
      GET: [
        ready({
          alias: [],
          url: "abc-ditzs-projects-9f3k2.vercel.app",
        }),
        domains("abc.vercel.app"),
      ],
    });

    const result = await createDeployment("abc", FILES);

    expect(result.url).toBe("https://abc.vercel.app");
    expect(result.renamed).toBe(false);
    expect(String(mock.mock.calls.at(-1)?.[0])).toBe(
      "https://api.vercel.com/v9/projects/prj_1/domains?production=true"
    );
  });

  it("mengabaikan URL ber-hash walau ada di daftar alias", async () => {
    vi.stubEnv("VERCEL_TOKEN", "tok");
    stubApi({
      POST: json({ id: "dpl_1" }),
      GET: [
        ready({
          alias: ["abc-ditzs-projects-9f3k2.vercel.app"],
          url: "abc-ditzs-projects-9f3k2.vercel.app",
        }),
        domains("abc.vercel.app"),
      ],
    });

    const result = await createDeployment("abc", FILES);

    expect(result.url).toBe("https://abc.vercel.app");
  });

  it("jatuh ke URL deployment kalau tak ada domain sama sekali", async () => {
    vi.stubEnv("VERCEL_TOKEN", "tok");
    stubApi({
      POST: json({ id: "dpl_1" }),
      GET: [ready({ alias: [], url: "abc-9f3k2.vercel.app" }), domains()],
    });

    const result = await createDeployment("abc", FILES);

    expect(result.url).toBe("https://abc-9f3k2.vercel.app");
    expect(result.renamed).toBe(true);
  });

  it("gagal saat Vercel melaporkan ERROR", async () => {
    vi.stubEnv("VERCEL_TOKEN", "tok");
    stubApi({ POST: json({ id: "dpl_1" }), GET: ready({ readyState: "ERROR", projectId: "prj_1" }) });

    await expect(createDeployment("abc", FILES)).rejects.toBeInstanceOf(VercelApiError);
  });

  it("menyertakan pesan Vercel saat pembuatan ditolak", async () => {
    vi.stubEnv("VERCEL_TOKEN", "tok");
    stubApi({ POST: json({ error: { message: "Invalid token" } }, 403) });

    await expect(createDeployment("abc", FILES)).rejects.toThrow("Invalid token");
  });

  it("menolak jalan tanpa VERCEL_TOKEN", async () => {
    vi.stubEnv("VERCEL_TOKEN", "");
    stubApi({ POST: json({ id: "dpl_1" }) });

    await expect(createDeployment("abc", FILES)).rejects.toThrow("VERCEL_TOKEN belum diset");
  });
});

describe("deleteProject", () => {
  it("menganggap 204 sebagai sukses", async () => {
    vi.stubEnv("VERCEL_TOKEN", "tok");
    const mock = stubApi({ DELETE: new Response(null, { status: 204 }) });

    await expect(deleteProject("prj_1")).resolves.toBeUndefined();
    expect(String(mock.mock.calls[0][0])).toBe("https://api.vercel.com/v9/projects/prj_1");
    expect(mock.mock.calls[0][1]?.method).toBe("DELETE");
  });

  it("menganggap 404 sebagai sudah hilang", async () => {
    vi.stubEnv("VERCEL_TOKEN", "tok");
    stubApi({ DELETE: new Response(null, { status: 404 }) });

    await expect(deleteProject("prj_1")).resolves.toBeUndefined();
  });

  it("melempar saat penghapusan gagal", async () => {
    vi.stubEnv("VERCEL_TOKEN", "tok");
    stubApi({ DELETE: json({ error: { message: "boom" } }, 500) });

    await expect(deleteProject("prj_1")).rejects.toThrow("boom");
  });
});

describe("projectExists", () => {
  it("false kalau Vercel menjawab 404", async () => {
    vi.stubEnv("VERCEL_TOKEN", "tok");
    stubApi({ GET: json({ error: { message: "Not found" } }, 404) });

    await expect(projectExists("prj_1")).resolves.toBe(false);
  });

  it("true kalau project masih ada", async () => {
    vi.stubEnv("VERCEL_TOKEN", "tok");
    stubApi({ GET: json({ id: "prj_1", name: "abc" }) });

    await expect(projectExists("prj_1")).resolves.toBe(true);
  });

  it("null saat Vercel menjawab error lain, bukan 404", async () => {
    vi.stubEnv("VERCEL_TOKEN", "tok");
    stubApi({ GET: json({ error: { message: "rate limited" } }, 429) });

    await expect(projectExists("prj_1")).resolves.toBeNull();
  });

  it("null saat jaringan putus, supaya nama tidak dibebaskan", async () => {
    vi.stubEnv("VERCEL_TOKEN", "tok");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("jaringan putus");
      })
    );

    await expect(projectExists("prj_1")).resolves.toBeNull();
  });
});
