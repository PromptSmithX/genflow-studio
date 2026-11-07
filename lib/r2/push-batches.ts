import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { prisma } from "@/lib/db";
import { getOrCreateSettings } from "@/lib/settings";
import { buildBatchFolder } from "@/lib/files/safe-output";
import { resolveOutputRoot, resolveFinalRoot } from "@/lib/output-dir";
import { listCalendarFormats } from "@/lib/calendar/formats";
import { readR2Config } from "./config";
import { createR2Client, putObject } from "./client";
import { ensureSkuBase } from "./sku";
import { buildR2Folder, pageKey, previewKey, publicUrl, PAGE_FILENAMES } from "./keys";
import { mapFormatToR2 } from "./formats";
import { renderBatchPages } from "./render-pages";
import { buildCsv, buildRowsForBatch, type BatchUrlsInput } from "./csv";

export interface EligibleCheckResult {
  eligible: boolean;
  reason?: string;
}

export function isBatchEligible(batch: {
  etsyTitle?: string | null;
  mockupStatus?: string | null;
  jobs?: Array<{
    indexInBatch: number;
    status: string;
    images?: Array<{ id: string }>;
  }>;
}): EligibleCheckResult {
  if (!batch.etsyTitle || !batch.etsyTitle.trim()) {
    return { eligible: false, reason: "Thiếu Etsy title" };
  }
  if (batch.mockupStatus !== "done") {
    return { eligible: false, reason: "Chưa hoàn thành tạo mockup" };
  }
  if (!batch.jobs) {
    return { eligible: false, reason: "Chưa đủ 13 ảnh hoàn thành" };
  }

  const completed = new Set<number>();
  for (const job of batch.jobs) {
    if (job.status === "completed" && job.images && job.images.length > 0) {
      completed.add(job.indexInBatch);
    }
  }

  for (let i = 0; i < 13; i++) {
    if (!completed.has(i)) {
      return { eligible: false, reason: "Chưa đủ 13 ảnh hoàn thành" };
    }
  }

  return { eligible: true };
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const executing = new Set<Promise<void>>();
  for (const item of items) {
    const p = fn(item).then(() => {
      executing.delete(p);
    });
    executing.add(p);
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
}

function formatLocalTimestamp(d: Date): string {
  const yyyy = d.getFullYear();
  const MM = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const HH = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}${MM}${dd}_${HH}${mm}${ss}`;
}

export interface PushBatchesResult {
  csvFileName: string | null;
  results: Array<{
    batchId: string;
    ok: boolean;
    skuBase?: string;
    error?: string;
  }>;
}

export async function pushBatches(batchIds: string[]): Promise<PushBatchesResult> {
  const config = readR2Config();
  const client = createR2Client(config);

  const settings = await getOrCreateSettings();
  const outputRoot = resolveOutputRoot(settings);
  const finalRoot = resolveFinalRoot(outputRoot);

  const allFormats = await listCalendarFormats();
  const formatsToRender = allFormats.filter((f) => mapFormatToR2(f.id) !== null);

  const results: PushBatchesResult["results"] = [];
  const successfulBatchInputs: BatchUrlsInput[] = [];

  for (const batchId of batchIds) {
    const batch = await prisma.generationBatch.findUnique({
      where: { id: batchId },
      include: {
        jobs: {
          include: { images: true },
        },
      },
    });

    if (!batch) {
      results.push({ batchId, ok: false, error: "Không tìm thấy batch" });
      continue;
    }

    const check = isBatchEligible(batch);
    if (!check.eligible) {
      const errorMsg = check.reason || "Bộ chưa đủ điều kiện";
      results.push({ batchId, ok: false, error: errorMsg });
      continue;
    }

    const stagingDir = path.join(os.tmpdir(), "anima-r2", batch.id);

    try {
      const skuBase = await ensureSkuBase(batch.id);
      const r2Folder = batch.r2Folder || buildR2Folder(skuBase, batch.createdAt, batch.etsyTitle);

      const batchUrlsInput: BatchUrlsInput = {
        skuBase,
        etsyTitle: batch.etsyTitle,
        etsyDescription: batch.etsyDescription,
        etsyTagsJson: batch.etsyTagsJson,
        pages: {
          "11": { cen: [], org: [] },
          "14": { cen: [], org: [] },
        },
        previews: [],
      };

      // 1. Render & upload 2 khổ
      for (const format of formatsToRender) {
        const info = mapFormatToR2(format.id)!;
        const sizeStaging = path.join(stagingDir, info.size);
        const { org, cen } = await renderBatchPages(batch.id, format, sizeStaging);

        const uploadTasks: Array<{ key: string; filePath: string }> = [];

        // Trang org
        for (let i = 0; i < PAGE_FILENAMES.length; i++) {
          const filename = PAGE_FILENAMES[i];
          const key = pageKey(config.keyPrefix, r2Folder, info.size, "org", filename);
          uploadTasks.push({ key, filePath: org[i] });
          batchUrlsInput.pages[info.code].org.push(publicUrl(config.publicBaseUrl, key));
        }

        // Trang cen
        for (let i = 0; i < PAGE_FILENAMES.length; i++) {
          const filename = PAGE_FILENAMES[i];
          const key = pageKey(config.keyPrefix, r2Folder, info.size, "cen", filename);
          uploadTasks.push({ key, filePath: cen[i] });
          batchUrlsInput.pages[info.code].cen.push(publicUrl(config.publicBaseUrl, key));
        }

        await runWithConcurrency(uploadTasks, 4, async ({ key, filePath }) => {
          const body = await fs.readFile(filePath);
          await putObject(client, config.bucket, key, body, "image/png", "public, max-age=3600");
        });
      }

      // 2. Upload 5 previews từ finalRoot/slug/mockup/
      const slug = batch.finalExportRelativePath || buildBatchFolder(batch);
      const mockupDir = path.join(finalRoot, slug, "mockup");
      const entries = await fs.readdir(mockupDir).catch(() => []);
      const pngs = entries.filter((name) => name.toLowerCase().endsWith(".png")).sort();

      if (pngs.length < 5) {
        throw new Error(`Thiếu ảnh mockup trong thư mục "${mockupDir}"`);
      }

      const previewTasks: Array<{ key: string; filePath: string }> = [];
      for (let i = 0; i < 5; i++) {
        const rawName = pngs[i];
        const cleanName = rawName.replace(/^\d+_/, "");
        const mappedName = `0${i + 1}_${cleanName}`;
        const key = previewKey(config.keyPrefix, r2Folder, mappedName);
        previewTasks.push({ key, filePath: path.join(mockupDir, rawName) });
        batchUrlsInput.previews.push(publicUrl(config.publicBaseUrl, key));
      }

      await runWithConcurrency(previewTasks, 4, async ({ key, filePath }) => {
        const body = await fs.readFile(filePath);
        await putObject(client, config.bucket, key, body, "image/png", "public, max-age=3600");
      });

      // 3. Cập nhật DB
      await prisma.generationBatch.update({
        where: { id: batch.id },
        data: {
          r2SkuBase: skuBase,
          r2Folder,
          r2Status: "done",
          r2PushedAt: new Date(),
          r2Error: null,
        },
      });

      results.push({ batchId: batch.id, ok: true, skuBase });
      successfulBatchInputs.push(batchUrlsInput);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await prisma.generationBatch.update({
        where: { id: batch.id },
        data: {
          r2Status: "failed",
          r2Error: errorMsg,
        },
      });
      results.push({ batchId: batch.id, ok: false, error: errorMsg });
    } finally {
      await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  // 4. Ghi CSV nếu có ít nhất 1 bộ thành công
  if (successfulBatchInputs.length === 0) {
    return { csvFileName: null, results };
  }

  const allRows: string[][] = [];
  for (const input of successfulBatchInputs) {
    allRows.push(...buildRowsForBatch(input));
  }

  const csvContent = buildCsv(allRows);
  const csvFileName = `calendars_${formatLocalTimestamp(new Date())}_printify.csv`;
  const exportsDir = path.join(finalRoot, "_r2_exports");
  await fs.mkdir(exportsDir, { recursive: true });
  await fs.writeFile(path.join(exportsDir, csvFileName), csvContent, "utf-8");

  return { csvFileName, results };
}
