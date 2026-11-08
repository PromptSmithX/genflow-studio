import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { getOrCreateSettings } from "@/lib/settings";
import { resolveSafePath } from "@/lib/files/safe-output";
import { resolveOutputRoot, resolveCensoredRoot } from "@/lib/output-dir";
import { upscaleToSize } from "@/lib/images/upscale";
import type { CalendarFormat } from "@/lib/calendar/formats";
import { loadBackCoverGeometry } from "@/lib/calendar/back-cover-format";
import { composeBackCover } from "@/lib/images/back-cover";
import { PAGE_FILENAMES } from "./keys";

export async function renderBatchPages(
  batchId: string,
  format: CalendarFormat,
  stagingDir: string,
): Promise<{ cen: string[]; org: string[] }> {
  const settings = await getOrCreateSettings();
  const outputRoot = resolveOutputRoot(settings);
  const censoredRoot = resolveCensoredRoot(outputRoot);

  const images = await prisma.generatedImage.findMany({
    where: { job: { batchId } },
    include: { job: true },
    orderBy: { job: { indexInBatch: "asc" } },
  });

  const slotMap = new Map<number, (typeof images)[number]>();
  for (const img of images) {
    if (img.job && typeof img.job.indexInBatch === "number") {
      slotMap.set(img.job.indexInBatch, img);
    }
  }

  for (let slot = 0; slot <= 12; slot++) {
    if (!slotMap.has(slot)) {
      throw new Error(`Thiếu ảnh cho slot ${slot} trong batch ${batchId}`);
    }
  }

  const cenDir = path.join(stagingDir, "cen");
  const orgDir = path.join(stagingDir, "org");
  await fs.mkdir(cenDir, { recursive: true });
  await fs.mkdir(orgDir, { recursive: true });

  // 1. Render 13 trang artwork (0..12)
  for (let slot = 0; slot <= 12; slot++) {
    const img = slotMap.get(slot)!;
    const filename = PAGE_FILENAMES[slot];

    const srcOrg = await fs.readFile(resolveSafePath(outputRoot, img.relativePath));
    const upscaledOrg = await upscaleToSize(srcOrg, format);
    await fs.writeFile(path.join(orgDir, filename), upscaledOrg);

    if (img.maskedRelativePath) {
      try {
        const srcCen = await fs.readFile(resolveSafePath(censoredRoot, img.maskedRelativePath));
        const upscaledCen = await upscaleToSize(srcCen, format);
        await fs.writeFile(path.join(cenDir, filename), upscaledCen);
      } catch {
        // Nếu lỗi đọc/upscale bản che thì dùng bản không che
        await fs.writeFile(path.join(cenDir, filename), upscaledOrg);
      }
    } else {
      await fs.writeFile(path.join(cenDir, filename), upscaledOrg);
    }
  }

  // 2. Render bìa sau (back cover)
  const geom = await loadBackCoverGeometry(format.id);
  if (!geom) {
    throw new Error(`Không load được cấu hình bìa sau cho khổ ${format.id}`);
  }

  const orgArtBuffers = await Promise.all(
    Array.from({ length: 12 }, (_, i) => {
      const artImg = slotMap.get(i + 1)!;
      return fs.readFile(resolveSafePath(outputRoot, artImg.relativePath));
    }),
  );
  const composedOrg = await composeBackCover(orgArtBuffers, geom);
  await fs.writeFile(path.join(orgDir, PAGE_FILENAMES[13]), composedOrg);

  const cenArtBuffers = await Promise.all(
    Array.from({ length: 12 }, (_, i) => {
      const artImg = slotMap.get(i + 1)!;
      if (artImg.maskedRelativePath) {
        return fs.readFile(resolveSafePath(censoredRoot, artImg.maskedRelativePath)).catch(() => orgArtBuffers[i]);
      }
      return Promise.resolve(orgArtBuffers[i]);
    }),
  );
  const composedCen = await composeBackCover(cenArtBuffers, geom);
  await fs.writeFile(path.join(cenDir, PAGE_FILENAMES[13]), composedCen);

  const org = PAGE_FILENAMES.map((f) => path.join(orgDir, f));
  const cen = PAGE_FILENAMES.map((f) => path.join(cenDir, f));

  return { org, cen };
}
