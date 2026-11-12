import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleApiError } from "@/lib/api/errors";
import { serializeBigInts } from "@/lib/api/serialize";
import { finishRegenerateJob, startRegenerateJob } from "@/lib/generations/regenerate-fresh";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ jobId: string }>;
}

/**
 * "Tạo lại"/"Sửa lại" một ảnh TẠI CHỖ, chạy NỀN: đưa job về queued rồi trả về
 * ngay (202) để UI đóng hộp thoại và cho tạo lại tiếp ảnh khác; LLM + submit
 * chạy sau, lỗi sẽ hiện trên ô ảnh. Xem lib/generations/regenerate-fresh.ts.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const { jobId } = await params;
    const started = await startRegenerateJob(jobId);
    void finishRegenerateJob(started);
    const batch = await prisma.generationBatch.findUniqueOrThrow({
      where: { id: started.batch.id },
      include: { jobs: true },
    });
    return NextResponse.json(serializeBigInts(batch), { status: 202 });
  } catch (error) {
    return handleApiError(error);
  }
}
