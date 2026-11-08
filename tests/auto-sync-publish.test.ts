import { describe, expect, it, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { getOrCreateSettings } from "@/lib/settings";
import { regenerateJobFreshPrompt } from "@/lib/generations/regenerate-fresh";
import { runAutoPublishExclusive } from "@/lib/pipeline/auto-publish";
import { syncBatchToSheet } from "@/lib/sheets/sync";
import {
  runSyncTick,
  resetAutoSyncStateForTest,
  autoSyncState,
} from "@/lib/comfyui/auto-sync";

vi.mock("@/lib/db", () => ({
  prisma: {
    generationBatch: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    generationJob: {
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/settings", () => ({
  getOrCreateSettings: vi.fn(),
}));

vi.mock("@/lib/comfyui/job-sync", () => ({
  syncBatchExclusive: vi.fn(),
}));

vi.mock("@/lib/generations/regenerate-fresh", () => ({
  regenerateJobFreshPrompt: vi.fn(),
}));

vi.mock("@/lib/pipeline/auto-publish", () => ({
  runAutoPublishExclusive: vi.fn(),
}));

vi.mock("@/lib/sheets/sync", () => ({
  syncBatchToSheet: vi.fn(),
}));

describe("auto-sync-publish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAutoSyncStateForTest();

    vi.mocked(getOrCreateSettings).mockResolvedValue({
      id: "main",
      comfyBaseUrl: null, // skip ComfyUI sync loop in tests
      autoPublish: true,
    } as unknown as never);

    vi.mocked(prisma.generationBatch.update).mockResolvedValue({} as unknown as never);
    vi.mocked(prisma.generationJob.update).mockResolvedValue({} as unknown as never);
    vi.mocked(runAutoPublishExclusive).mockReturnValue(Promise.resolve({ status: "done" }));
  });

  it("chọn đúng batch (bỏ qua khi autoPublish = false, query đúng bộ lọc)", async () => {
    vi.mocked(getOrCreateSettings).mockResolvedValue({
      id: "main",
      comfyBaseUrl: null,
      autoPublish: false, // disabled
    } as unknown as never);

    await runSyncTick();

    expect(prisma.generationBatch.findMany).not.toHaveBeenCalled();

    // When autoPublish = true, verify Prisma query filter
    vi.mocked(getOrCreateSettings).mockResolvedValue({
      id: "main",
      comfyBaseUrl: null,
      autoPublish: true,
    } as unknown as never);

    vi.mocked(prisma.generationBatch.findMany).mockResolvedValue([]);

    await runSyncTick();

    expect(prisma.generationBatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ autoStatus: null }, { autoStatus: "retrying" }],
          status: { in: ["completed", "partial", "failed"] },
          updatedAt: expect.objectContaining({ gte: expect.any(Date) }),
        }),
      }),
    );
  });

  it("partial -> gọi regenerateJobFreshPrompt cho job lỗi có count < 2 và tăng count", async () => {
    const mockBatch = {
      id: "batch-partial",
      status: "partial",
      autoStatus: null,
      jobs: [
        { id: "job-ok", status: "completed", autoRetryCount: 0, indexInBatch: 0 },
        { id: "job-fail-1", status: "failed", autoRetryCount: 0, indexInBatch: 1 },
        { id: "job-fail-2", status: "failed", autoRetryCount: 1, indexInBatch: 2 },
      ],
    };

    vi.mocked(prisma.generationBatch.findMany).mockResolvedValue([mockBatch as unknown as never]);
    vi.mocked(regenerateJobFreshPrompt).mockResolvedValue({} as unknown as never);

    await runSyncTick();

    // Increment count for both failed jobs
    expect(prisma.generationJob.update).toHaveBeenCalledWith({
      where: { id: "job-fail-1" },
      data: { autoRetryCount: { increment: 1 } },
    });
    expect(prisma.generationJob.update).toHaveBeenCalledWith({
      where: { id: "job-fail-2" },
      data: { autoRetryCount: { increment: 1 } },
    });

    // Call fresh prompt regeneration
    expect(regenerateJobFreshPrompt).toHaveBeenCalledWith("job-fail-1");
    expect(regenerateJobFreshPrompt).toHaveBeenCalledWith("job-fail-2");

    // Batch set to retrying
    expect(prisma.generationBatch.update).toHaveBeenCalledWith({
      where: { id: "batch-partial" },
      data: { autoStatus: "retrying" },
    });
  });

  it("hết lượt retry -> set failed với danh sách trang lỗi và ghi Sheet nếu có SKU", async () => {
    const mockBatch = {
      id: "batch-exhausted",
      status: "failed",
      autoStatus: "retrying",
      r2SkuBase: "CAL-ANI-2611-EXH01",
      jobs: [
        { id: "job-0", status: "failed", autoRetryCount: 2, indexInBatch: 0 },
        { id: "job-5", status: "failed", autoRetryCount: 2, indexInBatch: 5 },
      ],
    };

    vi.mocked(prisma.generationBatch.findMany).mockResolvedValue([mockBatch as unknown as never]);

    await runSyncTick();

    expect(regenerateJobFreshPrompt).not.toHaveBeenCalled();

    expect(prisma.generationBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "batch-exhausted" },
        data: expect.objectContaining({
          autoStatus: "failed",
          autoError: "Lỗi sinh ảnh ở các trang: Bìa trước, Tháng 5",
          autoFinishedAt: expect.any(Date),
        }),
      }),
    );

    expect(syncBatchToSheet).toHaveBeenCalledWith({
      batchId: "batch-exhausted",
      error: "Lỗi sinh ảnh ở các trang: Bìa trước, Tháng 5",
    });
  });

  it("không khởi động 2 pipeline publish song song", async () => {
    let finishPublish: () => void = () => {};
    const hangingPublish = new Promise<{ status: "done" }>((resolve) => {
      finishPublish = () => resolve({ status: "done" });
    });

    vi.mocked(runAutoPublishExclusive).mockReturnValue(hangingPublish as unknown as never);

    const batch1 = { id: "batch-1", status: "completed", autoStatus: null, jobs: [] };
    const batch2 = { id: "batch-2", status: "completed", autoStatus: null, jobs: [] };

    vi.mocked(prisma.generationBatch.findMany).mockResolvedValue([batch1, batch2] as unknown as never);

    await runSyncTick();

    // In a single tick with multiple completed batches, only 1 starts
    expect(runAutoPublishExclusive).toHaveBeenCalledTimes(1);
    expect(runAutoPublishExclusive).toHaveBeenCalledWith("batch-1");
    expect(autoSyncState.isPublishing).toBe(true);

    // In a subsequent tick while the first is still publishing, do not start batch 2
    await runSyncTick();
    expect(runAutoPublishExclusive).toHaveBeenCalledTimes(1);

    // After finish, flag resets
    finishPublish();
    await hangingPublish;
    // Allow promise microtasks to settle
    await new Promise((r) => setTimeout(r, 10));
    expect(autoSyncState.isPublishing).toBe(false);
  });
});
