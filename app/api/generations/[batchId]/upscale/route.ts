import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleApiError, apiError } from "@/lib/api/errors";
import { serializeBigInts } from "@/lib/api/serialize";
import { upscaleBatch } from "@/lib/generations/upscale-image";

export const runtime = "nodejs";

const upscaleBatchSchema = z.object({
  formatId: z.string().trim().min(1, "Thiếu khổ lịch"),
});

interface Params {
  params: Promise<{ batchId: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { batchId } = await params;
    const batch = await prisma.generationBatch.findUnique({ where: { id: batchId } });
    if (!batch) return apiError("not_found", "Không tìm thấy batch", 404);

    const body = upscaleBatchSchema.parse(await request.json().catch(() => ({})));
    const result = await upscaleBatch(batchId, body.formatId);

    const updated = await prisma.generationBatch.findUniqueOrThrow({
      where: { id: batchId },
      include: { jobs: { include: { images: true }, orderBy: { indexInBatch: "asc" } } },
    });
    return NextResponse.json({ ...serializeBigInts(updated), upscaleResult: result });
  } catch (error) {
    return handleApiError(error);
  }
}
