import path from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/generations/[batchId]/reveal-folder/route";

vi.mock("@/lib/db", () => ({
  prisma: { generationBatch: { findUnique: vi.fn() } },
}));

vi.mock("@/lib/settings", () => ({
  getOrCreateSettings: vi.fn().mockResolvedValue({ outputDirectory: "outputs" }),
}));

vi.mock("@/lib/output-dir", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/output-dir")>();
  return { ...actual, resolveOutputRoot: () => path.resolve("root", "outputs") };
});

vi.mock("node:fs/promises", () => {
  const fns = { stat: vi.fn() };
  return { ...fns, default: fns };
});

vi.mock("node:child_process", () => {
  const spawnMock = vi.fn(() => ({ unref: vi.fn() }));
  return { spawn: spawnMock, default: { spawn: spawnMock } };
});

const slug = "2026-11-12_17-01_cap-doi_9f4me3";

function reveal(folder: string) {
  const req = new NextRequest(`http://localhost/api/generations/b1/reveal-folder?folder=${folder}`, { method: "POST" });
  return POST(req, { params: Promise.resolve({ batchId: "b1" }) });
}

describe("reveal-folder ?folder=results", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.generationBatch.findUnique).mockResolvedValue({
      id: "b1",
      finalExportStatus: "done",
      finalExportRelativePath: slug,
    } as never);
  });

  it("opens the results folder (same layout as R2) in Explorer", async () => {
    vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as never);
    const res = await reveal("results");
    expect(res.status).toBe(200);
    expect(spawn).toHaveBeenCalledWith(
      "explorer.exe",
      [path.resolve("root", "outputs_ket-qua", slug)],
      expect.objectContaining({ detached: true }),
    );
  });

  it("returns 404 with a friendly message when the results folder does not exist yet", async () => {
    vi.mocked(fs.stat).mockRejectedValue(new Error("ENOENT"));
    const res = await reveal("results");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.message).toContain("Thư mục kết quả chưa có");
    expect(spawn).not.toHaveBeenCalled();
  });
});
