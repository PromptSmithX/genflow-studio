import { describe, expect, it, vi, beforeEach } from "vitest";
import fs from "node:fs/promises";
import { prisma } from "@/lib/db";
import { syncJob, syncBatch, UNKNOWN_GIVE_UP_MS } from "@/lib/comfyui/job-sync";
import { RunpodClient, RunpodApiError } from "@/lib/comfyui/runpod-client";
import { getObjectBuffer, deleteObject } from "@/lib/r2/client";
import { readR2Config } from "@/lib/r2/config";
import { censorImages } from "@/lib/censor/run-censor";

vi.mock("@/lib/db", () => ({
  prisma: {
    generationJob: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    generationBatch: {
      update: vi.fn(),
    },
    generatedImage: {
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/r2/config", () => ({
  readR2Config: vi.fn().mockReturnValue({
    accountId: "test-acc",
    accessKeyId: "test-key",
    secretAccessKey: "test-sec",
    bucket: "test-bucket",
    publicBaseUrl: "https://pub.r2",
    keyPrefix: "calendars/anima",
  }),
}));

vi.mock("@/lib/r2/client", () => ({
  createR2Client: vi.fn().mockReturnValue({}),
  getObjectBuffer: vi.fn(),
  deleteObject: vi.fn(),
  RUNPOD_OUTPUT_PREFIX: "runpod-out",
}));

vi.mock("@/lib/censor/run-censor", () => ({
  censorImages: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("job-sync", () => {
  const defaultBatch = {
    id: "batch-1",
    ideaPrompt: "Test Idea",
    createdAt: new Date(),
  };

  const mockClient = {
    getJobResult: vi.fn(),
  } as unknown as RunpodClient;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readR2Config).mockReturnValue({
      accountId: "test-acc",
      accessKeyId: "test-key",
      secretAccessKey: "test-sec",
      bucket: "test-bucket",
      publicBaseUrl: "https://pub.r2",
      keyPrefix: "calendars/anima",
    });
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
  });

  it("COMPLETED ghi ảnh gốc + masked, tạo GeneratedImage, xóa object R2, job completed", async () => {
    vi.mocked(prisma.generationJob.findUnique).mockResolvedValueOnce({
      id: "job-1",
      promptId: "rp-prompt-1",
      status: "queued",
      createdAt: new Date(),
      images: [],
      batch: defaultBatch,
    } as unknown as never);

    vi.mocked(mockClient.getJobResult).mockResolvedValueOnce({
      status: "COMPLETED",
      images: [
        {
          index: 0,
          filename: "rp-prompt-1_0.png",
          key: "runpod-out/rp-prompt-1/0.png",
          masked_key: "runpod-out/rp-prompt-1/0.masked.png",
          mask_status: "censored",
          width: 1024,
          height: 1536,
        },
      ],
    });

    vi.mocked(getObjectBuffer)
      .mockResolvedValueOnce(Buffer.from("raw-data"))
      .mockResolvedValueOnce(Buffer.from("masked-data"));

    vi.mocked(prisma.generatedImage.create).mockResolvedValueOnce({
      id: "img-1",
      jobId: "job-1",
      relativePath: "batch_folder/img.png",
      filename: "rp-prompt-1_0.png",
    } as unknown as never);

    await syncJob("job-1", mockClient, "C:/tmp/outputs");

    expect(fs.writeFile).toHaveBeenCalledTimes(2);
    expect(prisma.generatedImage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          jobId: "job-1",
          filename: "rp-prompt-1_0.png",
          width: 1024,
          height: 1536,
        }),
      }),
    );
    expect(prisma.generatedImage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "img-1" },
        data: expect.objectContaining({
          maskStatus: "censored",
        }),
      }),
    );
    expect(deleteObject).toHaveBeenCalledWith({}, "test-bucket", "runpod-out/rp-prompt-1/0.png");
    expect(deleteObject).toHaveBeenCalledWith({}, "test-bucket", "runpod-out/rp-prompt-1/0.masked.png");
    expect(prisma.generationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-1" },
        data: expect.objectContaining({
          status: "completed",
        }),
      }),
    );
  });

  it("chạy lại không tạo trùng khi ảnh đã có sẵn trong DB", async () => {
    vi.mocked(prisma.generationJob.findUnique).mockResolvedValueOnce({
      id: "job-1",
      promptId: "rp-prompt-1",
      status: "queued",
      images: [{ filename: "rp-prompt-1_0.png" }],
      batch: defaultBatch,
    } as unknown as never);

    vi.mocked(mockClient.getJobResult).mockResolvedValueOnce({
      status: "COMPLETED",
      images: [
        {
          index: 0,
          filename: "rp-prompt-1_0.png",
          key: "runpod-out/rp-prompt-1/0.png",
          masked_key: "runpod-out/rp-prompt-1/0.masked.png",
          mask_status: "censored",
          width: 1024,
          height: 1536,
        },
      ],
    });

    await syncJob("job-1", mockClient, "C:/tmp/outputs");

    expect(prisma.generatedImage.create).not.toHaveBeenCalled();
    expect(prisma.generationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-1" },
        data: expect.objectContaining({
          status: "completed",
        }),
      }),
    );
  });

  it("mask_status: failed gọi fallback censorImages không truyền URL", async () => {
    vi.mocked(prisma.generationJob.findUnique).mockResolvedValueOnce({
      id: "job-1",
      promptId: "rp-prompt-1",
      status: "queued",
      createdAt: new Date(),
      images: [],
      batch: defaultBatch,
    } as unknown as never);

    vi.mocked(mockClient.getJobResult).mockResolvedValueOnce({
      status: "COMPLETED",
      images: [
        {
          index: 0,
          filename: "rp-prompt-1_0.png",
          key: "runpod-out/rp-prompt-1/0.png",
          masked_key: null,
          mask_status: "failed",
          width: 1024,
          height: 1536,
        },
      ],
    });

    vi.mocked(getObjectBuffer).mockResolvedValueOnce(Buffer.from("raw-data"));
    vi.mocked(prisma.generatedImage.create).mockResolvedValueOnce({
      id: "img-1",
      jobId: "job-1",
      relativePath: "batch_folder/img.png",
      filename: "rp-prompt-1_0.png",
    } as unknown as never);
    vi.mocked(censorImages).mockResolvedValueOnce([
      { status: "clean", input: "in", output: "out" },
    ]);

    await syncJob("job-1", mockClient, "C:/tmp/outputs");

    expect(censorImages).toHaveBeenCalled();
    expect(vi.mocked(censorImages).mock.calls[0][1]).toBeUndefined();
    expect(prisma.generatedImage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "img-1" },
        data: expect.objectContaining({
          maskStatus: "clean",
        }),
      }),
    );
  });

  it("FAILED, CANCELLED, TIMED_OUT cập nhật status failed với đúng errorCode", async () => {
    vi.mocked(prisma.generationJob.findUnique).mockResolvedValue({
      id: "job-1",
      promptId: "rp-prompt-1",
      status: "running",
      images: [],
      batch: defaultBatch,
    } as unknown as never);

    vi.mocked(mockClient.getJobResult).mockResolvedValueOnce({
      status: "FAILED",
      images: [],
      error: "CUDA out of memory",
    });
    await syncJob("job-1", mockClient, "C:/tmp/outputs");
    expect(prisma.generationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "failed",
          errorCode: "runpod_failed",
          errorMessage: "CUDA out of memory",
        }),
      }),
    );

    vi.mocked(mockClient.getJobResult).mockResolvedValueOnce({
      status: "CANCELLED",
      images: [],
    });
    await syncJob("job-1", mockClient, "C:/tmp/outputs");
    expect(prisma.generationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "failed",
          errorCode: "runpod_cancelled",
        }),
      }),
    );

    vi.mocked(mockClient.getJobResult).mockResolvedValueOnce({
      status: "TIMED_OUT",
      images: [],
    });
    await syncJob("job-1", mockClient, "C:/tmp/outputs");
    expect(prisma.generationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "failed",
          errorCode: "runpod_timed_out",
        }),
      }),
    );
  });

  it("NOT_FOUND phục hồi từ R2 thành công", async () => {
    vi.mocked(prisma.generationJob.findUnique).mockResolvedValueOnce({
      id: "job-1",
      promptId: "rp-prompt-1",
      status: "queued",
      createdAt: new Date(),
      images: [],
      batch: defaultBatch,
    } as unknown as never);

    vi.mocked(mockClient.getJobResult).mockResolvedValueOnce({
      status: "NOT_FOUND",
      images: [],
    });

    vi.mocked(getObjectBuffer)
      .mockResolvedValueOnce(Buffer.from("orig-from-r2"))
      .mockResolvedValueOnce(Buffer.from("masked-from-r2"))
      .mockResolvedValueOnce(Buffer.from("orig-from-r2"))
      .mockResolvedValueOnce(Buffer.from("masked-from-r2"));

    vi.mocked(prisma.generatedImage.create).mockResolvedValueOnce({
      id: "img-1",
      jobId: "job-1",
      relativePath: "batch_folder/img.png",
      filename: "rp-prompt-1_0.png",
    } as unknown as never);

    await syncJob("job-1", mockClient, "C:/tmp/outputs");

    expect(prisma.generatedImage.create).toHaveBeenCalled();
    expect(prisma.generationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "completed",
        }),
      }),
    );
  });

  it("NOT_FOUND không có object và quá 2 phút cập nhật result_expired", async () => {
    vi.mocked(prisma.generationJob.findUnique).mockResolvedValueOnce({
      id: "job-1",
      promptId: "rp-prompt-1",
      status: "queued",
      submittedAt: new Date(Date.now() - 150_000), // > 2 phút
      images: [],
      batch: defaultBatch,
    } as unknown as never);

    vi.mocked(mockClient.getJobResult).mockResolvedValueOnce({
      status: "NOT_FOUND",
      images: [],
    });
    vi.mocked(getObjectBuffer).mockResolvedValue(null);

    await syncJob("job-1", mockClient, "C:/tmp/outputs");

    expect(prisma.generationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "failed",
          errorCode: "result_expired",
        }),
      }),
    );
  });

  it("NOT_FOUND trong vòng 2 phút thì bỏ qua không ghi gì", async () => {
    vi.mocked(prisma.generationJob.findUnique).mockResolvedValueOnce({
      id: "job-1",
      promptId: "rp-prompt-1",
      status: "queued",
      submittedAt: new Date(Date.now() - 30_000), // 30s
      images: [],
      batch: defaultBatch,
    } as unknown as never);

    vi.mocked(mockClient.getJobResult).mockResolvedValueOnce({
      status: "NOT_FOUND",
      images: [],
    });
    vi.mocked(getObjectBuffer).mockResolvedValue(null);

    await syncJob("job-1", mockClient, "C:/tmp/outputs");

    expect(prisma.generationJob.update).not.toHaveBeenCalled();
  });

  it("IN_PROGRESS cập nhật status running", async () => {
    vi.mocked(prisma.generationJob.findUnique).mockResolvedValueOnce({
      id: "job-1",
      promptId: "rp-prompt-1",
      status: "queued",
      createdAt: new Date(),
      images: [],
      batch: defaultBatch,
    } as unknown as never);

    vi.mocked(mockClient.getJobResult).mockResolvedValueOnce({
      status: "IN_PROGRESS",
      images: [],
    });

    await syncJob("job-1", mockClient, "C:/tmp/outputs");

    expect(prisma.generationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "running",
        }),
      }),
    );
  });

  it("lỗi RunpodApiError trong vòng 2 giờ cập nhật status unknown", async () => {
    vi.mocked(prisma.generationJob.findUnique).mockResolvedValueOnce({
      id: "job-1",
      promptId: "rp-prompt-1",
      status: "running",
      submittedAt: new Date(Date.now() - 30_000),
      images: [],
      batch: defaultBatch,
    } as unknown as never);

    vi.mocked(mockClient.getJobResult).mockRejectedValueOnce(
      new RunpodApiError("Mạng lỗi", "network"),
    );

    await syncJob("job-1", mockClient, "C:/tmp/outputs");

    expect(prisma.generationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "unknown",
          errorCode: "network",
          errorMessage: "Mạng lỗi",
        }),
      }),
    );
  });

  it("lỗi RunpodApiError khi job submit > 2 giờ thì cập nhật failed sync_timeout", async () => {
    vi.mocked(prisma.generationJob.findUnique).mockResolvedValueOnce({
      id: "job-1",
      promptId: "rp-prompt-1",
      status: "running",
      submittedAt: new Date(Date.now() - (UNKNOWN_GIVE_UP_MS + 10_000)),
      images: [],
      batch: defaultBatch,
    } as unknown as never);

    vi.mocked(mockClient.getJobResult).mockRejectedValueOnce(
      new RunpodApiError("Mạng lỗi", "network"),
    );

    await syncJob("job-1", mockClient, "C:/tmp/outputs");

    expect(prisma.generationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "failed",
          errorCode: "sync_timeout",
          errorMessage: "Không đồng bộ được kết quả sau 2 giờ — bấm Tạo lại",
        }),
      }),
    );
  });

  it("syncBatch coi job unknown có promptId là đang chạy (batch -> running)", async () => {
    vi.mocked(prisma.generationJob.findMany)
      .mockResolvedValueOnce([]) // for loop
      .mockResolvedValueOnce([
        { id: "j1", status: "completed", promptId: "p1" },
        { id: "j2", status: "unknown", promptId: "p2" },
      ] as unknown as never);

    await syncBatch("batch-1", mockClient, "C:/tmp/outputs");

    expect(prisma.generationBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "batch-1" },
        data: { status: "running" },
      }),
    );
  });
});
