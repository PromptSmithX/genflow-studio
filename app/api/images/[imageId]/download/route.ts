import fs from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api/errors";
import { resolveSafePath } from "@/lib/files/safe-output";
import { getOrCreateSettings } from "@/lib/settings";
import {
  resolveOutputRoot,
  resolveCensoredRoot,
  resolveUpscaledRoot,
  resolveUpscaledCensoredRoot,
} from "@/lib/output-dir";
import { resolveImageVariant } from "@/lib/images/variant";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ imageId: string }>;
}

/** `?variant=` downloads masked / upscaled / upscaled-masked instead of original. */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { imageId } = await params;
    const image = await prisma.generatedImage.findUnique({ where: { id: imageId } });
    if (!image) return apiError("not_found", "Không tìm thấy ảnh", 404);

    const settings = await getOrCreateSettings();
    const outputRoot = resolveOutputRoot(settings);
    const resolved = resolveImageVariant(image, request.nextUrl.searchParams.get("variant"), {
      outputRoot,
      censoredRoot: resolveCensoredRoot(outputRoot),
      upscaledRoot: resolveUpscaledRoot(outputRoot),
      upscaledCensoredRoot: resolveUpscaledCensoredRoot(outputRoot),
    });
    if (!resolved) return apiError("not_found", "Chưa có bản ảnh này", 404);

    const buffer = await fs.readFile(resolveSafePath(resolved.root, resolved.relativePath));

    const downloadName = resolved.downloadSuffix
      ? image.filename.replace(/(\.[^.]+)?$/, `${resolved.downloadSuffix}$1`)
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
