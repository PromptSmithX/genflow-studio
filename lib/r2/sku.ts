import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

export function mediumCode(name?: string | null): "ANI" | "REA" | "GEN" {
  if (!name) return "GEN";
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (normalized.includes("anime")) {
    return "ANI";
  }
  if (normalized.includes("thuc") || normalized.includes("real")) {
    return "REA";
  }
  return "GEN";
}

export function buildSkuBase(
  batch: { id: string; createdAt: Date | string },
  mediumName?: string | null,
  codeLength = 5,
): string {
  const med = mediumCode(mediumName);
  const d = new Date(batch.createdAt);
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yymm = `${yy}${mm}`;

  const cleanId = batch.id.replace(/[^a-zA-Z0-9]/g, "");
  const code = (cleanId.length >= codeLength ? cleanId.slice(-codeLength) : cleanId).toUpperCase();

  return `CAL-${med}-${yymm}-${code}`;
}

export function fullSku(
  base: string,
  sizeCode: "11" | "14" | string,
  variant: "CEN" | "ORG" | string,
): string {
  return `${base}-${sizeCode}-${variant}`;
}

export async function ensureSkuBase(batchId: string): Promise<string> {
  const batch = await prisma.generationBatch.findUnique({ where: { id: batchId } });
  if (!batch) {
    throw new Error(`Không tìm thấy batch "${batchId}"`);
  }
  if (batch.r2SkuBase) {
    return batch.r2SkuBase;
  }

  let mediumName: string | null = null;
  if (batch.mediumId) {
    const med = await prisma.mediumPreset.findUnique({ where: { id: batch.mediumId } });
    mediumName = med?.name ?? null;
  }

  const existing = await prisma.generationBatch.findMany({
    where: { r2SkuBase: { not: null }, id: { not: batchId } },
    select: { r2SkuBase: true },
  });
  const taken = new Set(existing.map((b) => b.r2SkuBase));

  let codeLength = 5;
  const maxCodeLength = batch.id.length + 5;

  for (;;) {
    let candidate = buildSkuBase(batch, mediumName, codeLength);
    while (taken.has(candidate) && codeLength <= maxCodeLength) {
      codeLength++;
      candidate = buildSkuBase(batch, mediumName, codeLength);
    }

    try {
      await prisma.generationBatch.update({
        where: { id: batchId },
        data: { r2SkuBase: candidate },
      });
      return candidate;
    } catch (error) {
      const isUniqueViolation = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (!isUniqueViolation || codeLength > maxCodeLength) throw error;
      // Một lần tạo batch khác vừa giành mất SKU này giữa lúc kiểm tra và ghi
      // (danh sách "taken" chỉ là ảnh chụp) -- mở rộng mã và thử lại.
      taken.add(candidate);
      codeLength++;
    }
  }
}
