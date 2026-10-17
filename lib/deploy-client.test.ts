import { unzipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkName,
  pastedPick,
  prepareSource,
  startDeploy,
  toZipFile,
  type DeployFailure,
  type DeployInput,
  type Picked,
} from "./deploy-client";
import { MAX_FILES, MAX_ZIP_BYTES, ValidationError } from "./validate";

// Unggahan Blob adalah jaringan; tesnya cukup memastikan ZIP sampai ke sana.
vi.mock("@vercel/blob/client", () => ({
  upload: vi.fn(async (name: string) => ({ url: `https://blob.example/${name}` })),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

function entry(path: string, content = "x"): { path: string; file: File } {
  return { path, file: new File([content], path) };
}

function folder(...entries: Array<{ path: string; file: File }>): Picked {
  return { kind: "folder", entries };
}

function ndjson(...events: unknown[]): string {
  return events.map((event) => `${JSON.stringify(event)}\n`).join("");
}

/** Balas fetch dengan aliran berisi potongan-potongan NDJSON. */
function respondWith(chunks: string[], status = 200): void {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status })));
}

const GITHUB_INPUT: DeployInput = {
  name: "abc",
  tab: "github",
  githubUrl: "https://github.com/u/r",
  pick: null,
};

describe("toZipFile", () => {
  it("menolak pilihan yang kosong", async () => {
    await expect(toZipFile(null)).rejects.toBeInstanceOf(ValidationError);
  });

  it("meneruskan ZIP apa adanya kalau di bawah batas", async () => {
    const zip = new File([new Uint8Array([1, 2, 3])], "site.zip");
    await expect(toZipFile({ kind: "zip", file: zip })).resolves.toBe(zip);
  });

  it("menolak ZIP yang melebihi batas", async () => {
    const zip = new File([new Uint8Array(MAX_ZIP_BYTES + 1)], "besar.zip");
    await expect(toZipFile({ kind: "zip", file: zip })).rejects.toThrow(/10 MB/);
  });

  it("menolak berkas yang bukan .zip", async () => {
    const html = new File(["<h1>hai</h1>"], "halaman.html", { type: "text/html" });
    await expect(toZipFile({ kind: "zip", file: html })).rejects.toThrow(/\.zip/);
  });

  it("membungkus kode yang ditempel jadi satu index.html", () => {
    expect(pastedPick("<h1>hai</h1>")).toEqual({
      kind: "folder",
      entries: [{ path: "index.html", file: expect.any(File) }],
    });
  });

  it("kode tempel jadi ZIP berisi index.html", async () => {
    const zip = await toZipFile(pastedPick("<h1>hai</h1>"));
    const entries = unzipSync(new Uint8Array(await zip.arrayBuffer()));
    expect(Object.keys(entries)).toEqual(["index.html"]);
    expect(new TextDecoder().decode(entries["index.html"])).toBe("<h1>hai</h1>");
  });

  it("menolak folder dengan terlalu banyak file", async () => {
    const entries = [entry("index.html")];
    for (let index = 0; index < MAX_FILES; index += 1) entries.push(entry(`f${index}.css`));
    await expect(toZipFile(folder(...entries))).rejects.toThrow(/100 file/);
  });

  it("menolak folder yang total isinya melebihi batas", async () => {
    const big = entry("big.bin", "x".repeat(MAX_ZIP_BYTES + 1));
    await expect(toZipFile(folder(entry("index.html"), big))).rejects.toThrow(/melebihi 10 MB/);
  });

  it("membungkus folder jadi satu ZIP dengan path yang sama", async () => {
    const output = await toZipFile(
      folder(entry("index.html", "<h1>hi</h1>"), entry("assets/a.css", "a{}"))
    );
    expect(output.name).toBe("folder.zip");
    expect(output.type).toBe("application/zip");

    const entries = unzipSync(new Uint8Array(await output.arrayBuffer()));
    expect(Object.keys(entries).sort()).toEqual(["assets/a.css", "index.html"]);
    expect(new TextDecoder().decode(entries["index.html"])).toBe("<h1>hi</h1>");
  });
});

describe("prepareSource", () => {
  it("memangkas spasi di URL GitHub", async () => {
    await expect(
      prepareSource({ ...GITHUB_INPUT, githubUrl: "  https://github.com/u/r  " })
    ).resolves.toEqual({ type: "github", url: "https://github.com/u/r" });
  });

  it("mengunggah ZIP ke Blob dan memakai URL kembaliannya", async () => {
    const zip = new File([new Uint8Array([1])], "site.zip");
    await expect(
      prepareSource({ ...GITHUB_INPUT, tab: "zip", githubUrl: "", pick: { kind: "zip", file: zip } })
    ).resolves.toEqual({ type: "zip", blobUrl: "https://blob.example/site.zip" });
  });
});

describe("checkName", () => {
  it("meng-encode nama dan mengembalikan hasilnya", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ available: false, reason: "dipakai" }))
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkName("a b")).resolves.toEqual({ available: false, reason: "dipakai" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/check-name?name=a%20b",
      expect.anything()
    );
  });
});

describe("startDeploy", () => {
  it("menyebarkan tahap lalu hasil akhir", async () => {
    respondWith([
      ndjson({ type: "stage", stage: "files" }, { type: "stage", stage: "create" }),
      ndjson({ type: "done", url: "https://abc.vercel.app", renamed: false }),
    ]);

    const stages: string[] = [];
    const done: Array<{ url: string; renamed: boolean }> = [];
    await startDeploy(GITHUB_INPUT, {
      onStage: (stage) => stages.push(stage),
      onDone: (result) => done.push(result),
    });

    expect(stages).toEqual(["files", "create"]);
    expect(done).toEqual([{ url: "https://abc.vercel.app", renamed: false }]);
  });

  it("menyambung event yang terbelah antar potongan", async () => {
    const payload = ndjson({ type: "done", url: "https://abc.vercel.app", renamed: true });
    respondWith([payload.slice(0, 10), payload.slice(10)]);

    const done: Array<{ url: string; renamed: boolean }> = [];
    await startDeploy(GITHUB_INPUT, { onDone: (result) => done.push(result) });

    expect(done).toEqual([{ url: "https://abc.vercel.app", renamed: true }]);
  });

  it("meneruskan field formulir dari event error", async () => {
    respondWith([ndjson({ type: "error", code: 409, message: "dipakai", field: "name" })]);

    const failures: DeployFailure[] = [];
    await startDeploy(GITHUB_INPUT, { onError: (failure) => failures.push(failure) });

    expect(failures).toEqual([{ message: "dipakai", field: "name" }]);
  });

  it("memakai pesan dari respons non-ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "Nama sudah dipakai." }), { status: 409 })
      )
    );

    const failures: DeployFailure[] = [];
    await startDeploy(GITHUB_INPUT, { onError: (failure) => failures.push(failure) });

    expect(failures).toEqual([{ message: "Nama sudah dipakai.", field: "source" }]);
  });

  it("melaporkan koneksi terputus kalau aliran habis tanpa penutup", async () => {
    respondWith([ndjson({ type: "stage", stage: "files" })]);

    const failures: DeployFailure[] = [];
    await startDeploy(GITHUB_INPUT, { onError: (failure) => failures.push(failure) });

    expect(failures[0].message).toMatch(/Koneksi terputus/);
  });

  it("mengabaikan baris rusak dan tahap yang tidak dikenal", async () => {
    respondWith([
      `{bukan json}\n${ndjson({ type: "stage", stage: "upload" }, { type: "done", url: "u", renamed: false })}`,
    ]);

    const stages: string[] = [];
    const done: Array<{ url: string; renamed: boolean }> = [];
    await startDeploy(GITHUB_INPUT, {
      onStage: (stage) => stages.push(stage),
      onDone: (result) => done.push(result),
    });

    expect(stages).toEqual([]);
    expect(done).toEqual([{ url: "u", renamed: false }]);
  });

  it("melaporkan kegagalan penyiapan sumber tanpa menyentuh jaringan", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const failures: DeployFailure[] = [];
    await startDeploy(
      { ...GITHUB_INPUT, tab: "zip", githubUrl: "", pick: null },
      { onError: (failure) => failures.push(failure) }
    );

    expect(failures[0].message).toMatch(/Pilih file ZIP/);
    expect(failures[0].field).toBe("source");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
