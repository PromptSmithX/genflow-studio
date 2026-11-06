import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api/errors";
import { getR2Status } from "@/lib/r2/config";
import { pushBatches } from "@/lib/r2/push-batches";

export const runtime = "nodejs";

const pushSchema = z.object({
  batchIds: z.array(z.string().min(1)).min(1, "Phải chọn ít nhất 1 bộ lịch").max(50, "Tối đa 50 bộ lịch mỗi lần đẩy"),
});

export async function POST(request: NextRequest) {
  try {
    const status = getR2Status();
    if (!status.configured) {
      return apiError(
        "r2_not_configured",
        `R2 chưa được cấu hình. Thiếu biến môi trường: ${status.missing.join(", ")}`,
        409,
      );
    }

    const body = await request.json();
    const { batchIds } = pushSchema.parse(body);

    const result = await pushBatches(batchIds);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
