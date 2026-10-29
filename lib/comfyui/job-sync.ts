import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { ComfyClient, ComfyApiError } from "@/lib/comfyui/client";
import { resolveSafePath, buildOutputFilename } from "@/lib/files/safe-output";
import { overlaySpecSchema } from "@/lib/validations/llm";
import { renderOverlay } from "@/lib/overlay/render";

function mimeTypeFromFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

/**
 * Syncs a single queued/running job against ComfyUI's /history endpoint,
 * downloading any new output images exactly once. Safe to call repeatedly
 * (e.g. from polling or a manual "sync" click) without creating duplicate
 * GeneratedImage rows, since it checks existing rows by filename first.
 */
export async function syncJob(jobId: string, client: ComfyClient, outputRoot: string): Promise<void> {
  const job = await prisma.generationJob.findUnique({ where: { id: jobId }, include: { images: true } });
  if (!job) return;
  if (job.status === "completed" || job.status === "failed") return;
  if (!job.promptId) return;

  let history;
  try {
    history = await client.getHistory(job.promptId);
  } catch (error) {
    if (error instanceof ComfyApiError) {
      await prisma.generationJob.update({
        where: { id: jobId },
        data: { status: "unknown", errorCode: error.code, errorMessage: error.message },
      });
      return;
    }
    throw error;
  }

  if (history.status === "not_found") {
    // Not in /history yet does NOT mean lost: ComfyUI only moves a prompt into
    // history after it finishes, so while queued/running it lives in /queue.
    let activeIds: Set<string>;
    try {
      activeIds = await client.getActivePromptIds();
    } catch {
      activeIds = new Set();
    }

    if (activeIds.has(job.promptId)) {
      await prisma.generationJob.update({
        where: { id: jobId },
        data: { status: "running", startedAt: job.startedAt ?? new Date(), errorCode: null, errorMessage: null },
      });
      return;
    }

    // Neither in history nor in the queue. Allow a grace window after submit
    // for the brief handoff between leaving the queue and appearing in
    // history (and transient network hiccups) before declaring it lost.
    const GRACE_MS = 120_000;
    const since = job.submittedAt ?? job.createdAt;
    if (Date.now() - since.getTime() < GRACE_MS) {
      return; // keep current queued/running status, let polling retry
    }

    await prisma.generationJob.update({
      where: { id: jobId },
      data: {
        status: "unknown",
        errorCode: "history_not_found",
        errorMessage: "Không tìm thấy job trong lịch sử ComfyUI. Runtime Colab có thể đã dừng.",
      },
    });
    return;
  }

  if (history.status === "running") {
    await prisma.generationJob.update({
      where: { id: jobId },
      data: { status: "running", startedAt: job.startedAt ?? new Date() },
    });
    return;
  }

  if (history.images.length === 0) {
    await prisma.generationJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        errorCode: "no_output_images",
        errorMessage: "ComfyUI báo hoàn thành nhưng không có ảnh output",
        finishedAt: new Date(),
      },
    });
    return;
  }

  const existingFilenames = new Set(job.images.map((image) => image.filename));

  // Khung chữ lịch/poster: vẽ chữ lên ảnh sau khi tải về (model chỉ gen ảnh sạch).
  const overlaySpec = job.overlaySpecJson
    ? overlaySpecSchema.safeParse(JSON.parse(job.overlaySpecJson))
    : null;

  await fs.mkdir(outputRoot, { recursive: true });

  try {
    for (const imageRef of history.images) {
      if (existingFilenames.has(imageRef.filename)) continue;

      let buffer: Buffer = Buffer.from(await client.viewImage(imageRef));
      let outFilename = buildOutputFilename(job.id, imageRef.filename);
      let mimeType = mimeTypeFromFilename(imageRef.filename);

      // Best-effort: overlay lỗi thì vẫn lưu ảnh gốc, không fail job.
      if (overlaySpec?.success) {
        try {
          buffer = await renderOverlay(buffer, overlaySpec.data);
          outFilename = outFilename.replace(/\.[^.]+$/, ".png");
          mimeType = "image/png";
        } catch (overlayError) {
          console.error(`[overlay] job=${job.id} file=${imageRef.filename}`, overlayError);
        }
      }

      const outPath = resolveSafePath(outputRoot, outFilename);
      await fs.writeFile(outPath, buffer);

      await prisma.generatedImage.create({
        data: {
          jobId: job.id,
          relativePath: outFilename,
          filename: imageRef.filename,
          mimeType,
        },
      });
    }
  } catch (error) {
    // Tải/lưu ảnh thất bại (timeout, tunnel interstitial, lỗi đĩa...). Đánh
    // dấu job này là "unknown" thay vì ném lỗi ra ngoài, để một job lỗi
    // không chặn việc đồng bộ các job khác trong cùng batch. Người dùng có
    // thể bấm "Thử lại" (regenerate) trên job này.
    const message = error instanceof Error ? error.message : "Lỗi không xác định khi tải ảnh output";
    const code = error instanceof ComfyApiError ? error.code : "download_failed";
    await prisma.generationJob.update({
      where: { id: jobId },
      data: { status: "unknown", errorCode: code, errorMessage: message },
    });
    return;
  }

  await prisma.generationJob.update({
    where: { id: jobId },
    data: { status: "completed", finishedAt: new Date(), errorCode: null, errorMessage: null },
  });
}

// Per-batch in-flight promises so concurrent callers (BatchTracker poll, the
// manual "Đồng bộ lại" button, and the background auto-sync poller) never run
// syncBatch for the same batch at the same time -- which could otherwise
// download the same output twice and create duplicate GeneratedImage rows.
const inFlightBatchSyncs = new Map<string, Promise<void>>();

export function syncBatchExclusive(batchId: string, client: ComfyClient, outputRoot: string): Promise<void> {
  const existing = inFlightBatchSyncs.get(batchId);
  if (existing) return existing;

  const run = syncBatch(batchId, client, outputRoot).finally(() => {
    inFlightBatchSyncs.delete(batchId);
  });
  inFlightBatchSyncs.set(batchId, run);
  return run;
}

export async function syncBatch(batchId: string, client: ComfyClient, outputRoot: string): Promise<void> {
  const jobs = await prisma.generationJob.findMany({ where: { batchId }, orderBy: { indexInBatch: "asc" } });
  for (const job of jobs) {
    try {
      await syncJob(job.id, client, outputRoot);
    } catch (error) {
      // Lỗi bất ngờ khi đồng bộ một job (vd lỗi DB) không được phép chặn
      // việc đồng bộ các job còn lại trong batch; job này sẽ được thử lại
      // ở lần poll kế tiếp.
      console.error(`syncJob thất bại cho job ${job.id}`, error);
    }
  }

  const updatedJobs = await prisma.generationJob.findMany({ where: { batchId } });
  const statuses = new Set(updatedJobs.map((job) => job.status));
  let batchStatus: "queued" | "running" | "completed" | "partial" | "failed";
  if (statuses.has("running") || statuses.has("queued")) {
    batchStatus = statuses.size === 1 ? (statuses.has("queued") ? "queued" : "running") : "running";
  } else if (statuses.has("failed") && statuses.has("completed")) {
    batchStatus = "partial";
  } else if (statuses.has("failed")) {
    batchStatus = "failed";
  } else {
    batchStatus = "completed";
  }

  await prisma.generationBatch.update({ where: { id: batchId }, data: { status: batchStatus } });
}
