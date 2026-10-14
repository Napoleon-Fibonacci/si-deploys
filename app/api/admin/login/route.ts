import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  ADMIN_MAX_AGE,
  adminEnabled,
  checkPassword,
  createToken,
} from "@/lib/admin";
import { RateLimitError, enforceRateLimit, getClientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/login — form biasa (tanpa JS). Password benar = set cookie
 * sesi httpOnly lalu redirect ke /admin; salah = kembali ke form dengan error.
 *
 * Percobaan dibatasi per IP SEBELUM password diperiksa, jadi tebakan salah pun
 * terhitung dan tebakan yang benar tetap memakai jatah.
 *
 * Kalau database tak bisa dihubungi, login DITOLAK (gagal-tertutup): tanpa
 * penghitung, tak ada proteksi tebak-tebakan. Menu admin butuh database juga,
 * jadi menolak di sini tak menghilangkan apa pun.
 */
export async function POST(request: NextRequest) {
  if (!adminEnabled()) {
    return NextResponse.redirect(new URL("/admin/login?error=off", request.url), 303);
  }

  try {
    await enforceRateLimit("adminLogin", getClientIp(request));
  } catch (error) {
    const code = error instanceof RateLimitError ? "limit" : "db";
    return NextResponse.redirect(new URL(`/admin/login?error=${code}`, request.url), 303);
  }

  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  if (!checkPassword(password)) {
    return NextResponse.redirect(new URL("/admin/login?error=1", request.url), 303);
  }

  const response = NextResponse.redirect(new URL("/admin", request.url), 303);
  response.cookies.set(ADMIN_COOKIE, createToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_MAX_AGE,
  });
  return response;
}
