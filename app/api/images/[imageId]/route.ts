import fs from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api/errors";
import { resolveSafePath } from "@/lib/files/safe-output";
import { getOrCreateSettings } from "@/lib/settings";
import { resolveOutputRoot } from "@/lib/output-dir";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ imageId: string }>;
}

/**
 * Streams an image by its database id only -- it never accepts an
 * arbitrary filesystem path from the request, and resolveSafePath still
 * guards against the stored relativePath ever escaping the output root.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { imageId } = await params;
    const image = await prisma.generatedImage.findUnique({ where: { id: imageId } });
    if (!image) return apiError("not_found", "Không tìm thấy ảnh", 404);

    const settings = await getOrCreateSettings();
    const outputRoot = resolveOutputRoot(settings);

    const fullPath = resolveSafePath(outputRoot, image.relativePath);
    const buffer = await fs.readFile(fullPath);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": image.mimeType,
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
