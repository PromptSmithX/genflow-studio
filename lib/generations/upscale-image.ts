import fs from "node:fs/promises";
import path from "node:path";
import type { GeneratedImage } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getOrCreateSettings } from "@/lib/settings";
import { resolveSafePath, buildBatchFolder } from "@/lib/files/safe-output";
import {
  resolveOutputRoot,
  resolveCensoredRoot,
  resolveUpscaledRoot,
  resolveUpscaledCensoredRoot,
  resolveBackCoverRoot,
  resolveFinalRoot,
} from "@/lib/output-dir";
import { upscaleToSize } from "@/lib/images/upscale";
import { listCalendarFormats, type CalendarFormat } from "@/lib/calendar/formats";
import { loadBackCoverGeometry } from "@/lib/calendar/back-cover-format";
import { composeBackCover } from "@/lib/images/back-cover";

interface UpscaleRoots {
  outputRoot: string;
  censoredRoot: string;
  upscaledRoot: string;
  upscaledCensoredRoot: string;
  backCoverRoot: string;
  finalRoot: string;
}

/**
 * Lõi dùng chung bởi upscale per-ảnh và upscale cả batch: phóng CẢ hai bản (gốc
 * + đã che nếu có) về đúng khổ `format`, ghi theo đúng cấu trúc folder của
 * relativePath hiện có (phẳng cho ảnh cũ, theo folder batch cho ảnh mới -- dùng
 * `mkdir(dirname(...))` nên không quan tâm cấu trúc). Lỗi ở bản đã che không
 * chặn bản gốc; lỗi ở bản gốc thì đánh dấu failed và ném lỗi ra ngoài.
 */
async function upscaleOneImage(image: GeneratedImage, format: CalendarFormat, roots: UpscaleRoots): Promise<GeneratedImage> {
  try {
    const src = await fs.readFile(resolveSafePath(roots.outputRoot, image.relativePath));
    const out = await upscaleToSize(src, format);
    const outPath = resolveSafePath(roots.upscaledRoot, image.relativePath);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, out);
  } catch (error) {
    await prisma.generatedImage.update({
      where: { id: image.id },
      data: { upscaleStatus: "failed", upscaleFormat: format.id },
    });
    throw error;
  }

  let upscaledMaskedRelativePath: string | null = null;
  if (image.maskedRelativePath) {
    try {
      const srcMasked = await fs.readFile(resolveSafePath(roots.censoredRoot, image.maskedRelativePath));
      const outMasked = await upscaleToSize(srcMasked, format);
      const outMaskedPath = resolveSafePath(roots.upscaledCensoredRoot, image.maskedRelativePath);
      await fs.mkdir(path.dirname(outMaskedPath), { recursive: true });
      await fs.writeFile(outMaskedPath, outMasked);
      upscaledMaskedRelativePath = image.maskedRelativePath;
    } catch (error) {
      console.error(`[upscale] bỏ qua bản đã che cho ảnh ${image.id}:`, error);
    }
  }

  return prisma.generatedImage.update({
    where: { id: image.id },
    data: {
      upscaledRelativePath: image.relativePath,
      upscaledMaskedRelativePath,
      upscaleStatus: "done",
      upscaledWidth: format.widthPx,
      upscaledHeight: format.heightPx,
      upscaleFormat: format.id,
    },
  });
}

async function resolveFormatOrThrow(formatId: string): Promise<CalendarFormat> {
  const formats = await listCalendarFormats();
  const format = formats.find((f) => f.id === formatId);
  if (!format) throw new Error(`Không tìm thấy khổ lịch "${formatId}"`);
  return format;
}

async function buildRoots(): Promise<UpscaleRoots> {
  const settings = await getOrCreateSettings();
  const outputRoot = resolveOutputRoot(settings);
  return {
    outputRoot,
    censoredRoot: resolveCensoredRoot(outputRoot),
    upscaledRoot: resolveUpscaledRoot(outputRoot),
    upscaledCensoredRoot: resolveUpscaledCensoredRoot(outputRoot),
    backCoverRoot: resolveBackCoverRoot(outputRoot),
    finalRoot: resolveFinalRoot(outputRoot),
  };
}

/**
 * Ghép bìa sau từ 12 artwork (job.indexInBatch 1-12) của batch, đọc từ ảnh
 * GỐC (không dùng bản đã che). Đây là bước phụ cộng thêm cuối `upscaleBatch`:
 * lỗi ở đây chỉ đánh dấu `backCoverStatus:"failed"` trên batch, không bao giờ
 * ném ra ngoài -- không được phép làm hỏng kết quả upscale của 13 ảnh chính.
 * Batch không có artwork nào (0 job indexInBatch >= 1) -> bỏ qua, trả "skipped".
 */
async function buildBackCover(
  batchId: string,
  format: CalendarFormat,
  roots: UpscaleRoots,
): Promise<"done" | "failed" | "skipped"> {
  try {
    const images = await prisma.generatedImage.findMany({
      where: { job: { batchId, indexInBatch: { gte: 1 } } },
      include: { job: true },
      orderBy: { job: { indexInBatch: "asc" } },
    });
    if (images.length === 0) return "skipped";

    const geom = await loadBackCoverGeometry(format.id);
    if (!geom) return "skipped";

    const buffers = await Promise.all(
      images.map((image) => fs.readFile(resolveSafePath(roots.outputRoot, image.relativePath))),
    );
    const composed = await composeBackCover(buffers, geom);

    const relativePath = path.posix.join(batchId, "back_cover.png");
    const outPath = resolveSafePath(roots.backCoverRoot, relativePath);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, composed);

    await prisma.generationBatch.update({
      where: { id: batchId },
      data: {
        backCoverRelativePath: relativePath,
        backCoverStatus: "done",
        backCoverFormat: format.id,
        backCoverWidth: geom.widthPx,
        backCoverHeight: geom.heightPx,
      },
    });
    return "done";
  } catch (error) {
    console.error(`[buildBackCover] lỗi ở batch ${batchId}:`, error);
    await prisma.generationBatch.update({
      where: { id: batchId },
      data: { backCoverStatus: "failed", backCoverFormat: format.id },
    });
    return "failed";
  }
}

function finalExportSlotName(indexInBatch: number): string {
  return indexInBatch === 0 ? "00_bia-truoc.png" : `${String(indexInBatch).padStart(2, "0")}.png`;
}

/**
 * Xuất bản COPY gọn gàng, sẵn sàng đem in cho một batch, thành 2 thư mục con
 * dưới `finalRoot/<slug>/`:
 * - `khong-che/`: 14 ảnh KHÔNG che (bìa trước + 12 artwork + bìa sau).
 * - `da-che/`: 13 ảnh ĐÃ che (bìa trước + 12 artwork) + bìa sau KHÔNG che.
 * `slug` tái tạo bằng `buildBatchFolder` (xác định, khớp đúng folder ComfyUI đã
 * ghi khi sync -- xem lib/comfyui/job-sync.ts). Đây là bước phụ CỘNG THÊM cuối
 * `upscaleBatch`, chỉ đọc dữ liệu đã có (không đụng upscale/censor/back-cover
 * logic); lỗi chỉ đánh dấu `finalExportStatus:"failed"`, không ném ra ngoài.
 * Thư mục con bị xoá sạch trước khi ghi lại để bấm lại không để lại rác.
 */
async function exportBatchFolders(batchId: string, roots: UpscaleRoots): Promise<"done" | "failed" | "skipped"> {
  try {
    const batch = await prisma.generationBatch.findUnique({ where: { id: batchId } });
    if (!batch) return "skipped";

    const images = await prisma.generatedImage.findMany({
      where: { job: { batchId } },
      include: { job: true },
      orderBy: { job: { indexInBatch: "asc" } },
    });
    if (images.length === 0) return "skipped";

    const slug = buildBatchFolder(batch);
    const uncensoredDir = path.join(roots.finalRoot, slug, "khong-che");
    const censoredDir = path.join(roots.finalRoot, slug, "da-che");

    await fs.rm(uncensoredDir, { recursive: true, force: true });
    await fs.rm(censoredDir, { recursive: true, force: true });
    await fs.mkdir(uncensoredDir, { recursive: true });
    await fs.mkdir(censoredDir, { recursive: true });

    for (const image of images) {
      const name = finalExportSlotName(image.job.indexInBatch);

      if (image.upscaledRelativePath) {
        try {
          const src = resolveSafePath(roots.upscaledRoot, image.upscaledRelativePath);
          await fs.copyFile(src, path.join(uncensoredDir, name));
        } catch (error) {
          console.error(`[exportBatchFolders] bỏ qua bản không che của ảnh ${image.id}:`, error);
        }
      }

      if (image.upscaledMaskedRelativePath) {
        try {
          const src = resolveSafePath(roots.upscaledCensoredRoot, image.upscaledMaskedRelativePath);
          await fs.copyFile(src, path.join(censoredDir, name));
        } catch (error) {
          console.error(`[exportBatchFolders] bỏ qua bản đã che của ảnh ${image.id}:`, error);
        }
      }
    }

    if (batch.backCoverStatus === "done" && batch.backCoverRelativePath) {
      try {
        const src = resolveSafePath(roots.backCoverRoot, batch.backCoverRelativePath);
        await fs.copyFile(src, path.join(uncensoredDir, "13_bia-sau.png"));
        await fs.copyFile(src, path.join(censoredDir, "13_bia-sau.png"));
      } catch (error) {
        console.error(`[exportBatchFolders] bỏ qua bìa sau của batch ${batchId}:`, error);
      }
    }

    await prisma.generationBatch.update({
      where: { id: batchId },
      data: { finalExportStatus: "done", finalExportRelativePath: slug },
    });
    return "done";
  } catch (error) {
    console.error(`[exportBatchFolders] lỗi ở batch ${batchId}:`, error);
    await prisma.generationBatch.update({
      where: { id: batchId },
      data: { finalExportStatus: "failed" },
    });
    return "failed";
  }
}

/**
 * Phóng một ảnh đã tạo về đúng khổ trang in của template lịch `formatId`, cho
 * CẢ hai bản: bản gốc (relativePath -> *_upscaled) và bản đã che nếu có
 * (maskedRelativePath -> *_upscaled_censored). Chạy nội suy cục bộ nên đồng bộ,
 * không cần polling.
 */
export async function upscaleGeneratedImage(imageId: string, formatId: string): Promise<GeneratedImage> {
  const image = await prisma.generatedImage.findUnique({ where: { id: imageId } });
  if (!image) throw new Error("Không tìm thấy ảnh cần upscale");

  const format = await resolveFormatOrThrow(formatId);
  const roots = await buildRoots();
  return upscaleOneImage(image, format, roots);
}

export interface UpscaleBatchResult {
  total: number;
  done: number;
  failed: number;
  backCover: "done" | "failed" | "skipped";
  finalExport: "done" | "failed" | "skipped";
}

/**
 * Upscale toàn bộ ảnh đã hoàn thành của một batch bằng 1 lệnh, thay vì bấm
 * từng ảnh -- tải settings/format một lần rồi lặp tuần tự (nội suy cục bộ rẻ,
 * tuần tự để không làm CPU nghẽn khi batch có 15 ảnh). Một ảnh lỗi không chặn
 * các ảnh còn lại trong batch.
 */
export async function upscaleBatch(batchId: string, formatId: string): Promise<UpscaleBatchResult> {
  const format = await resolveFormatOrThrow(formatId);
  const roots = await buildRoots();

  const images = await prisma.generatedImage.findMany({
    where: { job: { batchId } },
    orderBy: { createdAt: "asc" },
  });

  let done = 0;
  let failed = 0;
  for (const image of images) {
    try {
      await upscaleOneImage(image, format, roots);
      done += 1;
    } catch (error) {
      failed += 1;
      console.error(`[upscaleBatch] lỗi ở ảnh ${image.id}:`, error);
    }
  }

  const backCover = await buildBackCover(batchId, format, roots);
  const finalExport = await exportBatchFolders(batchId, roots);

  return { total: images.length, done, failed, backCover, finalExport };
}
