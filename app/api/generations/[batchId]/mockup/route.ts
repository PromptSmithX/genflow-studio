import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api/errors";
import { buildBatchFolder } from "@/lib/files/safe-output";
import { getOrCreateSettings } from "@/lib/settings";
import { resolveOutputRoot, resolveFinalRoot } from "@/lib/output-dir";
import { wrapBatchMockup } from "@/lib/mockup/run-mockup";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ batchId: string }>;
}

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const { batchId } = await params;
    const batch = await prisma.generationBatch.findUnique({ where: { id: batchId } });
    if (!batch) return apiError("not_found", "Không tìm thấy batch", 404);

    const result = await wrapBatchMockup(batchId);
    if (result.status === "failed") {
      return apiError("mockup_failed", result.error || "Tạo mockup thất bại", 500);
    }

    return NextResponse.json({
      status: result.status,
      files: result.files,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { batchId } = await params;
    const batch = await prisma.generationBatch.findUnique({ where: { id: batchId } });
    if (!batch) return apiError("not_found", "Không tìm thấy batch", 404);

    const settings = await getOrCreateSettings();
    const finalRoot = resolveFinalRoot(resolveOutputRoot(settings));
    const slug = batch.finalExportRelativePath || buildBatchFolder(batch);
    const mockupDir = path.join(finalRoot, slug, "mockup");

    let files: string[] = [];
    try {
      const entries = await fs.readdir(mockupDir);
      files = entries.filter((f) => f.endsWith(".png")).sort();
    } catch {
      files = [];
    }

    return NextResponse.json({
      status: batch.mockupStatus ?? (files.length > 0 ? "done" : null),
      files,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
