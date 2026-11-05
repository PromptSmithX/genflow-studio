import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const WRAP_SCRIPT = path.join(process.cwd(), "scripts", "mockup", "wrap_mockup.py");
const TEMPLATES_DIR = "D:\\model_gen_anh_local_18\\MVP_workflow\\mockup";

describe("wrap_mockup.py", () => {
  it("should fail gracefully when fewer than 14 images are provided", async () => {
    const pythonBin = process.env.MOCKUP_PYTHON || "python";
    const config = JSON.stringify({
      templateDir: TEMPLATES_DIR,
      outputDir: path.join(os.tmpdir(), "mockup_test_fail"),
      images: ["img1.png", "img2.png"],
    });

    await expect(
      execFileAsync(pythonBin, [WRAP_SCRIPT, "--config", config]),
    ).rejects.toThrow();
  });

  it("should generate 5 mockup images given 14 inputs", async () => {
    // Check if templates dir exists
    const stat = await fs.stat(TEMPLATES_DIR).catch(() => null);
    if (!stat?.isDirectory()) {
      console.warn("Skipping mockup generation test: templates dir not found at", TEMPLATES_DIR);
      return;
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mockup-test-"));
    const inputDir = path.join(tmpDir, "inputs");
    const outputDir = path.join(tmpDir, "outputs");
    await fs.mkdir(inputDir, { recursive: true });

    // Use Python to create 14 simple PNGs quickly
    const pythonBin = process.env.MOCKUP_PYTHON || "python";
    const createImagesScript = `
import os
from PIL import Image

for i in range(14):
    im = Image.new('RGB', (1152, 952), color=(i * 15, 120, 200))
    im.save(os.path.join(r'${inputDir}', f'{i:02d}.png'))
`;
    await execFileAsync(pythonBin, ["-c", createImagesScript]);

    const imagePaths = Array.from({ length: 14 }, (_, i) =>
      path.join(inputDir, `${String(i).padStart(2, "0")}.png`),
    );

    const config = JSON.stringify({
      templateDir: TEMPLATES_DIR,
      outputDir,
      images: imagePaths,
    });

    const { stdout } = await execFileAsync(pythonBin, [WRAP_SCRIPT, "--config", config]);
    const result = JSON.parse(stdout.trim());

    expect(result.success).toBe(true);
    expect(result.files).toHaveLength(5);
    expect(result.files).toEqual([
      "00_mockup_covers.png",
      "01_mockup_q1.png",
      "02_mockup_q2.png",
      "03_mockup_q3.png",
      "04_mockup_q4.png",
    ]);

    for (const f of result.files) {
      const outStat = await fs.stat(path.join(outputDir, f));
      expect(outStat.size).toBeGreaterThan(100_000); // 2048x2048 PNG is > 100KB
    }

    // Clean up
    await fs.rm(tmpDir, { recursive: true, force: true });
  }, 30_000);
});
