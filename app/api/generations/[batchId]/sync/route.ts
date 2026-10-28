import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleApiError, apiError } from "@/lib/api/errors";
import { serializeBigInts } from "@/lib/api/serialize";
import { getOrCreateSettings } from "@/lib/settings";
import { resolveOutputRoot } from "@/lib/output-dir";
import { ComfyClient } from "@/lib/comfyui/client";
import { syncBatchExclusive } from "@/lib/comfyui/job-sync";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ batchId: string }>;
}

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const { batchId } = await params;
    const batch = await prisma.generationBatch.findUnique({ where: { id: batchId } });
    if (!batch) return apiError("not_found", "Không tìm thấy batch", 404);

    const settings = await getOrCreateSettings();
    if (!settings.comfyBaseUrl) {
      return apiError("not_configured", "Chưa cấu hình URL ComfyUI", 400);
    }

    const client = new ComfyClient({ baseUrl: settings.comfyBaseUrl, token: process.env.COMFY_GATEWAY_TOKEN });
    const outputRoot = resolveOutputRoot(settings);

    await syncBatchExclusive(batchId, client, outputRoot);

    const updated = await prisma.generationBatch.findUniqueOrThrow({
      where: { id: batchId },
      include: { jobs: { include: { images: true }, orderBy: { indexInBatch: "asc" } } },
    });
    return NextResponse.json(serializeBigInts(updated));
  } catch (error) {
    return handleApiError(error);
  }
}
