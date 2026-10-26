import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { ComfyClient, ComfyApiError } from "@/lib/comfyui/client";
import { resolveSafePath, buildOutputFilename } from "@/lib/files/safe-output";

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

  await fs.mkdir(outputRoot, { recursive: true });

  for (const imageRef of history.images) {
    if (existingFilenames.has(imageRef.filename)) continue;

    const buffer = await client.viewImage(imageRef);
    const outFilename = buildOutputFilename(job.id, imageRef.filename);
    const outPath = resolveSafePath(outputRoot, outFilename);
    await fs.writeFile(outPath, Buffer.from(buffer));

    await prisma.generatedImage.create({
      data: {
        jobId: job.id,
        relativePath: outFilename,
        filename: imageRef.filename,
        mimeType: mimeTypeFromFilename(imageRef.filename),
      },
    });
  }

  await prisma.generationJob.update({
    where: { id: jobId },
    data: { status: "completed", finishedAt: new Date() },
  });
}

export async function syncBatch(batchId: string, client: ComfyClient, outputRoot: string): Promise<void> {
  const jobs = await prisma.generationJob.findMany({ where: { batchId } });
  for (const job of jobs) {
    await syncJob(job.id, client, outputRoot);
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
