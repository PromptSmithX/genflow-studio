import { describe, expect, it, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { upscaleBatch } from "@/lib/generations/upscale-image";
import { pushBatches } from "@/lib/r2/push-batches";
import { syncBatchToSheet } from "@/lib/sheets/sync";
import { getOrCreateSettings } from "@/lib/settings";
import { runAutoPublish, runAutoPublishExclusive } from "@/lib/pipeline/auto-publish";

vi.mock("@/lib/db", () => ({
  prisma: {
    generationBatch: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/settings", () => ({
  getOrCreateSettings: vi.fn(),
}));

vi.mock("@/lib/generations/upscale-image", () => ({
  upscaleBatch: vi.fn(),
}));

vi.mock("@/lib/r2/push-batches", () => ({
  pushBatches: vi.fn(),
}));

vi.mock("@/lib/sheets/sync", () => ({
  syncBatchToSheet: vi.fn(),
}));

describe("auto-publish", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getOrCreateSettings).mockResolvedValue({
      id: "main",
      autoPublish: true,
      autoFormatId: "premade_wall_11x8_5",
    } as unknown as never);

    vi.mocked(prisma.generationBatch.update).mockResolvedValue({} as unknown as never);
  });

  it("happy path: sets processing -> done, calls upscaleBatch, pushBatches, syncBatchToSheet", async () => {
    vi.mocked(prisma.generationBatch.findUnique).mockResolvedValue({
      id: "batch-1",
      requestedCount: 13,
      etsyTitle: "Beautiful 2026 Calendar",
      r2SkuBase: "CAL-ANI-2611-B1OK1",
    } as unknown as never);

    vi.mocked(upscaleBatch).mockResolvedValue({
      total: 13,
      done: 13,
      failed: 0,
      backCover: "done",
      finalExport: "done",
      mockup: "done", resultsFolder: "done",
    });

    vi.mocked(pushBatches).mockResolvedValue({
      csvFileName: "export.csv",
      results: [
        {
          batchId: "batch-1",
          ok: true,
          skuBase: "CAL-ANI-2611-B1OK1",
          rows: [["row1"], ["row2"]],
        },
      ],
    });

    vi.mocked(syncBatchToSheet).mockResolvedValue("done");

    const result = await runAutoPublish("batch-1");

    expect(result.status).toBe("done");
    expect(result.error).toBeNull();

    // Check step 1: set processing
    expect(prisma.generationBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "batch-1" },
        data: expect.objectContaining({ autoStatus: "processing", autoStage: null, autoError: null }),
      }),
    );

    // Check autoStage set before upscaleBatch
    expect(prisma.generationBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "batch-1" },
        data: { autoStage: "export" },
      }),
    );

    // Check upscale called with formatId
    expect(upscaleBatch).toHaveBeenCalledWith("batch-1", "premade_wall_11x8_5");

    // Check autoStage set before pushBatches
    expect(prisma.generationBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "batch-1" },
        data: { autoStage: "r2" },
      }),
    );

    // Check push called
    expect(pushBatches).toHaveBeenCalledWith(["batch-1"]);

    // Check autoStage set before syncBatchToSheet
    expect(prisma.generationBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "batch-1" },
        data: { autoStage: "sheet" },
      }),
    );

    // Check sheet sync called with rows
    expect(syncBatchToSheet).toHaveBeenCalledWith({
      batchId: "batch-1",
      rows: [["row1"], ["row2"]],
    });

    // Check step 6: set done
    expect(prisma.generationBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "batch-1" },
        data: expect.objectContaining({
          autoStatus: "done",
          autoStage: null,
          autoError: null,
          autoFinishedAt: expect.any(Date),
        }),
      }),
    );
  });

  it("skipped when requestedCount !== 13", async () => {
    vi.mocked(prisma.generationBatch.findUnique).mockResolvedValue({
      id: "batch-2",
      requestedCount: 4,
      etsyTitle: "Short Batch",
    } as unknown as never);

    const result = await runAutoPublish("batch-2");

    expect(result.status).toBe("skipped");
    expect(upscaleBatch).not.toHaveBeenCalled();
    expect(syncBatchToSheet).not.toHaveBeenCalled();

    expect(prisma.generationBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "batch-2" },
        data: expect.objectContaining({
          autoStatus: "skipped",
          autoStage: null,
          autoError: expect.stringContaining("requestedCount = 4"),
        }),
      }),
    );
  });

  it("skipped when missing etsyTitle", async () => {
    vi.mocked(prisma.generationBatch.findUnique).mockResolvedValue({
      id: "batch-3",
      requestedCount: 13,
      etsyTitle: "   ",
    } as unknown as never);

    const result = await runAutoPublish("batch-3");

    expect(result.status).toBe("skipped");
    expect(upscaleBatch).not.toHaveBeenCalled();
    expect(syncBatchToSheet).not.toHaveBeenCalled();

    expect(prisma.generationBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "batch-3" },
        data: expect.objectContaining({
          autoStatus: "skipped",
          autoStage: null,
          autoError: "Batch thiếu Etsy title",
        }),
      }),
    );
  });

  it("fails when upscale or mockup fails", async () => {
    vi.mocked(prisma.generationBatch.findUnique).mockResolvedValue({
      id: "batch-4",
      requestedCount: 13,
      etsyTitle: "Valid Title",
      r2SkuBase: null,
    } as unknown as never);

    vi.mocked(upscaleBatch).mockResolvedValue({
      total: 13,
      done: 13,
      failed: 0,
      backCover: "done",
      finalExport: "done",
      mockup: "failed", resultsFolder: "skipped",
    });

    const result = await runAutoPublish("batch-4");

    expect(result.status).toBe("failed");
    expect(pushBatches).not.toHaveBeenCalled();

    expect(prisma.generationBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "batch-4" },
        data: expect.objectContaining({
          autoStatus: "failed",
          autoError: expect.stringContaining("mockup"),
        }),
      }),
    );
  });

  it("fails with specific reason when mockup fails with mockupError", async () => {
    vi.mocked(prisma.generationBatch.findUnique).mockResolvedValue({
      id: "batch-mockup-err",
      requestedCount: 13,
      etsyTitle: "Valid Title",
      r2SkuBase: null,
    } as unknown as never);

    vi.mocked(upscaleBatch).mockResolvedValue({
      total: 13,
      done: 13,
      failed: 0,
      backCover: "done",
      finalExport: "done",
      mockup: "failed", resultsFolder: "skipped",
      mockupError: "Không tìm thấy Python để tạo mockup (MOCKUP_PYTHON=python.exe)",
    });

    const result = await runAutoPublish("batch-mockup-err");

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Không tìm thấy Python để tạo mockup (MOCKUP_PYTHON=python.exe)");
    expect(prisma.generationBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "batch-mockup-err" },
        data: expect.objectContaining({
          autoStatus: "failed",
          autoError: expect.stringContaining("Không tìm thấy Python để tạo mockup (MOCKUP_PYTHON=python.exe)"),
        }),
      }),
    );
  });

  it("fails when push fails, still syncs error to Sheet if batch has r2SkuBase", async () => {
    vi.mocked(prisma.generationBatch.findUnique).mockResolvedValue({
      id: "batch-5",
      requestedCount: 13,
      etsyTitle: "Valid Title",
      r2SkuBase: "CAL-ANI-2611-B5SKU",
    } as unknown as never);

    vi.mocked(upscaleBatch).mockResolvedValue({
      total: 13,
      done: 13,
      failed: 0,
      backCover: "done",
      finalExport: "done",
      mockup: "done", resultsFolder: "done",
    });

    vi.mocked(pushBatches).mockResolvedValue({
      csvFileName: null,
      results: [{ batchId: "batch-5", ok: false, error: "Network timeout while uploading" }],
    });

    const result = await runAutoPublish("batch-5");

    expect(result.status).toBe("failed");
    expect(syncBatchToSheet).toHaveBeenCalledWith({
      batchId: "batch-5",
      error: "Network timeout while uploading",
    });

    expect(prisma.generationBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "batch-5" },
        data: expect.objectContaining({
          autoStatus: "failed",
          autoError: "Network timeout while uploading",
        }),
      }),
    );
  });

  it("Sheet error does not fail pipeline: stays done with autoError message", async () => {
    vi.mocked(prisma.generationBatch.findUnique).mockResolvedValue({
      id: "batch-6",
      requestedCount: 13,
      etsyTitle: "Valid Title",
      r2SkuBase: "CAL-ANI-2611-B6SKU",
    } as unknown as never);

    vi.mocked(upscaleBatch).mockResolvedValue({
      total: 13,
      done: 13,
      failed: 0,
      backCover: "done",
      finalExport: "done",
      mockup: "done", resultsFolder: "done",
    });

    vi.mocked(pushBatches).mockResolvedValue({
      csvFileName: "export.csv",
      results: [
        {
          batchId: "batch-6",
          ok: true,
          skuBase: "CAL-ANI-2611-B6SKU",
          rows: [["row1"]],
        },
      ],
    });

    vi.mocked(syncBatchToSheet).mockRejectedValue(new Error("Permission denied on Google Sheet"));

    const result = await runAutoPublish("batch-6");

    expect(result.status).toBe("done");
    expect(result.error).toContain("Đã đẩy R2 nhưng ghi Google Sheet lỗi");
    expect(result.error).toContain("Permission denied on Google Sheet");

    expect(prisma.generationBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "batch-6" },
        data: expect.objectContaining({
          autoStatus: "done",
          autoStage: null,
          autoError: expect.stringContaining("Đã đẩy R2 nhưng ghi Google Sheet lỗi"),
        }),
      }),
    );
  });

  it("runAutoPublishExclusive in-flight lock prevents duplicate executions for same batch", async () => {
    let resolveBatch: (val: {
      total: number;
      done: number;
      failed: number;
      backCover: "done";
      finalExport: "done";
      mockup: "done";
    }) => void = () => {};
    const slowUpscalePromise = new Promise<{
      total: number;
      done: number;
      failed: number;
      backCover: "done";
      finalExport: "done";
      mockup: "done";
    }>((resolve) => {
      resolveBatch = resolve;
    });

    vi.mocked(prisma.generationBatch.findUnique).mockResolvedValue({
      id: "batch-lock",
      requestedCount: 13,
      etsyTitle: "Lock Title",
    } as unknown as never);

    vi.mocked(upscaleBatch).mockReturnValue(slowUpscalePromise as unknown as never);
    vi.mocked(pushBatches).mockResolvedValue({
      csvFileName: "out.csv",
      results: [{ batchId: "batch-lock", ok: true, rows: [] }],
    });
    vi.mocked(syncBatchToSheet).mockResolvedValue("done");

    const call1 = runAutoPublishExclusive("batch-lock");
    const call2 = runAutoPublishExclusive("batch-lock");

    // Both calls return the exact same promise instance
    expect(call1).toBe(call2);

    resolveBatch({
      total: 13,
      done: 13,
      failed: 0,
      backCover: "done",
      finalExport: "done",
      mockup: "done",
    });

    const [res1, res2] = await Promise.all([call1, call2]);
    expect(res1.status).toBe("done");
    expect(res2.status).toBe("done");
    expect(upscaleBatch).toHaveBeenCalledTimes(1);
  });
});
