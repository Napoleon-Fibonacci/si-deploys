import { NextRequest } from "next/server";
import { findLiveByName } from "@/lib/deployments";
import { NAME_TAKEN_MESSAGE, errorMessage } from "@/lib/errors";
import { validateName } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/check-name?name=...
 * Cek tabel deployments dulu, lalu heuristik HTTP nama.vercel.app.
 * Heuristik, bukan jaminan. Pengecekan final tetap di /api/deploy.
 */
export async function GET(request: NextRequest) {
  const name = new URL(request.url).searchParams.get("name") ?? "";
  try {
    validateName(name);
  } catch (error) {
    return Response.json({ available: false, reason: errorMessage(error) });
  }

  try {
    if (await findLiveByName(name)) {
      return Response.json({
        available: false,
        reason: NAME_TAKEN_MESSAGE,
      });
    }
  } catch {
    // Database belum siap: lanjut ke cek HTTP saja.
  }

  if (await isVercelNameTaken(name)) {
    return Response.json({
      available: false,
      reason: "Subdomain ini sudah dipakai di Vercel. Coba nama lain.",
    });
  }
  return Response.json({ available: true });
}

/**
 * Heuristik HTTP, bukan DNS: Vercel memasang wildcard `*.vercel.app`, jadi
 * setiap nama selalu "resolve" dan cek DNS akan menandai semua nama terpakai.
 *
 * Nama yang belum dipakai menjawab 404 dengan `x-vercel-error:
 * DEPLOYMENT_NOT_FOUND`. Nama terpakai menjawab hal lain: 200, atau 404
 * dengan `NOT_FOUND` bila project-nya ada tanpa deployment.
 */
async function isVercelNameTaken(name: string): Promise<boolean> {
  try {
    const response = await fetch(`https://${name}.vercel.app/`, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
    });
    return response.headers.get("x-vercel-error") !== "DEPLOYMENT_NOT_FOUND";
  } catch {
    // Tak bisa dihubungi: jangan blokir. Pengecekan final tetap di /api/deploy.
    return false;
  }
}
