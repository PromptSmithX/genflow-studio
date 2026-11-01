import fs from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api/errors";
import { resolveSafePath } from "@/lib/files/safe-output";
import { getOrCreateSettings } from "@/lib/settings";
import { resolveOutputRoot, resolveCensoredRoot } from "@/lib/output-dir";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ imageId: string }>;
}

/** `?variant=masked` downloads the auto-censored copy instead of the original. */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { imageId } = await params;
    const image = await prisma.generatedImage.findUnique({ where: { id: imageId } });
    if (!image) return apiError("not_found", "Không tìm thấy ảnh", 404);

    const wantsMasked = request.nextUrl.searchParams.get("variant") === "masked";
    if (wantsMasked && !image.maskedRelativePath) {
      return apiError("not_found", "Chưa có bản đã che cho ảnh này", 404);
    }

    const settings = await getOrCreateSettings();
    const outputRoot = resolveOutputRoot(settings);

    const fullPath = wantsMasked
      ? resolveSafePath(resolveCensoredRoot(outputRoot), image.maskedRelativePath!)
      : resolveSafePath(outputRoot, image.relativePath);
    const buffer = await fs.readFile(fullPath);

    const downloadName = wantsMasked
      ? image.filename.replace(/(\.[^.]+)?$/, "_censored$1")
      : image.filename;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": image.mimeType,
        "Content-Disposition": `attachment; filename="${downloadName.replace(/"/g, "")}"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
