import { prisma } from "@/lib/db";
import { getOrCreateSettings } from "@/lib/settings";
import { resolveOutputRoot } from "@/lib/output-dir";
import { ComfyClient } from "@/lib/comfyui/client";
import { syncBatchExclusive } from "@/lib/comfyui/job-sync";

const POLL_INTERVAL_MS = 15_000;
// Chỉ đồng bộ batch gần đây; batch cũ hơn ngưỡng này sẽ không poll nữa để
// tránh gọi ComfyUI vô hạn cho các batch kẹt lâu (vd Colab đã tắt từ lâu).
const MAX_BATCH_AGE_MS = 24 * 60 * 60 * 1000;

interface AutoSyncGlobal {
  started?: boolean;
  isTicking?: boolean;
  interval?: NodeJS.Timeout;
}

// Lưu trạng thái trên globalThis để dev HMR không tạo nhiều interval song song.
const store = globalThis as typeof globalThis & { __animaAutoSync?: AutoSyncGlobal };
const state: AutoSyncGlobal = (store.__animaAutoSync ??= {});

async function runSyncTick(): Promise<void> {
  if (state.isTicking) return;
  state.isTicking = true;
  try {
    const settings = await getOrCreateSettings();
    if (!settings.comfyBaseUrl) return;

    const since = new Date(Date.now() - MAX_BATCH_AGE_MS);
    const batches = await prisma.generationBatch.findMany({
      where: { status: { in: ["queued", "running"] }, updatedAt: { gte: since } },
      select: { id: true },
    });
    if (batches.length === 0) return;

    const client = new ComfyClient({ baseUrl: settings.comfyBaseUrl, token: process.env.COMFY_GATEWAY_TOKEN });
    const outputRoot = resolveOutputRoot(settings);

    for (const batch of batches) {
      try {
        await syncBatchExclusive(batch.id, client, outputRoot);
      } catch (error) {
        console.error(`[auto-sync] đồng bộ batch ${batch.id} thất bại`, error);
      }
    }
  } catch (error) {
    console.error("[auto-sync] tick thất bại", error);
  } finally {
    state.isTicking = false;
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
  if (state.started) return;
  state.started = true;
  state.interval = setInterval(() => {
    void runSyncTick();
  }, POLL_INTERVAL_MS);
  console.log(`[auto-sync] poller đã khởi động (mỗi ${POLL_INTERVAL_MS / 1000}s)`);
}
