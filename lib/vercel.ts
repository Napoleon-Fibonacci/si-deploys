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
  const url =
    pickAliasUrl(final, name) ??
    (projectId ? await projectProductionUrl(projectId) : null) ??
    (final.url ? `https://${final.url}` : null);

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

/** Ambil alias bersih dari deployment. Hindari alias branch (berisi -git-). */
function pickAliasUrl(
  deployment: { alias?: string[]; url?: string },
  name: string
): string | null {
  const aliases = deployment.alias ?? [];
  const exact = aliases.find((alias) => alias === `${name}.vercel.app`);
  if (exact) return `https://${exact}`;
  const stable = aliases.find(
    (alias) => alias.endsWith(".vercel.app") && !alias.includes("-git-")
  );
  if (stable) return `https://${stable}`;
  return null;
}

/**
 * URL produksi milik project, dibaca dari `targets.production.alias`.
 *
 * Perlu karena deployment yang baru berstatus READY kadang belum membawa
 * alias apa pun. Saat itu satu-satunya URL di tangan adalah URL ber-hash
 * milik deployment itu, dan URL ber-hash dilindungi Vercel Authentication:
 * yang membukanya mendarat di dinding login Vercel, bukan di situsnya.
 */
async function projectProductionUrl(projectId: string): Promise<string | null> {
  const response = await fetch(`${API}/v9/projects/${encodeURIComponent(projectId)}${teamQuery()}`, {
    headers: headers(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) return null;
  const project = (await response.json()) as {
    targets?: { production?: { alias?: string[] } };
  };
  const aliases = project.targets?.production?.alias ?? [];
  const host = aliases.find((alias) => alias.endsWith(".vercel.app")) ?? aliases[0];
  return host ? `https://${host}` : null;
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
