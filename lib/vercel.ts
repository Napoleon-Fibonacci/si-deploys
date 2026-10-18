import { AppError } from "./errors";

const API = "https://api.vercel.com";

/** Kegagalan di sisi Vercel. `status` jadi kode HTTP-nya; default 502. */
export class VercelApiError extends AppError {
  constructor(message: string, status = 502) {
    super(status, message);
    this.name = "VercelApiError";
  }
}

function teamQuery(): string {
  const teamId = process.env.VERCEL_TEAM_ID;
  return teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
}

function headers(): HeadersInit {
  if (!process.env.VERCEL_TOKEN) {
    throw new VercelApiError("VERCEL_TOKEN belum diset di server.");
  }
  return {
    Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
    "Content-Type": "application/json",
  };
}

async function parseError(response: Response, fallback: string): Promise<VercelApiError> {
  let detail = "";
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    detail = body.error?.message ?? "";
  } catch {
    // respons bukan JSON
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  if (detail) {
    return new VercelApiError(`${fallback} (${detail})`, 502);
  }
  return new VercelApiError(fallback, 502);
}

export interface CreateDeploymentResult {
  projectId: string;
  deploymentId: string;
  url: string; // URL aktual, dengan https
  renamed: boolean; // true jika Vercel memberi akhiran acak
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Buat project + deployment produksi tanpa framework, lalu tunggu sampai siap. */
export async function createDeployment(
  name: string,
  files: Array<{ path: string; data: Uint8Array }>
): Promise<CreateDeploymentResult> {
  const body = {
    name,
    target: "production",
    projectSettings: { framework: null },
    files: files.map((file) => ({
      file: file.path.replace(/\\/g, "/"),
      data: Buffer.from(file.data).toString("base64"),
      // Wajib: tanpa ini Vercel membaca `data` sebagai teks utf-8, jadi isi
      // filenya berisi string base64, bukan file aslinya.
      encoding: "base64",
    })),
  };

  const createResponse = await fetch(
    `${API}/v13/deployments?skipAutoDetectionConfirmation=1${teamQuery().replace("?", "&")}`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    }
  );
  if (!createResponse.ok) {
    throw await parseError(createResponse, "Deploy gagal di sisi Vercel.");
  }
  const created = (await createResponse.json()) as {
    id: string;
    projectId?: string;
    url?: string;
  };

  const final = await pollDeployment(created.id);

  if (final.readyState === "ERROR" || final.readyState === "CANCELED") {
    throw new VercelApiError("Deploy gagal di sisi Vercel. Coba lagi sebentar lagi.");
  }

  const projectId = final.projectId;
  const url = await resolvePublicUrl(final, name);

  if (!url || !projectId) {
    throw new VercelApiError("Deploy gagal di sisi Vercel (URL tidak ditemukan).");
  }
  return {
    projectId,
    deploymentId: final.id,
    url,
    renamed: !url.startsWith(`https://${name}.vercel.app`),
  };
}

async function pollDeployment(
  deploymentId: string,
  timeoutMs = 55_000
): Promise<{
  id: string;
  projectId?: string;
  readyState: string;
  alias?: string[];
  url?: string;
}> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetch(`${API}/v13/deployments/${deploymentId}${teamQuery()}`, {
      headers: headers(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw await parseError(response, "Gagal membaca status deployment.");
    const data = (await response.json()) as {
      id: string;
      projectId?: string;
      readyState: string;
      alias?: string[];
      url?: string;
    };
    if (["READY", "ERROR", "CANCELED"].includes(data.readyState)) return data;
    await sleep(2_000);
  }
  throw new VercelApiError("Deploy belum selesai dalam batas waktu. Coba lagi nanti.", 504);
}

/** Berapa kali alias produksi dicek, dan jeda antar percobaan. */
const URL_TRIES = 2;
const URL_WAIT_MS = 1_500;

/**
 * Pilih host yang layak dibagikan.
 *
 * Cocok persis dengan nama project lebih dulu, lalu host terpendek. Alias
 * branch (`-git-`) dibuang karena itu alamat preview. URL milik deployment itu
 * sendiri juga tidak pernah masuk daftar kandidat: bentuknya
 * `nama-tim-hash.vercel.app` dan dilindungi Vercel Authentication, jadi yang
 * membukanya mendarat di dinding login Vercel.
 */
export function pickHost(hosts: string[], name: string): string | null {
  const clean = hosts.filter((host) => host.endsWith(".vercel.app") && !host.includes("-git-"));
  const exact = clean.find((host) => host === `${name}.vercel.app`);
  if (exact) return exact;
  return [...clean].sort((a, b) => a.length - b.length)[0] ?? null;
}

/** Ambil JSON dari API Vercel. `null` kalau gagal, supaya pemanggil bisa coba sumber lain. */
async function getJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${API}${path}`, {
      headers: headers(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Semua kandidat host produksi, dari tiga tempat Vercel menyimpannya:
 * alias deployment, `targets.production.alias` milik project, dan daftar
 * domain project (difilter ke domain produksi saja). Ketiganya bisa kosong
 * sesaat setelah status READY, jadi yang pertama terisi yang menang.
 */
async function productionHosts(
  deployment: { id: string; alias?: string[] },
  projectId?: string
): Promise<string[]> {
  const [fresh, project, domains] = await Promise.all([
    getJson<{ alias?: string[] }>(
      `/v13/deployments/${encodeURIComponent(deployment.id)}${teamQuery()}`
    ),
    projectId
      ? getJson<{ targets?: { production?: { alias?: string[] } } }>(
          `/v9/projects/${encodeURIComponent(projectId)}${teamQuery()}`
        )
      : null,
    projectId
      ? getJson<{ domains?: Array<{ name?: string; gitBranch?: string | null }> }>(
          // `production=true` menyaring domain preview dan alias branch.
          `/v9/projects/${encodeURIComponent(projectId)}/domains?production=true${teamQuery().replace("?", "&")}`
        )
      : null,
  ]);

  return [
    // Dua-duanya ikut: kalau ambil ulang gagal, data lama tetap terpakai.
    ...(deployment.alias ?? []),
    ...(fresh?.alias ?? []),
    ...(project?.targets?.production?.alias ?? []),
    ...(domains?.domains ?? [])
      .filter((domain) => domain.name && !domain.gitBranch)
      .map((domain) => domain.name as string),
  ];
}

/**
 * URL hasil deploy.
 *
 * Dicoba lebih dari sekali karena alias produksi kadang baru terpasang
 * beberapa detik setelah status READY; sekali cek bisa mendapat daftar kosong
 * dan jatuh ke URL ber-hash. `url` milik deployment hanya dipakai kalau semua
 * sumber benar-benar tidak memberi apa pun — URL itu dilindungi Vercel
 * Authentication, jadi yang membukanya mendarat di dinding login Vercel.
 */
async function resolvePublicUrl(
  deployment: { id: string; projectId?: string; alias?: string[]; url?: string },
  name: string
): Promise<string | null> {
  for (let attempt = 0; attempt < URL_TRIES; attempt++) {
    const host = pickHost(await productionHosts(deployment, deployment.projectId), name);
    if (host) return `https://${host}`;
    if (attempt < URL_TRIES - 1) await sleep(URL_WAIT_MS);
  }
  return deployment.url ? `https://${deployment.url}` : null;
}

/** Hapus project di Vercel berdasarkan vercel_project_id dari database. 404 = sudah hilang. */
export async function deleteProject(projectId: string): Promise<void> {
  const response = await fetch(
    `${API}/v9/projects/${encodeURIComponent(projectId)}${teamQuery()}`,
    {
      method: "DELETE",
      headers: headers(),
      signal: AbortSignal.timeout(30_000),
    }
  );
  if (response.ok || response.status === 404) return;
  throw await parseError(response, "Gagal menghapus project lama di Vercel.");
}
