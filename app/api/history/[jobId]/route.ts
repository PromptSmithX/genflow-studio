import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleApiError, apiError } from "@/lib/api/errors";
import { serializeBigInts } from "@/lib/api/serialize";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ jobId: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { jobId } = await params;
    const job = await prisma.generationJob.findUnique({
      where: { id: jobId },
      include: { images: true, batch: true, style: true },
    });
    if (!job) return apiError("not_found", "Không tìm thấy job", 404);
    return NextResponse.json(serializeBigInts(job));
  } catch (error) {
    return handleApiError(error);
  }
}
