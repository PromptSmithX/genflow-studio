import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api/errors";
import { runAutoPublishExclusive } from "@/lib/pipeline/auto-publish";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ batchId: string }>;
}

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const { batchId } = await params;
    const batch = await prisma.generationBatch.findUnique({ where: { id: batchId } });
    if (!batch) return apiError("not_found", "Không tìm thấy batch", 404);

    await prisma.generationBatch.update({
      where: { id: batchId },
      data: { autoStatus: "pending", autoStage: null, autoError: null },
    });

    const result = await runAutoPublishExclusive(batchId);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
