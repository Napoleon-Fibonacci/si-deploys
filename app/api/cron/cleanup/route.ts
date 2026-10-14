import { NextRequest } from "next/server";
import { sweepStale } from "@/lib/deployments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Pembersih berkala. Di Vercel Hobby cron hanya boleh
 * sekali sehari, jadi ini jaring pengaman saja: kebenaran soal pending basi
 * ada di lib/deployments.ts dan dipakai juga oleh tombol admin.
 * Dilindungi CRON_SECRET (diset otomatis oleh Vercel Cron).
 */
async function runCleanup(): Promise<Response> {
  const result = await sweepStale();
  return Response.json({ ok: true, ...result });
}

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest): Promise<Response> {
  if (!authorized(request)) {
    return Response.json({ error: "Tidak diizinkan." }, { status: 401 });
  }
  return runCleanup();
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!authorized(request)) {
    return Response.json({ error: "Tidak diizinkan." }, { status: 401 });
  }
  return runCleanup();
}
