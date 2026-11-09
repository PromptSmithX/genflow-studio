import { describe, expect, it, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { regenerateJobFreshPrompt } from "@/lib/generations/regenerate-fresh";
import { GenerationSetupError } from "@/lib/generations/create-batch";
import { handleApiError } from "@/lib/api/errors";
import { POST } from "@/app/api/history/[jobId]/regenerate-fresh/route";
import type { NextRequest } from "next/server";

const mockGeneratePrompts = vi.fn();
const mockLlmClientConstructor = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    generationJob: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    generationBatch: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    generatedImage: {
      deleteMany: vi.fn(),
    },
    mediumPreset: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/settings", () => ({
  getOrCreateSettings: vi.fn().mockResolvedValue({
    runpodEndpointId: "ep-test",
    runpodApiKey: "rpa-test",
    llmApiKey: "mock-key",
  }),
  getOrCreateGlobalPrompt: vi.fn().mockResolvedValue({ positivePrompt: "", negativePrompt: "" }),
}));

vi.mock("@/lib/llm/resolve-config", () => ({
  resolveLlmConfig: vi.fn().mockReturnValue({
    baseUrl: "http://mock-llm",
    apiKey: "mock-key",
    model: "mock-model",
  }),
}));

vi.mock("@/lib/llm/client", () => ({
  LlmClient: class {
    constructor(options: unknown) {
      mockLlmClientConstructor(options);
    }
    generatePrompts = mockGeneratePrompts;
  },
  LlmApiError: class extends Error {
    constructor(message: string, public code: string) {
      super(message);
    }
  },
}));

vi.mock("@/lib/comfyui/workflow-store", () => ({
  getWorkflowConfig: vi.fn().mockResolvedValue({
    workflowRelativePath: "workflow.json",
    nodeMappingJson: "{}",
  }),
  loadWorkflowJson: vi.fn().mockResolvedValue({}),
  parseNodeMapping: vi.fn().mockReturnValue({}),
}));

vi.mock("@/lib/comfyui/runpod-client", () => ({
  RunpodClient: class {
    submitJob = vi.fn().mockResolvedValue({ jobId: "rp-123" });
  },
  RunpodApiError: class extends Error {
    constructor(message: string, public code: string) {
      super(message);
    }
  },
  getRunpodClient: vi.fn().mockReturnValue({
    submitJob: vi.fn().mockResolvedValue({ jobId: "rp-123" }),
  }),
}));

describe("regenerateJobFreshPrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects with 409-mapped conflict when job status is queued, without calling LLM", async () => {
    vi.mocked(prisma.generationJob.findUnique).mockResolvedValueOnce({
      id: "job-queued",
      batchId: "batch-1",
      status: "queued",
      indexInBatch: 1,
      seed: BigInt(42),
    } as unknown as never);
    vi.mocked(prisma.generationBatch.findUnique).mockResolvedValueOnce({
      id: "batch-1",
      autoStatus: "done",
      ideaPrompt: "Calendar idea",
      mediumId: null,
    } as unknown as never);

    let error: unknown;
    try {
      await regenerateJobFreshPrompt("job-queued");
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(GenerationSetupError);
    const setupError = error as GenerationSetupError;
    expect(setupError.code).toBe("conflict");
    expect(setupError.message).toBe("Ảnh này đang được tạo, vui lòng đợi");
    expect(mockGeneratePrompts).not.toHaveBeenCalled();

    // Verify mapping to HTTP 409 via handleApiError
    const response = handleApiError(error);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toEqual({
      code: "conflict",
      message: "Ảnh này đang được tạo, vui lòng đợi",
    });
  });

  it("rejects with 409-mapped conflict when job status is running, without calling LLM", async () => {
    vi.mocked(prisma.generationJob.findUnique).mockResolvedValueOnce({
      id: "job-running",
      batchId: "batch-1",
      status: "running",
      indexInBatch: 1,
      seed: BigInt(42),
    } as unknown as never);
    vi.mocked(prisma.generationBatch.findUnique).mockResolvedValueOnce({
      id: "batch-1",
      autoStatus: "done",
      ideaPrompt: "Calendar idea",
      mediumId: null,
    } as unknown as never);

    await expect(regenerateJobFreshPrompt("job-running")).rejects.toThrow(
      "Ảnh này đang được tạo, vui lòng đợi",
    );
    expect(mockGeneratePrompts).not.toHaveBeenCalled();
  });

  it("rejects with 409-mapped conflict when batch autoStatus is pending, without calling LLM", async () => {
    vi.mocked(prisma.generationJob.findUnique).mockResolvedValueOnce({
      id: "job-1",
      batchId: "batch-1",
      status: "failed",
      indexInBatch: 1,
      seed: BigInt(42),
    } as unknown as never);
    vi.mocked(prisma.generationBatch.findUnique).mockResolvedValueOnce({
      id: "batch-1",
      autoStatus: "pending",
      ideaPrompt: "Calendar idea",
      mediumId: null,
    } as unknown as never);

    let error: unknown;
    try {
      await regenerateJobFreshPrompt("job-1");
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(GenerationSetupError);
    const setupError = error as GenerationSetupError;
    expect(setupError.code).toBe("conflict");
    expect(setupError.message).toBe("Bộ lịch đang cập nhật kho & Google Sheet, vui lòng đợi xong rồi thử lại");
    expect(mockGeneratePrompts).not.toHaveBeenCalled();

    const response = handleApiError(error);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toEqual({
      code: "conflict",
      message: "Bộ lịch đang cập nhật kho & Google Sheet, vui lòng đợi xong rồi thử lại",
    });
  });

  it("rejects with 409-mapped conflict when batch autoStatus is processing, without calling LLM", async () => {
    vi.mocked(prisma.generationJob.findUnique).mockResolvedValueOnce({
      id: "job-1",
      batchId: "batch-1",
      status: "failed",
      indexInBatch: 1,
      seed: BigInt(42),
    } as unknown as never);
    vi.mocked(prisma.generationBatch.findUnique).mockResolvedValueOnce({
      id: "batch-1",
      autoStatus: "processing",
      ideaPrompt: "Calendar idea",
      mediumId: null,
    } as unknown as never);

    await expect(regenerateJobFreshPrompt("job-1")).rejects.toThrow(
      "Bộ lịch đang cập nhật kho & Google Sheet, vui lòng đợi xong rồi thử lại",
    );
    expect(mockGeneratePrompts).not.toHaveBeenCalled();
  });

  it("resets job autoRetryCount to 0 and batch autoStage / autoError to null on successful retry", async () => {
    vi.mocked(prisma.generationJob.findUnique).mockResolvedValueOnce({
      id: "job-fail",
      batchId: "batch-1",
      status: "failed",
      indexInBatch: 1,
      seed: BigInt(42),
      width: 1152,
      height: 952,
      steps: 28,
      cfg: 3.5,
      sampler: "euler",
      scheduler: "normal",
      autoRetryCount: 2,
    } as unknown as never);
    vi.mocked(prisma.generationBatch.findUnique).mockResolvedValueOnce({
      id: "batch-1",
      status: "failed",
      autoStatus: "failed",
      autoStage: "sheet",
      autoError: "Sheet sync failed",
      ideaPrompt: "Calendar idea",
      mediumId: null,
    } as unknown as never);

    mockGeneratePrompts.mockResolvedValueOnce({
      images: [
        { title: "Cover", positive: "prompt cover" },
        { title: "Page 1", positive: "prompt artwork" },
      ],
      negative: "negative prompt",
    });

    vi.mocked(prisma.generationJob.update).mockResolvedValue({
      id: "job-fail",
      batchId: "batch-1",
      status: "queued",
      positiveFinal: "prompt artwork",
      negativeFinal: "negative prompt",
      seed: BigInt(42),
      autoRetryCount: 0,
    } as unknown as never);

    vi.mocked(prisma.generationBatch.update).mockResolvedValue({
      id: "batch-1",
      status: "running",
      autoStage: null,
      autoError: null,
    } as unknown as never);

    vi.mocked(prisma.generationBatch.findUniqueOrThrow).mockResolvedValueOnce({
      id: "batch-1",
      jobs: [],
    } as unknown as never);

    await regenerateJobFreshPrompt("job-fail");

    // Verify LlmClient was constructed with apiKey from resolved config
    expect(mockLlmClientConstructor).toHaveBeenCalledWith({
      baseUrl: "http://mock-llm",
      apiKey: "mock-key",
      model: "mock-model",
    });

    // Verify job update resets autoRetryCount to 0 and records promptId rp-123
    expect(prisma.generationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-fail" },
        data: expect.objectContaining({
          status: "queued",
          autoRetryCount: 0,
        }),
      }),
    );

    expect(prisma.generationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-fail" },
        data: expect.objectContaining({
          status: "queued",
          promptId: "rp-123",
          submittedAt: expect.any(Date),
        }),
      }),
    );

    // Verify batch update resets autoStage and autoError to null
    expect(prisma.generationBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "batch-1" },
        data: expect.objectContaining({
          status: "running",
          autoStage: null,
          autoError: null,
          autoStatus: null,
        }),
      }),
    );
  });

  it("POST route returns HTTP 409 when regenerate-fresh encounters a conflict", async () => {
    vi.mocked(prisma.generationJob.findUnique).mockResolvedValueOnce({
      id: "job-busy",
      batchId: "batch-1",
      status: "running",
      indexInBatch: 0,
      seed: BigInt(10),
    } as unknown as never);
    vi.mocked(prisma.generationBatch.findUnique).mockResolvedValueOnce({
      id: "batch-1",
      autoStatus: "processing",
    } as unknown as never);

    const req = new Request("http://localhost:3000/api/history/job-busy/regenerate-fresh", {
      method: "POST",
    }) as NextRequest;

    const res = await POST(req, { params: Promise.resolve({ jobId: "job-busy" }) });
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error.code).toBe("conflict");
  });
});
