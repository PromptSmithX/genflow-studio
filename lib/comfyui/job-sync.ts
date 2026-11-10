import fs from "node:fs/promises";
import path from "node:path";
import type { S3Client } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import {
  RunpodClient,
  RunpodApiError,
  type RunpodJobResult,
  type RunpodOutputImage,
} from "./runpod-client";
import { resolveSafePath, buildOutputFilename, buildBatchFolder } from "@/lib/files/safe-output";
import { resolveCensoredRoot } from "@/lib/output-dir";
import { censorImages } from "@/lib/censor/run-censor";
import { readR2Config, type R2Config } from "@/lib/r2/config";
import { createR2Client, getObjectBuffer, deleteObject, RUNPOD_OUTPUT_PREFIX } from "@/lib/r2/client";

export const UNKNOWN_GIVE_UP_MS = 2 * 60 * 60 * 1000;

function resolveUnknownOrFailed(
  job: { submittedAt?: Date | null; createdAt: Date },
  fallbackCode: string,
  fallbackMessage: string,
) {
  const since = job.submittedAt ?? job.createdAt;
  if (Date.now() - since.getTime() > UNKNOWN_GIVE_UP_MS) {
    return {
      status: "failed" as const,
      errorCode: "sync_timeout",
      errorMessage: "Không đồng bộ được kết quả sau 2 giờ — bấm Tạo lại",
      finishedAt: new Date(),
    };
  }
  return {
    status: "unknown" as const,
    errorCode: fallbackCode,
    errorMessage: fallbackMessage,
  };
}

export async function syncJob(jobId: string, client: RunpodClient, outputRoot: string): Promise<void> {
  const job = await prisma.generationJob.findUnique({
    where: { id: jobId },
    include: { images: true, batch: true },
  });
  if (!job) return;
  if (job.status === "completed" || job.status === "failed") return;
  if (!job.promptId) return;

  let result: RunpodJobResult;
  try {
    result = await client.getJobResult(job.promptId);
  } catch (error) {
    if (error instanceof RunpodApiError) {
      await prisma.generationJob.update({
        where: { id: jobId },
        data: resolveUnknownOrFailed(job, error.code, error.message),
      });
      return;
    }
    throw error;
  }

  if (result.status === "IN_QUEUE") {
    return;
  }

  if (result.status === "IN_PROGRESS") {
    await prisma.generationJob.update({
      where: { id: jobId },
      data: { status: "running", startedAt: job.startedAt ?? new Date(), errorCode: null, errorMessage: null },
    });
    return;
  }

  if (result.status === "FAILED" || result.status === "CANCELLED" || result.status === "TIMED_OUT") {
    const errorCodeMap = {
      FAILED: "runpod_failed",
      CANCELLED: "runpod_cancelled",
      TIMED_OUT: "runpod_timed_out",
    } as const;
    const defaultMsgMap = {
      FAILED: "Lỗi xử lý trên RunPod Serverless",
      CANCELLED: "Job đã bị hủy trên RunPod",
      TIMED_OUT: "Job quá thời gian chờ trên RunPod",
    };
    await prisma.generationJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        errorCode: errorCodeMap[result.status],
        errorMessage: result.error ?? defaultMsgMap[result.status],
        finishedAt: new Date(),
      },
    });
    return;
  }

  if (result.status === "NOT_FOUND") {
    let recoveredImages: RunpodOutputImage[] | null = null;
    try {
      const r2Config = readR2Config();
      const r2Client = createR2Client(r2Config);
      const prefix = RUNPOD_OUTPUT_PREFIX;
      const origKey = `${prefix}/${job.promptId}/0.png`;
      const maskedKey = `${prefix}/${job.promptId}/0.masked.png`;

      const origBuf = await getObjectBuffer(r2Client, r2Config.bucket, origKey);
      if (origBuf) {
        const maskedBuf = await getObjectBuffer(r2Client, r2Config.bucket, maskedKey);
        recoveredImages = [
          {
            index: 0,
            filename: `${job.promptId}_0.png`,
            key: origKey,
            masked_key: maskedBuf ? maskedKey : null,
            mask_status: maskedBuf ? "censored" : "failed",
            width: null,
            height: null,
          },
        ];
      }
    } catch {
      // R2 unconfigured or error
    }

    if (recoveredImages && recoveredImages.length > 0) {
      result = { status: "COMPLETED", images: recoveredImages };
    } else {
      const since = job.submittedAt ?? job.createdAt;
      const GRACE_MS = 120_000;
      if (Date.now() - since.getTime() < GRACE_MS) {
        return;
      }
      await prisma.generationJob.update({
        where: { id: jobId },
        data: {
          status: "failed",
          errorCode: "result_expired",
          errorMessage: "Không còn kết quả trên RunPod (quá 30 phút) — bấm Tạo lại",
          finishedAt: new Date(),
        },
      });
      return;
    }
  }

  if (result.status === "COMPLETED" && result.images.length === 0) {
    await prisma.generationJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        errorCode: "no_output_images",
        errorMessage: "RunPod báo hoàn thành nhưng không có ảnh output",
        finishedAt: new Date(),
      },
    });
    return;
  }

  let r2Config: R2Config;
  let r2Client: S3Client;
  try {
    r2Config = readR2Config();
    r2Client = createR2Client(r2Config);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chưa cấu hình Cloudflare R2";
    await prisma.generationJob.update({
      where: { id: jobId },
      data: resolveUnknownOrFailed(job, "download_failed", message),
    });
    return;
  }

  const existingFilenames = new Set(job.images.map((image) => image.filename));
  const censoredRoot = resolveCensoredRoot(outputRoot);
  const batchFolder = buildBatchFolder(job.batch);
  const keysToDelete: string[] = [];

  try {
    for (const image of result.images) {
      if (existingFilenames.has(image.filename)) {
        if (image.key) keysToDelete.push(image.key);
        if (image.masked_key) keysToDelete.push(image.masked_key);
        continue;
      }

      const rawBuffer = await getObjectBuffer(r2Client, r2Config.bucket, image.key);
      if (!rawBuffer) {
        await prisma.generationJob.update({
          where: { id: jobId },
          data: resolveUnknownOrFailed(
            job,
            "download_failed",
            "Không thể tải ảnh từ Cloudflare R2",
          ),
        });
        return;
      }
      keysToDelete.push(image.key);

      const outRelativePath = `${batchFolder}/${buildOutputFilename(job.id, image.filename)}`;
      const outPath = resolveSafePath(outputRoot, outRelativePath);
      await fs.mkdir(path.dirname(outPath), { recursive: true });
      await fs.writeFile(outPath, rawBuffer);

      const created = await prisma.generatedImage.create({
        data: {
          jobId: job.id,
          relativePath: outRelativePath,
          filename: image.filename,
          mimeType: "image/png",
          width: image.width,
          height: image.height,
        },
      });

      let hasMasked = false;
      if (image.masked_key && image.mask_status !== "failed") {
        keysToDelete.push(image.masked_key);
        try {
          const maskedBuffer = await getObjectBuffer(r2Client, r2Config.bucket, image.masked_key);
          if (maskedBuffer) {
            const maskedOutPath = resolveSafePath(censoredRoot, outRelativePath);
            await fs.mkdir(path.dirname(maskedOutPath), { recursive: true });
            await fs.writeFile(maskedOutPath, maskedBuffer);
            await prisma.generatedImage.update({
              where: { id: created.id },
              data: {
                maskStatus: image.mask_status,
                maskedRelativePath: outRelativePath,
              },
            });
            hasMasked = true;
          }
        } catch (maskedErr) {
          console.warn(`[job-sync] Tải ảnh che thất bại cho job ${job.id}:`, maskedErr);
        }
      }

      if (!hasMasked) {
        try {
          const maskedOutPath = resolveSafePath(censoredRoot, outRelativePath);
          await fs.mkdir(path.dirname(maskedOutPath), { recursive: true });
          const results = await censorImages([{
            input: outPath,
            output: maskedOutPath,
          }]);
          const censorResult = results[0];
          if (censorResult) {
            const hasMaskedFile = censorResult.status === "censored" || censorResult.status === "clean";
            await prisma.generatedImage.update({
              where: { id: created.id },
              data: {
                maskStatus: censorResult.status,
                maskedRelativePath: hasMaskedFile ? outRelativePath : null,
              },
            });
          }
        } catch (censorErr) {
          console.error(`[job-sync] Fallback censor thất bại cho job ${job.id}:`, censorErr);
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lỗi không xác định khi lưu ảnh output";
    await prisma.generationJob.update({
      where: { id: jobId },
      data: resolveUnknownOrFailed(job, "download_failed", message),
    });
    return;
  }

  for (const key of keysToDelete) {
    try {
      await deleteObject(r2Client, r2Config.bucket, key);
    } catch (err) {
      console.warn(`[job-sync] Không thể xóa object ${key} trên R2:`, err);
    }
  }

  await prisma.generationJob.update({
    where: { id: jobId },
    data: { status: "completed", finishedAt: new Date(), errorCode: null, errorMessage: null },
  });
}

const inFlightBatchSyncs = new Map<string, Promise<void>>();

export function syncBatchExclusive(batchId: string, client: RunpodClient, outputRoot: string): Promise<void> {
  const existing = inFlightBatchSyncs.get(batchId);
  if (existing) return existing;

  const run = syncBatch(batchId, client, outputRoot).finally(() => {
    inFlightBatchSyncs.delete(batchId);
  });
  inFlightBatchSyncs.set(batchId, run);
  return run;
}

export async function syncBatch(batchId: string, client: RunpodClient, outputRoot: string): Promise<void> {
  const jobs = await prisma.generationJob.findMany({ where: { batchId }, orderBy: { indexInBatch: "asc" } });
  for (const job of jobs) {
    try {
      await syncJob(job.id, client, outputRoot);
    } catch (error) {
      console.error(`syncJob thất bại cho job ${job.id}`, error);
    }
  }

  const updatedJobs = await prisma.generationJob.findMany({ where: { batchId } });
  const statuses = new Set(
    updatedJobs.map((job) => {
      if (job.status === "unknown" && job.promptId) {
        return "running";
      }
      return job.status;
    }),
  );
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
