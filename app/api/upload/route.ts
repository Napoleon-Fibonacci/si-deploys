import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest } from "next/server";
import { enforceRateLimit, getClientIp } from "@/lib/ratelimit";
import { AppError, errorMessage, toErrorResponse } from "@/lib/errors";
import { MAX_ZIP_BYTES, ZIP_CONTENT_TYPES } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/upload — menerbitkan token client upload Vercel Blob.
 * Browser mengunggah ZIP langsung ke Blob agar lolos batas body 4,5 MB (PRD 9.1).
 * Client memakai `upload()` dari `@vercel/blob/client` dengan handleUploadUrl "/api/upload".
 */
export async function POST(request: NextRequest) {
  try {
    await enforceRateLimit("deploy", getClientIp(request));
  } catch (error) {
    return toErrorResponse(error);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return toErrorResponse(new AppError(400, "Body tidak valid."));
  }

  try {
    const jsonResponse = await handleUpload({
      body: body as HandleUploadBody,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [...ZIP_CONTENT_TYPES, "application/octet-stream"],
        maximumSizeInBytes: MAX_ZIP_BYTES,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ issuedAt: Date.now() }),
      }),
      onUploadCompleted: async () => {
        // Blob sudah tersimpan; verifikasi lanjutan dilakukan /api/deploy.
      },
    });
    return Response.json(jsonResponse);
  } catch (error) {
    // Kegagalan Blob bukan salah bentuk permintaan dari klien: tetap 400.
    return toErrorResponse(new AppError(400, errorMessage(error)));
  }
}
