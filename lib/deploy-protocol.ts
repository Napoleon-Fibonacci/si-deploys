/**
 * Kontrak kabel deploy: satu-satunya tempat tipe event dan tahap dideklarasikan,
 * dipakai bersama oleh klien (components/DeployForm.tsx) dan server
 * (app/api/deploy/route.ts). Modul ini murni dan bebas impor server, jadi
 * aman diimpor dari komponen klien.
 */

import type { ErrorField } from "./errors";

export const SOURCE_TYPES = ["github", "zip"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export function isSourceType(value: unknown): value is SourceType {
  return typeof value === "string" && (SOURCE_TYPES as readonly string[]).includes(value);
}

export type DeploySource =
  | { type: "github"; url: string }
  | { type: "zip"; blobUrl: string };

export interface DeployPayload {
  name: string;
  source: DeploySource;
}

export const DEPLOY_STAGES = ["files", "slot", "create"] as const;
export type DeployStage = (typeof DEPLOY_STAGES)[number];

export function isStage(value: unknown): value is DeployStage {
  return typeof value === "string" && (DEPLOY_STAGES as readonly string[]).includes(value);
}

export type DeployEvent =
  | { type: "stage"; stage: DeployStage }
  | { type: "done"; url: string; renamed: boolean }
  | { type: "error"; code: number; message: string; field: ErrorField };

/**
 * Langkah UI per tahap. Bentuk Record atas union tahap, jadi menambah tahap
 * di DEPLOY_STAGES memaksa keputusan di sini, bukan diam-diam jatuh ke 0.
 */
export const STAGE_INDEX: Record<DeployStage, number> = {
  files: 0,
  slot: 0,
  create: 1,
};

export const DONE_STEP_INDEX = 2;

/** Satu event jadi satu baris NDJSON. */
export function encodeEvent(event: DeployEvent): string {
  return `${JSON.stringify(event)}\n`;
}

/**
 * Urai baris lengkap dari buffer yang tumbuh saat streaming.
 * Sisa yang belum lengkap dikembalikan sebagai `rest` supaya pemanggil
 * bisa menempelkannya ke potongan berikutnya.
 */
export function decodeEvents(buffer: string): { events: DeployEvent[]; rest: string } {
  const events: DeployEvent[] = [];
  let rest = buffer;
  let newline = rest.indexOf("\n");

  while (newline >= 0) {
    const line = rest.slice(0, newline).trim();
    rest = rest.slice(newline + 1);
    newline = rest.indexOf("\n");
    if (!line) continue;
    const event = decodeEvent(line);
    if (event) events.push(event);
  }

  return { events, rest };
}

/** Satu baris jadi satu event, atau null kalau tak dikenal/rusak. */
export function decodeEvent(line: string): DeployEvent | null {
  let value: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(line);
    if (typeof parsed !== "object" || parsed === null) return null;
    value = parsed as Record<string, unknown>;
  } catch {
    return null;
  }

  if (value.type === "stage") {
    return isStage(value.stage) ? { type: "stage", stage: value.stage } : null;
  }
  if (value.type === "done") {
    return {
      type: "done",
      url: typeof value.url === "string" ? value.url : "",
      renamed: value.renamed === true,
    };
  }
  if (value.type === "error") {
    return {
      type: "error",
      code: typeof value.code === "number" ? value.code : 500,
      message:
        typeof value.message === "string" ? value.message : "Terjadi kesalahan tak terduga.",
      field: value.field === "name" ? "name" : "source",
    };
  }
  return null;
}
