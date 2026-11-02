import fs from "node:fs/promises";
import path from "node:path";
import type { GeneratedImage } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getOrCreateSettings } from "@/lib/settings";
import { resolveSafePath } from "@/lib/files/safe-output";
import {
  resolveOutputRoot,
  resolveCensoredRoot,
  resolveUpscaledRoot,
  resolveUpscaledCensoredRoot,
} from "@/lib/output-dir";
import { upscaleToSize } from "@/lib/images/upscale";
import { listCalendarFormats, type CalendarFormat } from "@/lib/calendar/formats";

interface UpscaleRoots {
  outputRoot: string;
  censoredRoot: string;
  upscaledRoot: string;
  upscaledCensoredRoot: string;
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
  };
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

  return { total: images.length, done, failed };
}
