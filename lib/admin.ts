import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Sesi admin sederhana tanpa dependensi:
 * - Password disimpan di env ADMIN_PASSWORD (server only).
 * - Cookie httpOnly berisi "exp.signature", ditandatangani HMAC-SHA256
 *   dengan password sebagai kunci. Ganti password = sesi lama batal.
 * - Tanpa ADMIN_PASSWORD, menu admin nonaktif sepenuhnya.
 */

export const ADMIN_COOKIE = "si_admin";
export const ADMIN_MAX_AGE = 60 * 60 * 12; // 12 jam

function adminPassword(): string | null {
  const value = process.env.ADMIN_PASSWORD;
  return value && value.length > 0 ? value : null;
}

export function adminEnabled(): boolean {
  return adminPassword() !== null;
}

/** Bandingkan password dengan waktu konstan agar tidak bocor lewat timing. */
export function checkPassword(input: string): boolean {
  const expected = adminPassword();
  if (!expected) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function signature(payload: string): string {
  const key = adminPassword() ?? "";
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function createToken(): string {
  const expires = Date.now() + ADMIN_MAX_AGE * 1000;
  const payload = String(expires);
  return `${payload}.${signature(payload)}`;
}

export function verifyToken(token: string | undefined): boolean {
  if (!token || !adminEnabled()) return false;
  const [payload, given] = token.split(".");
  if (!payload || !given) return false;
  const expected = signature(payload);
  if (given.length !== expected.length) return false;
  if (!timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return false;
  const expires = Number(payload);
  return Number.isFinite(expires) && expires > Date.now();
}

export async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get(ADMIN_COOKIE)?.value);
}
