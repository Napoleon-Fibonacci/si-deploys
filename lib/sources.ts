import { unzipSync } from "fflate";
import { MAX_ZIP_BYTES, ValidationError, validateFiles } from "./validate";

export interface DeployFile {
  path: string;
  data: Uint8Array;
}

const VERCEL_BLOB_HOST_SUFFIX = ".vercel-storage.com";

/** Normalisasi path: buang folder root arsip GitHub (repo-main/). */
export function stripRoot(files: DeployFile[]): DeployFile[] {
  const prefixes = new Set(
    files.map((f) => f.path.replace(/\\/g, "/").split("/")[0])
  );
  if (prefixes.size !== 1) return files;
  const only = [...prefixes][0];
  if (!only || files.every((f) => f.path.replace(/\\/g, "/") !== only)) {
    return files.map((file) => {
      const path = file.path.replace(/\\/g, "/");
      const rest = path.startsWith(`${only}/`) ? path.slice(only.length + 1) : path;
      return { path: rest, data: file.data };
    });
  }
  return files;
}

export async function fromZipBuffer(buffer: Uint8Array, label = "ZIP"): Promise<DeployFile[]> {
  if (buffer.byteLength > MAX_ZIP_BYTES) {
    throw new ValidationError(`${label} lebih dari ${MAX_ZIP_BYTES / 1024 / 1024} MB.`);
  }
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(buffer);
  } catch {
    throw new ValidationError(`${label} tidak bisa dibaca. Pastikan file berformat ZIP.`);
  }
  const files: DeployFile[] = [];
  for (const [path, data] of Object.entries(entries)) {
    if (path.endsWith("/")) continue; // entri folder
    files.push({ path, data });
  }
  return validateFiles(stripRoot(files), label);
}

export async function fromBlobUrl(blobUrl: string): Promise<DeployFile[]> {
  let host: string;
  try {
    host = new URL(blobUrl).hostname;
  } catch {
    throw new ValidationError("URL Blob tidak valid.");
  }
  if (!host.endsWith(VERCEL_BLOB_HOST_SUFFIX)) {
    throw new ValidationError("Sumber ZIP bukan dari penyimpanan yang diizinkan.");
  }
  const response = await fetch(blobUrl, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new ValidationError("Gagal mengambil ZIP dari penyimpanan sementara.");
  }
  const buffer = new Uint8Array(await response.arrayBuffer());
  return fromZipBuffer(buffer, "ZIP");
}

export async function fromGitHub(rawUrl: unknown): Promise<DeployFile[]> {
  let parsed: URL;
  try {
    parsed = new URL(typeof rawUrl === "string" ? rawUrl : "");
  } catch {
    throw new ValidationError("URL GitHub tidak valid.");
  }
  if (parsed.host !== "github.com") {
    throw new ValidationError("Hanya repo github.com yang didukung.");
  }
  const match = parsed.pathname.match(/^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/);
  if (!match) {
    throw new ValidationError(
      "URL repo tidak valid. Pakai bentuk github.com/user/repo."
    );
  }
  const [, owner, repo] = match;

  const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "si-deploy" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!repoResponse.ok) {
    throw new ValidationError("Repo tidak ditemukan atau privat.");
  }
  const repoInfo = (await repoResponse.json()) as { default_branch?: string };
  const branch = repoInfo.default_branch || "main";

  const archiveResponse = await fetch(
    `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${encodeURIComponent(branch)}`,
    { signal: AbortSignal.timeout(60_000) }
  );
  if (!archiveResponse.ok) {
    throw new ValidationError("Gagal mengunduh repo dari GitHub.");
  }
  const archive = new Uint8Array(await archiveResponse.arrayBuffer());
  return fromZipBuffer(archive, "Repo");
}
