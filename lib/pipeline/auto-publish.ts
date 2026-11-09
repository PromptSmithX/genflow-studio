import { prisma } from "@/lib/db";
import { getOrCreateSettings } from "@/lib/settings";
import { upscaleBatch } from "@/lib/generations/upscale-image";
import { pushBatches } from "@/lib/r2/push-batches";
import { syncBatchToSheet } from "@/lib/sheets/sync";

export interface AutoPublishResult {
  status: "done" | "failed" | "skipped";
  error?: string | null;
}

export function getCalendarSkipReason(batch: {
  requestedCount: number;
  etsyTitle?: string | null;
}): string | null {
  if (batch.requestedCount !== 13) {
    return `Batch không phải bộ lịch 13 ảnh (requestedCount = ${batch.requestedCount})`;
  }
  if (!batch.etsyTitle || !batch.etsyTitle.trim()) {
    return "Batch thiếu Etsy title";
  }
  return null;
}

const inFlightAutoPublish = new Map<string, Promise<AutoPublishResult>>();

export function runAutoPublishExclusive(batchId: string): Promise<AutoPublishResult> {
  const existing = inFlightAutoPublish.get(batchId);
  if (existing) return existing;

  const run = runAutoPublish(batchId).finally(() => {
    inFlightAutoPublish.delete(batchId);
  });
  inFlightAutoPublish.set(batchId, run);
  return run;
}

export async function runAutoPublish(batchId: string): Promise<AutoPublishResult> {
  try {
    // 1. Set autoStatus: "processing", autoStage: null, autoError: null
    await prisma.generationBatch.update({
      where: { id: batchId },
      data: {
        autoStatus: "processing",
        autoStage: null,
        autoError: null,
      },
    });

    // 2. Batch không phải bộ lịch (requestedCount !== 13 hoặc không có etsyTitle)
    const batch = await prisma.generationBatch.findUnique({
      where: { id: batchId },
    });
    if (!batch) {
      return { status: "failed", error: "Không tìm thấy batch" };
    }

    const skipReason = getCalendarSkipReason(batch);
    if (skipReason) {
      await prisma.generationBatch.update({
        where: { id: batchId },
        data: {
          autoStatus: "skipped",
          autoStage: null,
          autoError: skipReason,
          autoFinishedAt: new Date(),
        },
      });
      return { status: "skipped", error: skipReason };
    }

    // 3. upscaleBatch (gồm bìa sau + xuất thư mục + mockup)
    await prisma.generationBatch.update({
      where: { id: batchId },
      data: { autoStage: "export" },
    });

    const settings = await getOrCreateSettings();
    const formatId = settings.autoFormatId || "premade_wall_11x8_5";
    const upscaleResult = await upscaleBatch(batchId, formatId);

    if (upscaleResult.finalExport !== "done") {
      throw new Error("Xuất thư mục in thất bại");
    }
    if (upscaleResult.mockup !== "done") {
      throw new Error("Tạo mockup sản phẩm thất bại");
    }

    // 4. pushBatches
    await prisma.generationBatch.update({
      where: { id: batchId },
      data: { autoStage: "r2" },
    });

    const pushResult = await pushBatches([batchId]);
    const batchPush = pushResult.results.find((r) => r.batchId === batchId);
    if (!batchPush || !batchPush.ok) {
      throw new Error(batchPush?.error || "Đẩy dữ liệu lên Cloudflare R2 thất bại");
    }

    // 5. syncBatchToSheet (lỗi Sheet không làm fail pipeline)
    await prisma.generationBatch.update({
      where: { id: batchId },
      data: { autoStage: "sheet" },
    });

    let sheetError: string | null = null;
    try {
      await syncBatchToSheet({ batchId, rows: batchPush.rows });
    } catch (error) {
      console.error(`[runAutoPublish] Ghi Google Sheet thất bại cho batch ${batchId}:`, error);
      sheetError = `Đã đẩy R2 nhưng ghi Google Sheet lỗi: ${error instanceof Error ? error.message : String(error)}`;
    }

    // 6. Set autoStatus: "done", autoFinishedAt
    const finishedAt = new Date();
    await prisma.generationBatch.update({
      where: { id: batchId },
      data: {
        autoStatus: "done",
        autoStage: null,
        autoError: sheetError,
        autoFinishedAt: finishedAt,
      },
    });

    return { status: "done", error: sheetError };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const finishedAt = new Date();

    await prisma.generationBatch.update({
      where: { id: batchId },
      data: {
        autoStatus: "failed",
        autoError: errorMsg,
        autoFinishedAt: finishedAt,
      },
    });

    const updatedBatch = await prisma.generationBatch.findUnique({
      where: { id: batchId },
    });
    if (updatedBatch?.r2SkuBase) {
      try {
        await syncBatchToSheet({ batchId, error: errorMsg });
      } catch (sheetErr) {
        console.error(`[runAutoPublish] Ghi Sheet báo lỗi thất bại cho batch ${batchId}:`, sheetErr);
      }
    }

    return { status: "failed", error: errorMsg };
  }
}
