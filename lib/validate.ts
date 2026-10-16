import { AppError, type ErrorField } from "./errors";
import type { DeployFile } from "./sources";

export const MAX_NAME_LENGTH = 40;
export const MIN_NAME_LENGTH = 3;
export const MAX_FILES = 100;
export const MAX_ZIP_BYTES = 10 * 1024 * 1024; // 10 MB per ZIP
export const MAX_EXTRACTED_BYTES = 50 * 1024 * 1024; // 50 MB, anti zip bomb
export const MAX_PROJECTS = Number(process.env.MAX_PROJECTS ?? 180);

/** Pola nama project: huruf kecil, angka, tanda hubung. */
export const NAME_PATTERN = /^[a-z0-9-]+$/;

/** Aturan nama sebagai kalimat: satu rumah untuk teks UI dan pesan galat. */
export const NAME_RULE_TEXT = `Huruf kecil, angka, tanda hubung; ${MIN_NAME_LENGTH}–${MAX_NAME_LENGTH} karakter.`;

/** Tipe isi yang kita terima sebagai ZIP. */
export const ZIP_CONTENT_TYPES = ["application/zip", "application/x-zip-compressed"] as const;

/** Atribut accept untuk elemen input file. */
export const ZIP_ACCEPT = `.zip,${ZIP_CONTENT_TYPES.join(",")}`;

/** Nama berkas kandidat ZIP. Tipe MIME dari browser tak bisa dipercaya. */
export function isZipName(name: string): boolean {
  return name.toLowerCase().endsWith(".zip");
}

/** Satu rumah untuk pesan berkas yang bukan ZIP; dipakai UI dan klien deploy. */
export const ZIP_ONLY_MESSAGE = "Sumber ZIP harus berformat .zip.";

/** Nama berkas kandidat halaman HTML. */
export function isHtmlName(name: string): boolean {
  return /\.html?$/i.test(name);
}

/** Atribut accept untuk elemen input HTML tunggal. */
export const HTML_ACCEPT = ".html,.htm,text/html";

/** Versi tanpa lempar dari validateName, untuk gerbang klien. */
export function isValidName(value: unknown): boolean {
  return (
    typeof value === "string" &&
    value.length >= MIN_NAME_LENGTH &&
    value.length <= MAX_NAME_LENGTH &&
    NAME_PATTERN.test(value) &&
    !value.startsWith("-") &&
    !value.endsWith("-")
  );
}

export class ValidationError extends AppError {
  constructor(message: string, field: ErrorField = "source") {
    super(400, message, field);
    this.name = "ValidationError";
  }
}

/** Nama project: huruf kecil, angka, tanda hubung; 3-40 karakter; tanpa hubung di ujung. */
export function validateName(name: unknown): string {
  if (typeof name !== "string" || name.length === 0) {
    throw new ValidationError("Nama project wajib diisi.", "name");
  }
  if (!isValidName(name)) {
    throw new ValidationError(
      "Nama harus 3-40 karakter: huruf kecil, angka, tanda hubung, tanpa hubung di awal atau akhir.",
      "name"
    );
  }
  return name;
}

/** Tolak path berbahaya (../, path absolut, drive Windows). */
export function assertSafePath(path: string): void {
  const normalized = path.replace(/\\/g, "/");
  if (
    normalized.startsWith("/") ||
    normalized.includes("..") ||
    /^[a-zA-Z]:/.test(normalized) ||
    /(^|\/)\.\.?(\/|$)/.test(normalized)
  ) {
    throw new ValidationError(`Path tidak aman di file: ${path}`);
  }
}

const JUNK_NAMES = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

function isJunk(path: string): boolean {
  const segments = path.split("/");
  if (segments.includes("__MACOSX") || segments.includes(".git")) return true;
  return JUNK_NAMES.has(segments[segments.length - 1]);
}

/** Bersihkan dan periksa daftar file. Mengembalikan daftar yang sudah bersih. */
export function validateFiles(files: DeployFile[], sourceLabel: string): DeployFile[] {
  const cleaned = files.filter((file) => {
    const path = file.path.replace(/\\/g, "/");
    assertSafePath(path);
    return !isJunk(path) && file.data.length > 0;
  });
  if (cleaned.length === 0) {
    throw new ValidationError(`${sourceLabel} tidak berisi file.`);
  }
  ensureIndexHtml(cleaned);
  if (cleaned.length > MAX_FILES) {
    throw new ValidationError(
      `${sourceLabel} berisi ${cleaned.length} file. Maksimal ${MAX_FILES} file.`
    );
  }
  let total = 0;
  for (const file of cleaned) {
    total += file.data.length;
    if (total > MAX_EXTRACTED_BYTES) {
      throw new ValidationError(
        `Total isi file melebihi ${MAX_EXTRACTED_BYTES / 1024 / 1024} MB (anti zip bomb).`
      );
    }
  }
  for (const file of cleaned) {
    if (file.path.replace(/\\/g, "/") === "package.json") {
      try {
        const pkg = JSON.parse(new TextDecoder().decode(file.data));
        if (pkg.scripts?.build || pkg.scripts?.prebuild) {
          throw new ValidationError(
            "package.json punya skrip build. Deployer hanya menerima situs statis tanpa build."
          );
        }
      } catch (error) {
        if (error instanceof ValidationError) throw error;
        // package.json rusak: biarkan lewat.
      }
    }
  }
  return cleaned;
}

/**
 * Situs statis mustahil hidup tanpa index.html di root. Kalau root hanya punya
 * satu berkas HTML, salin berkas itu menjadi index.html supaya alamat utama
 * hidup tanpa mengubah nama aslinya. Selain itu, tolak dengan pesan jelas.
 */
function ensureIndexHtml(files: DeployFile[]): void {
  const paths = files.map((f) => f.path.replace(/\\/g, "/"));
  if (paths.includes("index.html")) return;
  if (paths.every((p) => p.startsWith("api/"))) return;

  const rootHtml = files.filter((file) => {
    const path = file.path.replace(/\\/g, "/");
    return !path.includes("/") && isHtmlName(path);
  });
  if (rootHtml.length === 1) {
    files.push({ path: "index.html", data: rootHtml[0].data });
    return;
  }
  throw new ValidationError(
    "index.html tidak ditemukan di root. Wajib ada index.html, kecuali situs hanya berisi folder api/."
  );
}
