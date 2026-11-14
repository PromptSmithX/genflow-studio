import { describe, expect, it, vi, beforeEach } from "vitest";
import { Prisma, type GenerationBatch } from "@prisma/client";
import { mediumCode, buildSkuBase, fullSku, ensureSkuBase } from "@/lib/r2/sku";
import { prisma } from "@/lib/db";

function uniqueConstraintError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "6.19.3",
  });
}

vi.mock("@/lib/db", () => ({
  prisma: {
    generationBatch: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    mediumPreset: {
      findUnique: vi.fn(),
    },
  },
}));

describe("r2-sku", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("mediumCode", () => {
    it("classifies anime medium names", () => {
      expect(mediumCode("Anime")).toBe("ANI");
      expect(mediumCode("Anime Cinematic")).toBe("ANI");
      expect(mediumCode("ANIME STYLE")).toBe("ANI");
    });

    it("classifies real person medium names with accents and without accents", () => {
      expect(mediumCode("Người thực")).toBe("REA");
      expect(mediumCode("anh thuc tế")).toBe("REA");
      expect(mediumCode("Realistic photo")).toBe("REA");
    });

    it("falls back to GEN for unknown or null mediums", () => {
      expect(mediumCode(null)).toBe("GEN");
      expect(mediumCode(undefined)).toBe("GEN");
      expect(mediumCode("Manga Art")).toBe("GEN");
      expect(mediumCode("")).toBe("GEN");
    });
  });

  describe("buildSkuBase and fullSku", () => {
    it("builds sku base with correct format CAL-{MED}-{YYMM}-{CODE}", () => {
      const batch = {
        id: "cmlabcdef123sf4u7",
        createdAt: new Date(2026, 10, 6), // Month is 0-indexed: 10 is Nov
      };
      const sku = buildSkuBase(batch, "Anime", 5);
      expect(sku).toBe("CAL-ANI-2611-SF4U7");
    });

    it("builds full SKU correctly", () => {
      expect(fullSku("CAL-ANI-2611-SF4U7", "11", "CEN")).toBe("CAL-ANI-2611-SF4U7-11-CEN");
      expect(fullSku("CAL-ANI-2611-SF4U7", "14", "ORG")).toBe("CAL-ANI-2611-SF4U7-14-ORG");
    });
  });

  describe("ensureSkuBase", () => {
    it("returns existing r2SkuBase if already present", async () => {
      vi.mocked(prisma.generationBatch.findUnique).mockResolvedValueOnce({
        id: "b1",
        r2SkuBase: "CAL-ANI-2611-EXIST",
      } as unknown as GenerationBatch);

      const sku = await ensureSkuBase("b1");
      expect(sku).toBe("CAL-ANI-2611-EXIST");
      expect(prisma.generationBatch.update).not.toHaveBeenCalled();
    });

    it("increases codeLength when collision occurs with another batch", async () => {
      const createdAt = new Date(2026, 10, 6);
      vi.mocked(prisma.generationBatch.findUnique).mockResolvedValueOnce({
        id: "batch123456789",
        createdAt,
        mediumId: null,
        r2SkuBase: null,
      } as unknown as GenerationBatch);

      // Suppose CAL-GEN-2611-56789 already exists in DB
      vi.mocked(prisma.generationBatch.findMany).mockResolvedValueOnce([
        { r2SkuBase: "CAL-GEN-2611-56789" },
      ] as unknown as GenerationBatch[]);

      vi.mocked(prisma.generationBatch.update).mockResolvedValueOnce({} as unknown as GenerationBatch);

      const sku = await ensureSkuBase("batch123456789");
      // 5 chars was 56789 (collision), 6 chars is 456789
      expect(sku).toBe("CAL-GEN-2611-456789");
      expect(prisma.generationBatch.update).toHaveBeenCalledWith({
        where: { id: "batch123456789" },
        data: { r2SkuBase: "CAL-GEN-2611-456789" },
      });
    });

    it("retries with a longer code when update hits a unique constraint race", async () => {
      const createdAt = new Date(2026, 10, 6);
      vi.mocked(prisma.generationBatch.findUnique).mockResolvedValueOnce({
        id: "batch123456789",
        createdAt,
        mediumId: null,
        r2SkuBase: null,
      } as unknown as GenerationBatch);

      vi.mocked(prisma.generationBatch.findMany).mockResolvedValueOnce([]);

      vi.mocked(prisma.generationBatch.update)
        .mockRejectedValueOnce(uniqueConstraintError())
        .mockResolvedValueOnce({} as unknown as GenerationBatch);

      const sku = await ensureSkuBase("batch123456789");
      // Lần đầu (5 ký tự "56789") đụng lỗi unique -- do một batch khác vừa
      // giành mất giữa lúc kiểm tra và ghi -- nên mở rộng lên 6 ký tự.
      expect(sku).toBe("CAL-GEN-2611-456789");
      expect(prisma.generationBatch.update).toHaveBeenCalledTimes(2);
      expect(prisma.generationBatch.update).toHaveBeenNthCalledWith(1, {
        where: { id: "batch123456789" },
        data: { r2SkuBase: "CAL-GEN-2611-56789" },
      });
      expect(prisma.generationBatch.update).toHaveBeenNthCalledWith(2, {
        where: { id: "batch123456789" },
        data: { r2SkuBase: "CAL-GEN-2611-456789" },
      });
    });

    it("rethrows a non-unique-constraint error from update without retrying", async () => {
      const createdAt = new Date(2026, 10, 6);
      vi.mocked(prisma.generationBatch.findUnique).mockResolvedValueOnce({
        id: "batch123456789",
        createdAt,
        mediumId: null,
        r2SkuBase: null,
      } as unknown as GenerationBatch);
      vi.mocked(prisma.generationBatch.findMany).mockResolvedValueOnce([]);
      vi.mocked(prisma.generationBatch.update).mockRejectedValueOnce(new Error("db down"));

      await expect(ensureSkuBase("batch123456789")).rejects.toThrow("db down");
      expect(prisma.generationBatch.update).toHaveBeenCalledTimes(1);
    });
  });
});
