import { NextRequest } from "next/server";
import { enforceRateLimit, getClientIp } from "@/lib/ratelimit";
import { ValidationError, validateName } from "@/lib/validate";
import { fromBlobUrl, fromGitHub, type DeployFile } from "@/lib/sources";
import {
  type DeployEvent,
  type DeployStage,
  type SourceType,
  encodeEvent,
  isSourceType,
} from "@/lib/deploy-protocol";
import {
  reserveSlot,
  markActive,
  markFailed,
  markDeleted,
  revertVictim,
} from "@/lib/deployments";
import { AppError, errorCode, errorField, errorMessage, toErrorResponse } from "@/lib/errors";
import { createDeployment, deleteProject, VercelApiError } from "@/lib/vercel";

export const runtime = "nodejs";
export const maxDuration = 90;
export const dynamic = "force-dynamic";

/** Bentuk `source` sebelum dipercaya; field-nya masih unknown. */
interface RawSource {
  type: SourceType;
  url?: unknown;
  blobUrl?: unknown;
}

/**
 * POST /api/deploy — alur utama.
 * Respons: NDJSON stream. Satu event {type:"stage"} per tahap, lalu
 * {type:"done", url, renamed} atau {type:"error", code, message}.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return toErrorResponse(new AppError(400, "Body tidak valid."));
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: DeployEvent) => {
        controller.enqueue(encoder.encode(encodeEvent(event)));
      };
      const stage = (value: DeployStage) => send({ type: "stage", stage: value });

      let rowId: string | null = null;
      try {
        const data = body as { name?: unknown; source?: RawSource };
        if (!data || typeof data !== "object" || !data.source) {
          throw new ValidationError("Body tidak valid.");
        }
        const source = data.source;
        const sourceType = source.type;
        if (!isSourceType(sourceType)) {
          throw new ValidationError("Sumber tidak dikenal.");
        }

        // Validasi lokal dulu: input tak valid tak perlu menyentuh rate limit
        // maupun database, dan galatnya bisa ditandai ke field nama.
        const name = validateName(data.name);
        await enforceRateLimit("deploy", getClientIp(request));
        await stage("files");

        const files = await fetchFiles(source);
        await stage("slot");

        const reservation = await reserveSlot(name, sourceType);
        rowId = reservation.rowId;
        await stage("create");

        // Hapus project tertua di luar lock.
        if (reservation.victim) {
          const victim = reservation.victim;
          try {
            if (victim.vercelProjectId) {
              // Hapus hanya via vercel_project_id dari database, tidak pernah via daftar Vercel.
              await deleteProject(victim.vercelProjectId);
            }
            await markDeleted(victim.id);
          } catch {
            await revertVictim(victim.id);
            await markFailed(rowId);
            throw new VercelApiError(
              "Gagal menghapus project tertua di Vercel. Deploy baru dibatalkan; coba lagi."
            );
          }
        }

        let result;
        try {
          result = await createDeployment(name, files);
        } catch (error) {
          await markFailed(rowId);
          throw error;
        }

        await markActive(rowId, result.projectId, result.url);
        send({ type: "done", url: result.url, renamed: result.renamed });
      } catch (error) {
        if (rowId) await markFailed(rowId).catch(() => {});
        send(toErrorEvent(error));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

async function fetchFiles(source: RawSource): Promise<DeployFile[]> {
  switch (source.type) {
    case "zip":
      if (typeof source.blobUrl !== "string") {
        throw new ValidationError("ZIP belum diunggah.");
      }
      return fromBlobUrl(source.blobUrl);
    case "github":
      return fromGitHub(source.url);
    default:
      throw new ValidationError("Sumber tidak dikenal.");
  }
}

function toErrorEvent(error: unknown): DeployEvent {
  return {
    type: "error",
    code: errorCode(error),
    message: errorMessage(error),
    field: errorField(error),
  };
}
