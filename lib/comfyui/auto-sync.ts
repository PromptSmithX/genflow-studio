import { prisma } from "@/lib/db";
import { getOrCreateSettings } from "@/lib/settings";
import { resolveOutputRoot } from "@/lib/output-dir";
import { ComfyClient } from "@/lib/comfyui/client";
import { syncBatchExclusive } from "@/lib/comfyui/job-sync";
import { slotLabel } from "@/lib/calendar/slot-label";
import { regenerateJobFreshPrompt } from "@/lib/generations/regenerate-fresh";
import { runAutoPublishExclusive } from "@/lib/pipeline/auto-publish";
import { syncBatchToSheet } from "@/lib/sheets/sync";
import type { AppSettings } from "@prisma/client";

const POLL_INTERVAL_MS = 15_000;
// Chỉ đồng bộ batch gần đây; batch cũ hơn ngưỡng này sẽ không poll nữa để
// tránh gọi ComfyUI vô hạn cho các batch kẹt lâu (vd Colab đã tắt từ lâu).
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
  autoSyncState.isTicking = false;
  autoSyncState.isPublishing = false;
}

export async function processAutoWorkflow(settings: AppSettings): Promise<void> {
  const since = new Date(Date.now() - MAX_BATCH_AGE_MS);
  const candidates = await prisma.generationBatch.findMany({
    where: {
      autoStatus: { in: [null, "retrying"] },
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
        for (const job of retryableJobs) {
          await prisma.generationJob.update({
            where: { id: job.id },
            data: { autoRetryCount: { increment: 1 } },
          });

          try {
            await regenerateJobFreshPrompt(job.id);
          } catch (err) {
            console.error(`[auto-sync] retry job ${job.id} thất bại:`, err);
          }
        }

        await prisma.generationBatch.update({
          where: { id: batch.id },
          data: { autoStatus: "retrying" },
        });
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
    const settings = await getOrCreateSettings();

    if (settings.comfyBaseUrl) {
      const since = new Date(Date.now() - MAX_BATCH_AGE_MS);
      const batches = await prisma.generationBatch.findMany({
        where: { status: { in: ["queued", "running"] }, updatedAt: { gte: since } },
        select: { id: true },
      });

      if (batches.length > 0) {
        const client = new ComfyClient({ baseUrl: settings.comfyBaseUrl, token: process.env.COMFY_GATEWAY_TOKEN });
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
      await processAutoWorkflow(settings);
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
  autoSyncState.interval = setInterval(() => {
    void runSyncTick();
  }, POLL_INTERVAL_MS);
  console.log(`[auto-sync] poller đã khởi động (mỗi ${POLL_INTERVAL_MS / 1000}s)`);
}
