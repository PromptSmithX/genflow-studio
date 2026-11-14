import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { getOrCreateSettings } from "@/lib/settings";
import { buildBatchFolder, resolveSafePath } from "@/lib/files/safe-output";
import { resolveFinalRoot, resolveOutputRoot, resolveResultsRoot } from "@/lib/output-dir";
import { listCalendarFormats } from "@/lib/calendar/formats";
import { mapFormatToR2 } from "@/lib/r2/formats";
import { renderBatchPages } from "@/lib/r2/render-pages";

const PREVIEW_COUNT = 5;

/** Tên mockup giống trên R2: bỏ số thứ tự đầu tên, đánh lại "01_".."05_". */
export function previewFileName(rawName: string, index: number): string {
  return `0${index + 1}_${rawName.replace(/^\d+_/, "")}`;
}

/**
 * Dựng thư mục kết quả trong đúng thư mục người dùng đã chọn (settings.outputDirectory):
 * "<slug>/{14x11.5,11x8.5}/" (14 trang org, tên như R2, KHÔNG có bản che), "<slug>/previews/"
 * (5 mockup) và "etsy.txt". Chỉ gọi lại renderBatchPages của R2 (orgOnly), không đụng luồng
 * đẩy R2 (vẫn dùng cả org+cen). Không bao giờ ném lỗi -- khâu xuất file in không được hỏng vì
 * bước này. Thư mục `dir` là thư mục của người dùng nên chỉ xoá đúng các mục mình tạo, không
 * xoá sạch cả `dir`.
 */
export async function buildResultsFolder(batchId: string): Promise<"done" | "failed" | "skipped"> {
  try {
    const batch = await prisma.generationBatch.findUnique({ where: { id: batchId } });
    if (!batch) return "skipped";

    const settings = await getOrCreateSettings();
    const outputRoot = resolveOutputRoot(settings);
    const slug = batch.finalExportRelativePath || buildBatchFolder(batch);
    const dir = resolveSafePath(resolveResultsRoot(settings), slug);
    const finalDir = resolveSafePath(resolveFinalRoot(outputRoot), slug);

    await fs.mkdir(dir, { recursive: true });

    for (const format of await listCalendarFormats()) {
      const r2Format = mapFormatToR2(format.id);
      if (!r2Format) continue;
      const sizeDir = path.join(dir, r2Format.size);
      await fs.rm(sizeDir, { recursive: true, force: true });
      await renderBatchPages(batchId, format, sizeDir, { orgOnly: true });
    }

    const mockupDir = path.join(finalDir, "mockup");
    const mockups = (await fs.readdir(mockupDir).catch(() => [] as string[]))
      .filter((name) => name.toLowerCase().endsWith(".png"))
      .sort()
      .slice(0, PREVIEW_COUNT);
    if (mockups.length > 0) {
      const previewsDir = path.join(dir, "previews");
      await fs.rm(previewsDir, { recursive: true, force: true });
      await fs.mkdir(previewsDir, { recursive: true });
      for (const [index, name] of mockups.entries()) {
        await fs.copyFile(path.join(mockupDir, name), path.join(previewsDir, previewFileName(name, index)));
      }
    }

    await fs.copyFile(path.join(finalDir, "etsy.txt"), path.join(dir, "etsy.txt")).catch(() => undefined);
    return "done";
  } catch (error) {
    console.error(`[buildResultsFolder] lỗi ở batch ${batchId}:`, error);
    return "failed";
  }
}
