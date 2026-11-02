import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveSafePath, buildOutputFilename, sanitizeFilenameSegment, buildBatchFolder } from "@/lib/files/safe-output";

describe("resolveSafePath", () => {
  const root = path.join(process.cwd(), "data", "outputs");

  it("resolves a plain relative path inside the root", () => {
    const resolved = resolveSafePath(root, "image.png");
    expect(resolved).toBe(path.join(root, "image.png"));
  });

  it("rejects path traversal via ../", () => {
    expect(() => resolveSafePath(root, "../../etc/passwd")).toThrow();
  });

  it("rejects an absolute path outside the root", () => {
    expect(() => resolveSafePath(root, "C:\\Windows\\System32\\config")).toThrow();
  });
});

describe("sanitizeFilenameSegment", () => {
  it("replaces unsafe characters like slashes, spaces and question marks", () => {
    const sanitized = sanitizeFilenameSegment("weird/name ?.png");
    expect(sanitized).not.toContain("/");
    expect(sanitized).not.toContain(" ");
    expect(sanitized).not.toContain("?");
  });
});

describe("buildOutputFilename", () => {
  it("keeps the original extension and includes the job id", () => {
    const filename = buildOutputFilename("job123", "ComfyUI_00001_.png");
    expect(filename.endsWith(".png")).toBe(true);
    expect(filename).toContain("job123");
  });

  it("produces different filenames on repeated calls", () => {
    const a = buildOutputFilename("job123", "out.png");
    const b = buildOutputFilename("job123", "out.png");
    expect(a).not.toBe(b);
  });
});

describe("buildBatchFolder", () => {
  const createdAt = new Date(2026, 10, 2, 14, 30);

  it("formats as YYYY-MM-DD_HH-mm_label_shortId", () => {
    const id = "clx9f8a2b";
    const folder = buildBatchFolder({ id, ideaPrompt: "Trợ lý AI 15 ảnh", createdAt });
    expect(folder.startsWith("2026-11-02_14-30_")).toBe(true);
    expect(folder.endsWith(id.slice(-6))).toBe(true);
    expect(folder).not.toContain("/");
    expect(folder).not.toContain(" ");
  });

  it("is deterministic for the same input", () => {
    const input = { id: "abc123", ideaPrompt: "Batch mẫu", createdAt };
    expect(buildBatchFolder(input)).toBe(buildBatchFolder(input));
  });

  it("truncates a long label instead of producing an unbounded folder name", () => {
    const folder = buildBatchFolder({
      id: "abc123",
      ideaPrompt: "a".repeat(200),
      createdAt,
    });
    expect(folder.length).toBeLessThan(80);
  });
});
