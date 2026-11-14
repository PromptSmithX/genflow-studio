import { describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  generationBatch: {
    create: vi.fn(),
    update: vi.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id })),
    findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id, jobs: [] })),
  },
  generationJob: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: `job${data.indexInBatch}`, ...data })),
    update: vi.fn(),
  },
  stylePreset: { findUnique: vi.fn() },
  scenePreset: { findMany: vi.fn(async () => []) },
  posePreset: { findMany: vi.fn(async () => []) },
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/settings", () => ({
  getOrCreateSettings: vi.fn(async () => ({ maxImagesPerBatch: 15, defaultFixedSeed: null })),
  getOrCreateGlobalPrompt: vi.fn(async () => ({ positivePrompt: "", negativePrompt: "" })),
}));
vi.mock("@/lib/comfyui/workflow-store", () => ({
  getWorkflowConfig: vi.fn(async () => ({ workflowRelativePath: "w.json", nodeMappingJson: "{}" })),
  loadWorkflowJson: vi.fn(async () => ({})),
  parseNodeMapping: vi.fn(() => ({})),
}));
vi.mock("@/lib/comfyui/workflow-mapper", () => ({
  validateMapping: vi.fn(() => []),
  applyWorkflowMapping: vi.fn(() => ({})),
  readMappedNumber: vi.fn(() => undefined),
  readMappedString: vi.fn(() => undefined),
}));
vi.mock("@/lib/comfyui/runpod-client", () => ({
  getRunpodClient: vi.fn(() => ({ submitJob: vi.fn(async () => ({ jobId: "rp-1" })) })),
  RunpodApiError: class extends Error {},
}));
vi.mock("@/lib/r2/sku", () => ({ ensureSkuBase: vi.fn(async () => "CAL-GEN-2611-ABCDE") }));

import { createAndSubmitBatch } from "@/lib/generations/create-batch";
import { ensureSkuBase } from "@/lib/r2/sku";

describe("createAndSubmitBatch with existingBatchId", () => {
  it("promotes the drafting batch to queued instead of creating a new one", async () => {
    await createAndSubmitBatch(
      {
        ideaPrompt: "cô gái",
        mediumId: "m1",
        images: [{ positiveOverride: "a" }, { positiveOverride: "b" }],
        concept: { theme: "Garden" },
        seedMode: "fixed",
        fixedSeed: 42,
        incrementFixedSeed: false,
      },
      { existingBatchId: "draft-1" },
    );

    expect(prismaMock.generationBatch.create).not.toHaveBeenCalled();
    expect(prismaMock.generationBatch.update).toHaveBeenCalledWith({
      where: { id: "draft-1" },
      data: expect.objectContaining({
        status: "queued",
        requestedCount: 2,
        conceptTheme: "Garden",
        draftError: null,
        draftParamsJson: null,
      }),
    });
    expect(prismaMock.generationJob.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.generationJob.create.mock.calls[0][0].data.batchId).toBe("draft-1");
    expect(ensureSkuBase).toHaveBeenCalledWith("draft-1");
  });
});
