import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/errors";
import { serializeBigInts } from "@/lib/api/serialize";
import { regenerateJobFreshPrompt } from "@/lib/generations/regenerate-fresh";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ jobId: string }>;
}

/**
 * "Sửa lại" một ảnh lỗi TẠI CHỖ: LLM sinh prompt mới đúng vai trò (bìa/artwork)
 * thay vì tái dùng prompt cũ (có thể chứa tag xung đột), giữ nguyên seed/batch.
 * Xem lib/generations/regenerate-fresh.ts::regenerateJobFreshPrompt.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const { jobId } = await params;
    const batch = await regenerateJobFreshPrompt(jobId);
    return NextResponse.json(serializeBigInts(batch), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
