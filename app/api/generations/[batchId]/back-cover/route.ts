import fs from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api/errors";
import { resolveSafePath } from "@/lib/files/safe-output";
import { getOrCreateSettings } from "@/lib/settings";
import { resolveOutputRoot, resolveBackCoverRoot } from "@/lib/output-dir";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ batchId: string }>;
}

/**
 * Serves the composited back-cover image of a batch (12 artworks collaged
 * into one print page, see lib/generations/upscale-image.ts::buildBackCover).
 * `?download=1` sets Content-Disposition for a file-save instead of inline view.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { batchId } = await params;
    const batch = await prisma.generationBatch.findUnique({ where: { id: batchId } });
    if (!batch) return apiError("not_found", "Không tìm thấy batch", 404);
    if (batch.backCoverStatus !== "done" || !batch.backCoverRelativePath) {
      return apiError("not_found", "Chưa có bìa sau cho batch này", 404);
    }

    const settings = await getOrCreateSettings();
    const backCoverRoot = resolveBackCoverRoot(resolveOutputRoot(settings));
    const buffer = await fs.readFile(resolveSafePath(backCoverRoot, batch.backCoverRelativePath));

    const isDownload = request.nextUrl.searchParams.get("download") === "1";
    const headers: Record<string, string> = {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=31536000, immutable",
    };
    if (isDownload) {
      headers["Content-Disposition"] = `attachment; filename="back_cover_${batchId}.png"`;
    }

    return new NextResponse(buffer, { headers });
  } catch (error) {
    return handleApiError(error);
  }
}
