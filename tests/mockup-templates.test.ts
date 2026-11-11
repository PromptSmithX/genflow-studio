import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveTemplatesDir } from "@/lib/mockup/run-mockup";

describe("resolveTemplatesDir", () => {
  const tempDirs: string[] = [];

  function makeTempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mockup-tpl-test-"));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tempDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // Bỏ qua lỗi dọn dẹp thư mục tạm
      }
    }
    tempDirs.length = 0;
  });

  it("trả về thư mục khi có Context Covers.png trong cwd/assets/mockup_templates", async () => {
    const cwd = makeTempDir();
    const templatesDir = path.join(cwd, "assets", "mockup_templates");
    fs.mkdirSync(templatesDir, { recursive: true });
    fs.writeFileSync(path.join(templatesDir, "Context Covers.png"), "fake png data");

    const resolved = await resolveTemplatesDir({}, cwd);
    expect(resolved).toBe(templatesDir);
  });

  it("ưu tiên biến môi trường MOCKUP_TEMPLATES_DIR hơn cwd", async () => {
    const envDir = makeTempDir();
    fs.writeFileSync(path.join(envDir, "Context Covers.png"), "env png data");

    const cwd = makeTempDir();
    const cwdTemplatesDir = path.join(cwd, "assets", "mockup_templates");
    fs.mkdirSync(cwdTemplatesDir, { recursive: true });
    fs.writeFileSync(path.join(cwdTemplatesDir, "Context Covers.png"), "cwd png data");

    const resolved = await resolveTemplatesDir({ MOCKUP_TEMPLATES_DIR: envDir }, cwd);
    expect(resolved).toBe(envDir);
  });

  it("trả về null khi không tìm thấy Context Covers.png ở các đường dẫn", async () => {
    const cwd = makeTempDir();
    const resolved = await resolveTemplatesDir({}, cwd);
    expect(resolved).toBeNull();
  });
});
