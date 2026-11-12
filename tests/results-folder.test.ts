import path from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";
import fs from "node:fs/promises";
import { prisma } from "@/lib/db";
import { renderBatchPages } from "@/lib/r2/render-pages";
import { buildResultsFolder, previewFileName } from "@/lib/generations/results-folder";
import { resolveResultsRoot } from "@/lib/output-dir";

vi.mock("@/lib/db", () => ({
  prisma: { generationBatch: { findUnique: vi.fn() } },
}));

vi.mock("@/lib/settings", () => ({
  getOrCreateSettings: vi.fn().mockResolvedValue({ outputDirectory: "data/outputs" }),
}));

vi.mock("@/lib/output-dir", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/output-dir")>();
  return { ...actual, resolveOutputRoot: () => path.resolve("root", "outputs") };
});

vi.mock("@/lib/calendar/formats", () => ({
  listCalendarFormats: vi.fn().mockResolvedValue([
    { id: "premade_wall_14x11_5", label: "14", widthPx: 4275, heightPx: 3525, dpi: 300 },
    { id: "premade_wall_11x8_5", label: "11", widthPx: 3375, heightPx: 2625, dpi: 300 },
    { id: "some_other_format", label: "x", widthPx: 10, heightPx: 10, dpi: 300 },
  ]),
}));

vi.mock("@/lib/r2/render-pages", () => ({ renderBatchPages: vi.fn().mockResolvedValue({ cen: [], org: [] }) }));

vi.mock("node:fs/promises", () => {
  const fns = { rm: vi.fn(), mkdir: vi.fn(), readdir: vi.fn(), copyFile: vi.fn() };
  return { ...fns, default: fns };
});

const slug = "2026-11-12_17-01_cap-doi_9f4me3";
const resultsDir = path.resolve("root", "outputs_ket-qua", slug);
const mockupDir = path.resolve("root", "outputs_final", slug, "mockup");

describe("resolveResultsRoot", () => {
  it("is a sibling of the output root", () => {
    expect(resolveResultsRoot(path.join("x", "data", "outputs"))).toBe(path.join("x", "data", "outputs_ket-qua"));
  });
});

describe("previewFileName", () => {
  it("renumbers mockups like R2 previews", () => {
    expect(previewFileName("00_mockup_covers.png", 0)).toBe("01_mockup_covers.png");
    expect(previewFileName("04_mockup_q4.png", 4)).toBe("05_mockup_q4.png");
  });
});

describe("buildResultsFolder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.generationBatch.findUnique).mockResolvedValue({
      id: "b1",
      finalExportRelativePath: slug,
    } as never);
    vi.mocked(fs.copyFile).mockResolvedValue(undefined);
  });

  it("renders both sizes like R2 and copies mockups into previews/", async () => {
    vi.mocked(fs.readdir).mockResolvedValue([
      "00_mockup_covers.png",
      "01_mockup_q1.png",
      "02_mockup_q2.png",
      "03_mockup_q3.png",
      "04_mockup_q4.png",
    ] as never);

    const result = await buildResultsFolder("b1");

    expect(result).toBe("done");
    expect(fs.rm).toHaveBeenCalledWith(resultsDir, { recursive: true, force: true });
    expect(renderBatchPages).toHaveBeenCalledTimes(2);
    expect(renderBatchPages).toHaveBeenCalledWith("b1", expect.objectContaining({ id: "premade_wall_14x11_5" }), path.join(resultsDir, "14x11.5"));
    expect(renderBatchPages).toHaveBeenCalledWith("b1", expect.objectContaining({ id: "premade_wall_11x8_5" }), path.join(resultsDir, "11x8.5"));
    expect(fs.copyFile).toHaveBeenCalledWith(
      path.join(mockupDir, "00_mockup_covers.png"),
      path.join(resultsDir, "previews", "01_mockup_covers.png"),
    );
    expect(fs.copyFile).toHaveBeenCalledWith(
      path.join(mockupDir, "04_mockup_q4.png"),
      path.join(resultsDir, "previews", "05_mockup_q4.png"),
    );
  });

  it("returns failed instead of throwing when rendering fails", async () => {
    vi.mocked(renderBatchPages).mockRejectedValueOnce(new Error("Thiếu ảnh cho slot 3"));
    await expect(buildResultsFolder("b1")).resolves.toBe("failed");
  });

  it("skips a missing batch", async () => {
    vi.mocked(prisma.generationBatch.findUnique).mockResolvedValueOnce(null);
    await expect(buildResultsFolder("missing")).resolves.toBe("skipped");
  });
});
