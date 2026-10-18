import { NextRequest } from "next/server";
import { isAdmin } from "@/lib/admin";
import { sweepStale } from "@/lib/deployments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Pembersih berkala. Di Vercel Hobby cron hanya boleh
 * sekali sehari, jadi ini jaring pengaman saja: kebenaran soal pending basi
 * ada di lib/deployments.ts dan dipakai juga oleh tombol admin.
 *
 * Dua jalan masuk: sesi admin (untuk memicu manual) atau header
 * `Authorization: Bearer CRON_SECRET`. Vercel TIDAK membuat `CRON_SECRET`
 * sendiri; yang terjadi adalah sebaliknya — kalau env itu diisi, Vercel
 * menyertakan headernya saat memanggil cron. Karena itu endpoint ini
 * gagal-tertutup: tanpa secret, hanya sesi admin yang lolos. Sebelumnya
 * tanpa secret siapa pun bisa memicu sapuan berulang kali, dan tiap sapuan
 * menembak API Vercel.
 */
async function authorized(request: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") === `Bearer ${secret}`) return true;
  return isAdmin();
}

async function runCleanup(): Promise<Response> {
  const result = await sweepStale();
  return Response.json({ ok: true, ...result });
}

export async function GET(request: NextRequest): Promise<Response> {
  if (!(await authorized(request))) {
    return Response.json({ error: "Tidak diizinkan." }, { status: 401 });
  }
  return runCleanup();
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!(await authorized(request))) {
    return Response.json({ error: "Tidak diizinkan." }, { status: 401 });
  }
  return runCleanup();
}
