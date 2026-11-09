import { describe, expect, it, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { POST } from "@/app/api/generations/[batchId]/auto-publish/route";
import { prisma } from "@/lib/db";
import { runAutoPublishExclusive } from "@/lib/pipeline/auto-publish";

vi.mock("@/lib/db", () => ({
  prisma: {
    generationBatch: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/pipeline/auto-publish", () => ({
  runAutoPublishExclusive: vi.fn(),
}));

describe("POST /api/generations/[batchId]/auto-publish route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 202 without waiting for runAutoPublishExclusive to resolve, sets pending", async () => {
    vi.mocked(prisma.generationBatch.findUnique).mockResolvedValue({
      id: "batch-1",
      autoStatus: "failed",
    } as unknown as never);
    vi.mocked(prisma.generationBatch.update).mockResolvedValue({} as unknown as never);

    let runCalled = false;
    vi.mocked(runAutoPublishExclusive).mockImplementation(() => {
      runCalled = true;
      return new Promise(() => {}); // never resolves
    });

    const req = new Request("http://localhost:3000/api/generations/batch-1/auto-publish", {
      method: "POST",
    }) as NextRequest;

    const res = await POST(req, { params: Promise.resolve({ batchId: "batch-1" }) });

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body).toEqual({ status: "pending" });

    expect(prisma.generationBatch.update).toHaveBeenCalledWith({
      where: { id: "batch-1" },
      data: { autoStatus: "pending", autoStage: null, autoError: null },
    });
    expect(runCalled).toBe(true);
  });

  it("returns 409 when autoStatus is pending and does not start the run", async () => {
    vi.mocked(prisma.generationBatch.findUnique).mockResolvedValue({
      id: "batch-2",
      autoStatus: "pending",
    } as unknown as never);

    const req = new Request("http://localhost:3000/api/generations/batch-2/auto-publish", {
      method: "POST",
    }) as NextRequest;

    const res = await POST(req, { params: Promise.resolve({ batchId: "batch-2" }) });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("conflict");
    expect(body.error.message).toContain("Bộ lịch đang được xử lý, vui lòng đợi");
    expect(prisma.generationBatch.update).not.toHaveBeenCalled();
    expect(runAutoPublishExclusive).not.toHaveBeenCalled();
  });

  it("returns 409 when autoStatus is processing and does not start the run", async () => {
    vi.mocked(prisma.generationBatch.findUnique).mockResolvedValue({
      id: "batch-3",
      autoStatus: "processing",
    } as unknown as never);

    const req = new Request("http://localhost:3000/api/generations/batch-3/auto-publish", {
      method: "POST",
    }) as NextRequest;

    const res = await POST(req, { params: Promise.resolve({ batchId: "batch-3" }) });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("conflict");
    expect(prisma.generationBatch.update).not.toHaveBeenCalled();
    expect(runAutoPublishExclusive).not.toHaveBeenCalled();
  });

  it("returns 404 when batch does not exist", async () => {
    vi.mocked(prisma.generationBatch.findUnique).mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/generations/batch-not-found/auto-publish", {
      method: "POST",
    }) as NextRequest;

    const res = await POST(req, { params: Promise.resolve({ batchId: "batch-not-found" }) });

    expect(res.status).toBe(404);
    expect(runAutoPublishExclusive).not.toHaveBeenCalled();
  });
});
