import { prisma } from "@/lib/db";
import { getOrCreateSettings } from "@/lib/settings";
import { resolveOutputRoot } from "@/lib/output-dir";
import { getRunpodClient } from "@/lib/comfyui/runpod-client";
import { syncBatchExclusive } from "@/lib/comfyui/job-sync";
import { slotLabel } from "@/lib/calendar/slot-label";
import { regenerateJobFreshPrompt } from "@/lib/generations/regenerate-fresh";
import { runAutoPublishExclusive, getCalendarSkipReason } from "@/lib/pipeline/auto-publish";
import { syncBatchToSheet } from "@/lib/sheets/sync";
import { kickDraftQueue } from "@/lib/generations/draft-queue";

const POLL_INTERVAL_MS = 15_000;
// Chỉ đồng bộ batch gần đây; batch cũ hơn ngưỡng này sẽ không poll nữa để tránh gọi RunPod vô hạn.
export const MAX_BATCH_AGE_MS = 24 * 60 * 60 * 1000;

interface AutoSyncGlobal {
  started?: boolean;
  isTicking?: boolean;
  interval?: NodeJS.Timeout;
  isPublishing?: boolean;
}

// Lưu trạng thái trên globalThis để dev HMR không tạo nhiều interval song song.
const store = globalThis as typeof globalThis & { __animaAutoSync?: AutoSyncGlobal };
export const autoSyncState: AutoSyncGlobal = (store.__animaAutoSync ??= {});

export function resetAutoSyncStateForTest(): void {
  if (autoSyncState.interval) {
    clearInterval(autoSyncState.interval);
    autoSyncState.interval = undefined;
  }
  autoSyncState.started = false;
  autoSyncState.isTicking = false;
  autoSyncState.isPublishing = false;
}

export async function resetInterruptedBatches(): Promise<number> {
  try {
    const result = await prisma.generationBatch.updateMany({
      where: {
        autoStatus: { in: ["pending", "processing"] },
      },
      data: {
        autoStatus: null,
      },
    });
    return result.count;
  } catch (error) {
    console.error("[auto-sync] reset batch bị gián đoạn thất bại:", error);
    return 0;
  }
}

/**
 * Tạo lại ảnh chạy nền (LLM + submit) bị cắt ngang khi server tắt để lại job
 * `queued` chưa có promptId -- job-sync bỏ qua job đó mãi mãi. Lúc khởi động
 * không có lượt nền nào đang chạy, nên đánh dấu lỗi để người dùng/auto-retry
 * tạo lại.
 */
export async function failInterruptedRegenerations(): Promise<number> {
  try {
    const result = await prisma.generationJob.updateMany({
      where: { status: "queued", promptId: null, batch: { status: { not: "drafting" } } },
      data: {
        status: "failed",
        errorCode: "interrupted",
        errorMessage: "Bị gián đoạn khi tạo lại, bấm Tạo lại lần nữa",
        finishedAt: new Date(),
      },
    });
    return result.count;
  } catch (error) {
    console.error("[auto-sync] đánh dấu job tạo lại bị gián đoạn thất bại:", error);
    return 0;
  }
}

export async function processAutoWorkflow(): Promise<void> {
  const since = new Date(Date.now() - MAX_BATCH_AGE_MS);
  const candidates = await prisma.generationBatch.findMany({
    where: {
      OR: [{ autoStatus: null }, { autoStatus: "retrying" }],
      status: { in: ["completed", "partial", "failed"] },
      updatedAt: { gte: since },
    },
    include: {
      jobs: {
        orderBy: { indexInBatch: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  for (const batch of candidates) {
    const skipReason = getCalendarSkipReason(batch);
    if (skipReason) {
      await prisma.generationBatch.update({
        where: { id: batch.id },
        data: {
          autoStatus: "skipped",
          autoError: skipReason,
          autoFinishedAt: new Date(),
        },
      });
      continue;
    }

    if (batch.status === "completed") {
      if (!autoSyncState.isPublishing) {
        autoSyncState.isPublishing = true;
        await prisma.generationBatch.update({
          where: { id: batch.id },
          data: { autoStatus: "pending" },
        });

        runAutoPublishExclusive(batch.id)
          .catch((err) => {
            console.error(`[auto-sync] publish batch ${batch.id} lỗi:`, err);
          })
          .finally(() => {
            autoSyncState.isPublishing = false;
          });

        // Mỗi tick khởi động tối đa 1 batch
        break;
      }
    } else if (batch.status === "partial" || batch.status === "failed") {
      const failedJobs = batch.jobs.filter((j) => j.status === "failed");
      const retryableJobs = failedJobs.filter((j) => j.autoRetryCount < 2);

      if (retryableJobs.length > 0) {
        let anySuccess = false;
        let lastErrorMsg = "";

        for (const job of retryableJobs) {
          try {
            await regenerateJobFreshPrompt(job.id);
            await prisma.generationJob.update({
              where: { id: job.id },
              data: { autoRetryCount: { increment: 1 } },
            });
            anySuccess = true;
          } catch (err) {
            lastErrorMsg = err instanceof Error ? err.message : String(err);
            console.error(`[auto-sync] retry job ${job.id} thất bại:`, err);
          }
        }

        if (anySuccess) {
          await prisma.generationBatch.update({
            where: { id: batch.id },
            data: { autoStatus: "retrying", autoError: null },
          });
        } else {
          await prisma.generationBatch.update({
            where: { id: batch.id },
            data: {
              autoError: `Chưa thể sinh lại (LLM/ComfyUI lỗi): ${lastErrorMsg}`,
            },
          });
        }
      } else {
        const failedLabels = failedJobs.map((j) => slotLabel(j.indexInBatch)).join(", ");
        const autoError = failedLabels
          ? `Lỗi sinh ảnh ở các trang: ${failedLabels}`
          : "Không thể hoàn thành sinh ảnh cho bộ lịch";

        await prisma.generationBatch.update({
          where: { id: batch.id },
          data: {
            autoStatus: "failed",
            autoError,
            autoFinishedAt: new Date(),
          },
        });

        if (batch.r2SkuBase) {
          try {
            await syncBatchToSheet({ batchId: batch.id, error: autoError });
          } catch (sheetErr) {
            console.error(`[auto-sync] Ghi Sheet báo lỗi cho batch ${batch.id} thất bại:`, sheetErr);
          }
        }
      }
    }
  }
}

export async function runSyncTick(): Promise<void> {
  if (autoSyncState.isTicking) return;
  autoSyncState.isTicking = true;
  try {
    // Bộ còn chờ soạn mô tả (vd app vừa khởi động lại giữa chừng) -> chạy tiếp.
    kickDraftQueue();
    const settings = await getOrCreateSettings();

    if (settings.runpodEndpointId && settings.runpodApiKey) {
      const since = new Date(Date.now() - MAX_BATCH_AGE_MS);
      const batches = await prisma.generationBatch.findMany({
        where: { status: { in: ["queued", "running"] }, updatedAt: { gte: since } },
        select: { id: true },
      });

      if (batches.length > 0) {
        const client = getRunpodClient(settings);
        const outputRoot = resolveOutputRoot(settings);

        for (const batch of batches) {
          try {
            await syncBatchExclusive(batch.id, client, outputRoot);
          } catch (error) {
            console.error(`[auto-sync] đồng bộ batch ${batch.id} thất bại`, error);
          }
        }
      }
    }

    if (settings.autoPublish) {
      await processAutoWorkflow();
    }
  } catch (error) {
    console.error("[auto-sync] tick thất bại", error);
  } finally {
    autoSyncState.isTicking = false;
  }
}

/**
 * Starts the background poller that periodically syncs unfinished batches
 * against ComfyUI and downloads their output images to disk -- so images are
 * pulled automatically even when no browser tab is open, as long as the Next
 * server is running. Idempotent: guarded on globalThis so dev HMR / repeated
 * calls never create more than one interval.
 */
export function startAutoSyncPoller(): void {
  if (autoSyncState.started) return;
  autoSyncState.started = true;
  void resetInterruptedBatches().catch((err) => {
    console.error("[auto-sync] reset batch bị gián đoạn thất bại:", err);
  });
  void failInterruptedRegenerations();
  kickDraftQueue();
  autoSyncState.interval = setInterval(() => {
    void runSyncTick();
  }, POLL_INTERVAL_MS);
  console.log(`[auto-sync] poller đã khởi động (mỗi ${POLL_INTERVAL_MS / 1000}s)`);
}
