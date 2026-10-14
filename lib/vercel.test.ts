import { afterEach, describe, expect, it, vi } from "vitest";
import { VercelApiError, createDeployment, deleteProject } from "./vercel";

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
    return next;
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

describe("createDeployment", () => {
  it("mengirim file sebagai base64 dengan encoding yang benar", async () => {
    vi.stubEnv("VERCEL_TOKEN", "tok");
    const mock = stubApi({ POST: json({ id: "dpl_1" }), GET: ready() });

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
    const mock = stubApi({ POST: json({ id: "dpl_1" }), GET: ready() });

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
