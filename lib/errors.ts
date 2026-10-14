/**
 * Satu rumah untuk makna error. Tiap error membawa kode HTTP dan field
 * formulir yang terdampak, jadi tak ada pemanggil yang perlu menebak dari
 * teks pesan (`message.startsWith("Nama")`) dan tak ada status yang disalin
 * ke beberapa route.
 *
 * Modul ini bebas impor runtime, jadi aman dipakai dari komponen klien.
 */

export type ErrorField = "name" | "source";

export class AppError extends Error {
  readonly code: number;
  readonly field: ErrorField;

  constructor(code: number, message: string, field: ErrorField = "source") {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.field = field;
  }
}

/** Kode HTTP untuk error apa pun. Kode error domain menang atas tebakan. */
export function errorCode(error: unknown): number {
  if (error instanceof AppError) return error.code;
  // Toleransi untuk error pihak ketiga yang hanya menempelkan properti status.
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" && Number.isFinite(status) ? status : 500;
}

/** Field formulir yang harus menyorot pesan ini. */
export function errorField(error: unknown): ErrorField {
  return error instanceof AppError ? error.field : "source";
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Terjadi kesalahan tak terduga.";
}

/** Satu-satunya tempat error jadi Response JSON. */
export function toErrorResponse(error: unknown): Response {
  return Response.json({ error: errorMessage(error) }, { status: errorCode(error) });
}

/** Dipakai NameTakenError dan fallback cek nama di klien: satu kalimat, satu rumah. */
export const NAME_TAKEN_MESSAGE = "Nama ini sudah dipakai. Coba nama lain.";
