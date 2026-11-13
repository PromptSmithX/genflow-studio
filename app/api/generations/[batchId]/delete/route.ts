import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleApiError, apiError } from "@/lib/api/errors";
import { getOrCreateSettings } from "@/lib/settings";
import { buildBatchFolder } from "@/lib/files/safe-output";
import {
  resolveOutputRoot,
  resolveCensoredRoot,
  resolveUpscaledRoot,
  resolveUpscaledCensoredRoot,
  resolveBackCoverRoot,
  resolveFinalRoot,
  resolveResultsRoot,
} from "@/lib/output-dir";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ batchId: string }>;
}

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const { batchId } = await params;

    const batch = await prisma.generationBatch.findUnique({ where: { id: batchId } });
    if (!batch) return apiError("not_found", "Không tìm thấy batch", 404);

    // Xóa tất cả thư mục ảnh của batch
    const settings = await getOrCreateSettings();
    const outputRoot = resolveOutputRoot(settings);
    const slug = batch.finalExportRelativePath || buildBatchFolder(batch);

    const roots = [
      outputRoot,
      resolveCensoredRoot(outputRoot),
      resolveUpscaledRoot(outputRoot),
      resolveUpscaledCensoredRoot(outputRoot),
      resolveBackCoverRoot(outputRoot),
      resolveFinalRoot(outputRoot),
      resolveResultsRoot(outputRoot),
    ];

    for (const root of roots) {
      const dir = path.join(root, slug);
      try {
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // Không dừng nếu xóa thư mục lỗi (đã bị xóa tay, quyền truy cập, v.v.)
      }
    }

    // Xóa DB — cascade xóa cả jobs và images
    await prisma.generationBatch.delete({ where: { id: batchId } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
