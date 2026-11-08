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

/**
 * Streams an image by its database id only -- it never accepts an
 * arbitrary filesystem path from the request, and resolveSafePath still
 * guards against the stored relativePath ever escaping the output root.
 * `?variant=` picks masked / upscaled / upscaled-masked instead of the original.
 */
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
    // Bản in (upscaled*) bị ghi đè cùng path khi xuất lại với khổ khác; bản gốc thì bất biến.
    const isMutableVariant = request.nextUrl.searchParams.get("variant")?.startsWith("upscaled") ?? false;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": image.mimeType,
        "Cache-Control": isMutableVariant ? "no-cache" : "private, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
