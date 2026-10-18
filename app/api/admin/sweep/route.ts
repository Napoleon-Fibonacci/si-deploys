import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { sweepStale } from "@/lib/deployments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Sapuan menyisir seluruh isi tabel ke API Vercel, jadi beri ruang lebih. */
export const maxDuration = 60;

/**
 * POST /api/admin/sweep — jalankan sapuan manual dari menu admin.
 * Perlu karena cron di Vercel Hobby hanya boleh jalan sekali sehari,
 * jadi baris nyangkut perlu bisa dibersihkan kapan saja.
 */
export async function POST(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.redirect(new URL("/admin/login", request.url), 303);
  }

  let query = "?swept=0";
  try {
    const result = await sweepStale();
    query = `?swept=1&failed=${result.failed}&deleted=${result.deleted}&gone=${result.gone}`;
  } catch {
    query = "?swept=0";
  }
  return NextResponse.redirect(new URL(`/admin${query}`, request.url), 303);
}
