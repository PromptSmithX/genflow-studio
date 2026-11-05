import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api/errors";
import { resolveSafePath, buildBatchFolder } from "@/lib/files/safe-output";
import { getOrCreateSettings } from "@/lib/settings";
import { resolveOutputRoot, resolveFinalRoot } from "@/lib/output-dir";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ batchId: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { batchId } = await params;
    const filename = request.nextUrl.searchParams.get("name");
    if (!filename || !filename.endsWith(".png")) {
      return apiError("invalid_request", "Tên file mockup không hợp lệ", 400);
    }

    const batch = await prisma.generationBatch.findUnique({ where: { id: batchId } });
    if (!batch) return apiError("not_found", "Không tìm thấy batch", 404);

    const settings = await getOrCreateSettings();
    const finalRoot = resolveFinalRoot(resolveOutputRoot(settings));
    const slug = batch.finalExportRelativePath || buildBatchFolder(batch);
    const mockupDir = path.join(finalRoot, slug, "mockup");
    const filePath = resolveSafePath(mockupDir, filename);

    const buffer = await fs.readFile(filePath);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=86400, stale-while-revalidate=3600",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
