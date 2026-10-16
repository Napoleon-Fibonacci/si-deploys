import { zipSync } from "fflate";
import {
  decodeEvents,
  type DeployEvent,
  type DeploySource,
  type DeployStage,
  type SourceType,
} from "./deploy-protocol";
import { errorField, errorMessage, type ErrorField } from "./errors";
import { MAX_FILES, MAX_ZIP_BYTES, ValidationError, ZIP_ONLY_MESSAGE, isZipName } from "./validate";

/**
 * Sisi klien dari alur deploy, tanpa React. Komponen hanya berlangganan
 * handler dan merender; semua urutan, batas, dan bentuk permintaan ada di sini
 * sehingga bisa dipanggil dan diuji tanpa merender apa pun.
 */

export const DEPLOY_ENDPOINT = "/api/deploy";
export const CHECK_NAME_ENDPOINT = "/api/check-name";
export const UPLOAD_HANDLER_ENDPOINT = "/api/upload";
export const NAME_CHECK_DEBOUNCE_MS = 500;

const DEPLOY_TIMEOUT_MS = 120_000;
const CHECK_TIMEOUT_MS = 10_000;
const DROPPED_MESSAGE = "Koneksi terputus saat deploy. Coba lagi.";
const GENERIC_MESSAGE = "Terjadi kesalahan tak terduga.";

export interface PickedFile {
  path: string;
  file: File;
}

export type Picked =
  | { kind: "zip"; file: File }
  | { kind: "folder"; entries: PickedFile[] };

export interface DeployInput {
  name: string;
  tab: SourceType;
  githubUrl: string;
  pick: Picked | null;
}

export interface NameCheckResult {
  available: boolean;
  reason?: string;
}

/** Kegagalan yang ditampilkan ke pengguna. Kode HTTP tak dipakai di UI. */
export interface DeployFailure {
  message: string;
  field: ErrorField;
}

export interface DeployHandlers {
  onStage?: (stage: DeployStage) => void;
  onDone?: (result: { url: string; renamed: boolean }) => void;
  onError?: (failure: DeployFailure) => void;
}

function failure(error: unknown): DeployFailure {
  return { message: errorMessage(error), field: errorField(error) };
}

/** Cek ketersediaan nama (debounce-nya urusan pemanggil). */
export async function checkName(name: string): Promise<NameCheckResult> {
  const response = await fetch(`${CHECK_NAME_ENDPOINT}?name=${encodeURIComponent(name)}`, {
    signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
  });
  return (await response.json()) as NameCheckResult;
}

/**
 * Validasi lokal lalu bungkus jadi satu File ZIP.
 * Batasnya sama dengan yang dipakai server karena keduanya dari lib/validate.ts.
 */
export async function toZipFile(pick: Picked | null): Promise<File> {
  if (!pick) {
    throw new ValidationError("Pilih file ZIP atau folder dulu.");
  }
  if (pick.kind === "zip") {
    if (!isZipName(pick.file.name)) {
      throw new ValidationError(ZIP_ONLY_MESSAGE);
    }
    if (pick.file.size > MAX_ZIP_BYTES) {
      throw new ValidationError(`ZIP lebih dari ${MAX_ZIP_BYTES / 1024 / 1024} MB.`);
    }
    return pick.file;
  }
  if (pick.entries.length > MAX_FILES) {
    throw new ValidationError(`Folder berisi lebih dari ${MAX_FILES} file.`);
  }
  const entries: Record<string, Uint8Array> = {};
  let total = 0;
  for (const entry of pick.entries) {
    total += entry.file.size;
    if (total > MAX_ZIP_BYTES) {
      throw new ValidationError(`Isi folder melebihi ${MAX_ZIP_BYTES / 1024 / 1024} MB.`);
    }
    entries[entry.path] = new Uint8Array(await entry.file.arrayBuffer());
  }
  return new File([zipSync(entries)], "folder.zip", { type: "application/zip" });
}

/** Siapkan `source` untuk /api/deploy: URL GitHub apa adanya, atau ZIP ke Blob. */
export async function prepareSource(input: DeployInput): Promise<DeploySource> {
  if (input.tab === "github") {
    return { type: "github", url: input.githubUrl.trim() };
  }
  const file = await toZipFile(input.pick);
  // Impor dinamis supaya modul ini tetap bisa diimpor Node saat tes.
  const { upload } = await import("@vercel/blob/client");
  const uploaded = await upload(file.name, file, {
    access: "public",
    // Tipe ditulis eksplisit: sebagian browser memberi File.type kosong untuk
    // ZIP, dan Blob menolak unggahan yang tipe isinya bukan ZIP.
    contentType: "application/zip",
    handleUploadUrl: UPLOAD_HANDLER_ENDPOINT,
  });
  return { type: "zip", blobUrl: uploaded.url };
}

/**
 * Jalankan deploy sampai selesai. Tak mengembalikan nilai: hasilnya lewat
 * handler, jadi pemanggil tak perlu membedah aliran NDJSON sendiri.
 */
export async function startDeploy(
  input: DeployInput,
  handlers: DeployHandlers = {},
  signal?: AbortSignal
): Promise<void> {
  try {
    const source = await prepareSource(input);
    const response = await fetch(DEPLOY_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: input.name, source }),
      signal: signal ?? AbortSignal.timeout(DEPLOY_TIMEOUT_MS),
    });

    if (!response.ok || !response.body) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      handlers.onError?.({ message: payload?.error ?? GENERIC_MESSAGE, field: "source" });
      return;
    }

    const finished = await streamEvents(response.body, handlers);
    if (!finished) {
      handlers.onError?.({ message: DROPPED_MESSAGE, field: "source" });
    }
  } catch (error) {
    handlers.onError?.(failure(error));
  }
}

/** Baca aliran NDJSON dan sebarkan tiap event. true kalau ada event penutup. */
async function streamEvents(
  body: ReadableStream<Uint8Array>,
  handlers: DeployHandlers
): Promise<boolean> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;

  while (!finished) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = decodeEvents(buffer);
    buffer = rest;
    for (const event of events) {
      finished = dispatch(event, handlers) || finished;
      if (finished) break;
    }
  }
  return finished;
}

function dispatch(event: DeployEvent, handlers: DeployHandlers): boolean {
  if (event.type === "stage") {
    handlers.onStage?.(event.stage);
    return false;
  }
  if (event.type === "done") {
    handlers.onDone?.({ url: event.url, renamed: event.renamed });
    return true;
  }
  handlers.onError?.({ message: event.message, field: event.field });
  return true;
}
