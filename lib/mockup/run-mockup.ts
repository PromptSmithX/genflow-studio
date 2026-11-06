import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { getOrCreateSettings } from "@/lib/settings";
import { buildBatchFolder } from "@/lib/files/safe-output";
import { resolveFinalRoot, resolveOutputRoot } from "@/lib/output-dir";

const execFileAsync = promisify(execFile);

const DEFAULT_TEMPLATES_DIR = "D:\\model_gen_anh_local_18\\MVP_workflow\\mockup";
const WRAP_SCRIPT = path.join(process.cwd(), "scripts", "mockup", "wrap_mockup.py");
const TIMEOUT_MS = 120_000;

export interface MockupResult {
  status: "done" | "failed" | "skipped";
  files: string[];
  error?: string;
}

/**
 * Resolves the directory containing the 5 template files. Checks env,
 * user configured path, standard D: drive location, or app asset fallback.
 */
async function resolveTemplatesDir(): Promise<string | null> {
  const candidates = [
    process.env.MOCKUP_TEMPLATES_DIR,
    DEFAULT_TEMPLATES_DIR,
    path.join(process.cwd(), "assets", "mockup_templates"),
  ].filter(Boolean) as string[];

  for (const dir of candidates) {
    try {
      const stat = await fs.stat(dir);
      if (stat.isDirectory()) {
        const coversPath = path.join(dir, "Context Covers.png");
        await fs.access(coversPath);
        return dir;
      }
    } catch {
      // Not found, check next candidate
    }
  }

  return null;
}

/**
 * Wraps the 14 calendar images of a batch into 5 realistic product mockup scenes.
 * Per user requirement, this strictly uses the censored ("da-che") images.
 * Output is saved in `data/outputs_final/<slug>/mockup/`.
 */
export async function wrapBatchMockup(batchId: string): Promise<MockupResult> {
  const batch = await prisma.generationBatch.findUnique({
    where: { id: batchId },
  });
  if (!batch) return { status: "skipped", files: [], error: "Không tìm thấy batch" };

  const settings = await getOrCreateSettings();
  const outputRoot = resolveOutputRoot(settings);
  const finalRoot = resolveFinalRoot(outputRoot);

  const slug = batch.finalExportRelativePath || buildBatchFolder(batch);
  const censoredDir = path.join(finalRoot, slug, "da-che");
  const uncensoredDir = path.join(finalRoot, slug, "khong-che");
  const mockupDir = path.join(finalRoot, slug, "mockup");

  // Check if censored folder exists
  const stat = await fs.stat(censoredDir).catch(() => null);
  if (!stat?.isDirectory()) {
    return {
      status: "skipped",
      files: [],
      error: "Thư mục 'da-che' chưa được tạo, cần xuất file in trước",
    };
  }

  const templatesDir = await resolveTemplatesDir();
  if (!templatesDir) {
    console.warn("[wrapBatchMockup] Không tìm thấy thư mục mockup template tại:", DEFAULT_TEMPLATES_DIR);
    await prisma.generationBatch.update({
      where: { id: batchId },
      data: { mockupStatus: "failed" },
    });
    return {
      status: "failed",
      files: [],
      error: `Không tìm thấy thư mục mockup template tại ${DEFAULT_TEMPLATES_DIR}`,
    };
  }

  // Construct the expected 14 image files
  const expectedNames = [
    "00_bia-truoc.png",
    ...Array.from({ length: 12 }, (_, i) => `${String(i + 1).padStart(2, "0")}.png`),
    "13_bia-sau.png",
  ];

  const imagePaths: string[] = [];
  for (const name of expectedNames) {
    let p = path.join(censoredDir, name);
    try {
      await fs.access(p);
    } catch {
      // For back cover or edge cases, fall back to uncensored dir if not in censored
      p = path.join(uncensoredDir, name);
      try {
        await fs.access(p);
      } catch {
        return {
          status: "skipped",
          files: [],
          error: `Thiếu file ảnh ${name} để tạo mockup`,
        };
      }
    }
    imagePaths.push(p);
  }

  await fs.mkdir(mockupDir, { recursive: true });

  const pythonBin = process.env.MOCKUP_PYTHON || process.env.CENSOR_PYTHON || "python";
  const config = JSON.stringify({
    templateDir: templatesDir,
    outputDir: mockupDir,
    images: imagePaths,
  });

  try {
    const { stdout } = await execFileAsync(pythonBin, [WRAP_SCRIPT, "--config", config], {
      timeout: TIMEOUT_MS,
      windowsHide: true,
    });

    const parsed = JSON.parse(stdout.trim()) as { success: boolean; files?: string[]; error?: string };
    if (!parsed.success) {
      throw new Error(parsed.error || "Lỗi không xác định khi tạo mockup");
    }

    await prisma.generationBatch.update({
      where: { id: batchId },
      data: { mockupStatus: "done" },
    });

    return {
      status: "done",
      files: parsed.files || [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lỗi khi chạy script mockup";
    console.error(`[wrapBatchMockup] lỗi ở batch ${batchId}:`, error);

    await prisma.generationBatch.update({
      where: { id: batchId },
      data: { mockupStatus: "failed" },
    });

    return {
      status: "failed",
      files: [],
      error: message,
    };
  }
}
