import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleApiError, apiError } from "@/lib/api/errors";
import { serializeBigInts } from "@/lib/api/serialize";
import { cancelDraft } from "@/lib/generations/draft-queue";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ batchId: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { batchId } = await params;
    const batch = await prisma.generationBatch.findUnique({
      where: { id: batchId },
      include: { jobs: { include: { images: true }, orderBy: { indexInBatch: "asc" } } },
    });
    if (!batch) return apiError("not_found", "Không tìm thấy batch", 404);
    return NextResponse.json(serializeBigInts(batch));
  } catch (error) {
    return handleApiError(error);
  }
}

/** Chỉ huỷ được bộ lịch còn trong hàng đợi soạn mô tả (xem lib/generations/draft-queue.ts). */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { batchId } = await params;
    await cancelDraft(batchId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
