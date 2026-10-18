import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { deleteOne } from "@/lib/deployments";
import { errorCode } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/delete — hapus satu project dari menu admin.
 *
 * POST, bukan GET: penghapusan tidak boleh ikut terpicu oleh prefetch atau
 * tautan yang tak sengaja diklik. Cookie sesi `sameSite=lax` juga berarti
 * permintaan dari situs lain tak membawa sesi, jadi tak ada yang bisa
 * memicu ini lintas origin.
 */
export async function POST(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.redirect(new URL("/admin/login", request.url), 303);
  }

  const form = await request.formData().catch(() => null);
  const id = typeof form?.get("id") === "string" ? String(form.get("id")) : "";

  let query = "?missing=1";
  if (id) {
    try {
      const result = await deleteOne(id);
      const key = result.outcome === "done" ? "removed" : "retry";
      query = `?${key}=${encodeURIComponent(result.name)}`;
    } catch (error) {
      query = errorCode(error) === 404 ? "?missing=1" : "?fail=1";
    }
  }

  return NextResponse.redirect(new URL(`/admin${query}`, request.url), 303);
}
