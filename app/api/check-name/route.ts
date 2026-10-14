import { NextRequest } from "next/server";
import { findLiveByName } from "@/lib/deployments";
import { NAME_TAKEN_MESSAGE, errorMessage } from "@/lib/errors";
import { validateName } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/check-name?name=...
 * Cek tabel deployments dulu, lalu heuristik DNS nama.vercel.app.
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
    // Database belum siap: lanjut ke cek DNS saja.
  }

  if (await resolvesVercelSubdomain(name)) {
    return Response.json({
      available: false,
      reason: "Subdomain ini sudah dipakai di Vercel. Coba nama lain.",
    });
  }
  return Response.json({ available: true });
}

async function resolvesVercelSubdomain(name: string): Promise<boolean> {
  try {
    const dns = await import("node:dns/promises");
    await dns.resolve(`${name}.vercel.app`);
    return true;
  } catch {
    return false;
  }
}
