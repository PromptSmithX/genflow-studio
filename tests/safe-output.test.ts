import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveSafePath, buildOutputFilename, sanitizeFilenameSegment } from "@/lib/files/safe-output";

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
