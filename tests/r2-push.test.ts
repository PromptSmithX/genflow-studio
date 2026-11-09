import { describe, expect, it, vi, beforeEach } from "vitest";
import { pushBatches, isBatchEligible } from "@/lib/r2/push-batches";
import { prisma } from "@/lib/db";
import * as clientModule from "@/lib/r2/client";
import * as renderModule from "@/lib/r2/render-pages";
import * as skuModule from "@/lib/r2/sku";
import fs from "node:fs/promises";

vi.mock("@/lib/db", () => ({
  prisma: {
    generationBatch: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    appSettings: {
      findUnique: vi.fn().mockResolvedValue({ id: "main" }),
      upsert: vi.fn().mockResolvedValue({ id: "main" }),
    },
  },
}));

vi.mock("@/lib/settings", () => ({
  getOrCreateSettings: vi.fn().mockResolvedValue({
    outputDirectory: "data/outputs",
  }),
}));

vi.mock("@/lib/r2/config", () => ({
  readR2Config: vi.fn().mockReturnValue({
    accountId: "test-acc",
    accessKeyId: "test-key",
    secretAccessKey: "test-secret",
    bucket: "test-bucket",
    publicBaseUrl: "https://pub.r2.dev",
    keyPrefix: "calendars/anima",
  }),
  getR2Status: vi.fn().mockReturnValue({ configured: true, missing: [] }),
}));

vi.mock("@/lib/calendar/formats", () => ({
  listCalendarFormats: vi.fn().mockResolvedValue([
    { id: "premade_wall_11x8_5", label: '11x8.5"', widthPx: 3375, heightPx: 2625, dpi: 300 },
    { id: "premade_wall_14x11_5", label: '14x11.5"', widthPx: 4275, heightPx: 3525, dpi: 300 },
  ]),
}));

vi.mock("@/lib/r2/client", () => ({
  createR2Client: vi.fn().mockReturnValue({}),
  putObject: vi.fn().mockResolvedValue(undefined),
  headBucket: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/r2/render-pages", () => ({
  renderBatchPages: vi.fn(),
}));

vi.mock("@/lib/r2/sku", () => ({
  ensureSkuBase: vi.fn(),
  mediumCode: vi.fn().mockReturnValue("ANI"),
  buildSkuBase: vi.fn().mockReturnValue("CAL-ANI-2611-SF4U7"),
  fullSku: (base: string, size: string, variant: string) => `${base}-${size}-${variant}`,
}));

vi.mock("node:fs/promises", () => {
  const fns = {
    readFile: vi.fn(),
    readdir: vi.fn(),
    rm: vi.fn(),
    mkdir: vi.fn(),
    writeFile: vi.fn(),
  };
  return {
    ...fns,
    default: fns,
  };
});

describe("r2-push", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isBatchEligible", () => {
    it("returns false if missing etsyTitle", () => {
      const res = isBatchEligible({
        etsyTitle: null,
        mockupStatus: "done",
        jobs: [],
      });
      expect(res.eligible).toBe(false);
      expect(res.reason).toBe("Thiếu Etsy title");
    });

    it("returns false if mockupStatus is not done", () => {
      const res = isBatchEligible({
        etsyTitle: "Valid Title",
        mockupStatus: "failed",
        jobs: [],
      });
      expect(res.eligible).toBe(false);
      expect(res.reason).toBe("Chưa hoàn thành tạo mockup");
    });

    it("returns false if missing any of the 13 jobs (0..12)", () => {
      const jobs = Array.from({ length: 12 }, (_, i) => ({
        indexInBatch: i,
        status: "completed",
        images: [{ id: `img-${i}` }],
      }));
      const res = isBatchEligible({
        etsyTitle: "Valid Title",
        mockupStatus: "done",
        jobs, // missing slot 12
      });
      expect(res.eligible).toBe(false);
      expect(res.reason).toBe("Chưa đủ 13 ảnh hoàn thành");
    });

    it("returns true when having etsyTitle, mockupStatus done, and all 13 completed jobs", () => {
      const jobs = Array.from({ length: 13 }, (_, i) => ({
        indexInBatch: i,
        status: "completed",
        images: [{ id: `img-${i}` }],
      }));
      const res = isBatchEligible({
        etsyTitle: "Valid Title",
        mockupStatus: "done",
        jobs,
      });
      expect(res.eligible).toBe(true);
    });
  });

  describe("pushBatches", () => {
    const makeEligibleBatch = (id: string) => ({
      id,
      ideaPrompt: "Sample calendar idea prompt",
      createdAt: new Date(2026, 10, 6),
      etsyTitle: "Sample Calendar Title",
      etsyDescription: "Sample description",
      etsyTagsJson: JSON.stringify(["tag1", "tag2"]),
      mockupStatus: "done",
      r2SkuBase: null,
      r2Folder: null,
      jobs: Array.from({ length: 13 }, (_, i) => ({
        indexInBatch: i,
        status: "completed",
        images: [{ id: `img-${id}-${i}` }],
      })),
    });

    it("does not block other batches when one batch fails, performs exactly 61 uploads for successful batch, cleans up staging, updates DB, and writes CSV", async () => {
      const batch1 = makeEligibleBatch("batch-ok");
      const batch2 = makeEligibleBatch("batch-fail");

      vi.mocked(prisma.generationBatch.findUnique)
        .mockResolvedValueOnce(batch1 as unknown as never)
        .mockResolvedValueOnce(batch2 as unknown as never);

      vi.mocked(skuModule.ensureSkuBase)
        .mockResolvedValueOnce("CAL-ANI-2611-B1OK1")
        .mockResolvedValueOnce("CAL-ANI-2611-B2FL2");

      const mock14 = Array.from({ length: 14 }, (_, i) => `/tmp/p${i}.png`);
      vi.mocked(renderModule.renderBatchPages).mockImplementation(async (batchId) => {
        if (batchId === "batch-fail") {
          throw new Error("Render error on batch 2");
        }
        return { org: mock14, cen: mock14 };
      });

      // Mock preview files on disk
      vi.mocked(fs.readdir).mockResolvedValue([
        "00_mockup_covers.png",
        "01_mockup_q1.png",
        "02_mockup_q2.png",
        "03_mockup_q3.png",
        "04_mockup_q4.png",
      ] as unknown as never);
      vi.mocked(fs.readFile).mockResolvedValue(Buffer.from("fake-png-bytes"));
      vi.mocked(fs.rm).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined as unknown as string);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await pushBatches(["batch-ok", "batch-fail"]);

      // 1. One batch error does not block the other
      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toEqual({
        batchId: "batch-ok",
        ok: true,
        skuBase: "CAL-ANI-2611-B1OK1",
        rows: expect.any(Array),
      });
      expect(result.results[1].ok).toBe(false);
      expect(result.results[1].error).toContain("Render error on batch 2");

      // 2. Exactly 61 uploads for the successful batch (28 x 2 formats + 5 previews)
      expect(clientModule.putObject).toHaveBeenCalledTimes(61);
      // Object keys passed to putObject MUST NOT have ?v= query
      for (const call of vi.mocked(clientModule.putObject).mock.calls) {
        const key = call[2];
        expect(key).not.toContain("?v=");
        expect(key).not.toContain("&v=");
      }

      // URLs written to rows/CSV MUST have ?v= cache-busting timestamp
      const rows = result.results[0].rows!;
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        for (let i = 1; i <= 14; i++) {
          expect(row[i]).toMatch(/\?v=\d+$/);
        }
        for (let i = 15; i <= 19; i++) {
          expect(row[i]).toMatch(/\?v=\d+$/);
        }
      }

      // 3. Staging directory is cleaned up for BOTH batches (in finally block)
      expect(fs.rm).toHaveBeenCalledTimes(2);

      // 4. DB update is correct: batch 1 marked done, batch 2 marked failed
      expect(prisma.generationBatch.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "batch-ok" },
          data: expect.objectContaining({
            r2Status: "done",
            r2Error: null,
            r2SkuBase: "CAL-ANI-2611-B1OK1",
          }),
        }),
      );
      expect(prisma.generationBatch.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "batch-fail" },
          data: expect.objectContaining({
            r2Status: "failed",
            r2Error: "Render error on batch 2",
          }),
        }),
      );

      // 5. CSV is generated since batch 1 succeeded
      expect(result.csvFileName).toMatch(/^calendars_\d{8}_\d{6}_printify\.csv$/);
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it("returns csvFileName === null when all batches fail", async () => {
      const batchFail = makeEligibleBatch("batch-fail-all");
      vi.mocked(prisma.generationBatch.findUnique).mockResolvedValueOnce(batchFail as unknown as never);
      vi.mocked(skuModule.ensureSkuBase).mockResolvedValueOnce("CAL-ANI-2611-FAIL1");

      vi.mocked(renderModule.renderBatchPages).mockRejectedValueOnce(
        new Error("Fatal render error"),
      );

      const result = await pushBatches(["batch-fail-all"]);

      expect(result.results[0].ok).toBe(false);
      expect(result.csvFileName).toBeNull();
    });

    it("does not update DB when a batch is not eligible", async () => {
      const ineligibleBatch = {
        ...makeEligibleBatch("ineligible-batch"),
        etsyTitle: null,
      };
      vi.mocked(prisma.generationBatch.findUnique).mockResolvedValueOnce(
        ineligibleBatch as unknown as never,
      );

      const result = await pushBatches(["ineligible-batch"]);

      expect(result.results[0]).toEqual({
        batchId: "ineligible-batch",
        ok: false,
        error: "Thiếu Etsy title",
      });
      expect(prisma.generationBatch.update).not.toHaveBeenCalled();
    });

    it("persists r2Folder even when rendering or upload fails", async () => {
      const batchFail = makeEligibleBatch("batch-fail-folder");
      vi.mocked(prisma.generationBatch.findUnique).mockResolvedValueOnce(
        batchFail as unknown as never,
      );
      vi.mocked(skuModule.ensureSkuBase).mockResolvedValueOnce("CAL-ANI-2611-BFAIL");
      vi.mocked(renderModule.renderBatchPages).mockRejectedValueOnce(
        new Error("Render error"),
      );

      await pushBatches(["batch-fail-folder"]);

      expect(prisma.generationBatch.update).toHaveBeenCalledWith({
        where: { id: "batch-fail-folder" },
        data: {
          r2Folder: "2026/cal-ani-2611-bfail_sample-calendar-title",
        },
      });
    });
  });
});
