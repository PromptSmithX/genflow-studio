import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { getOrCreateSettings } from "@/lib/settings";
import { buildBatchFolder } from "@/lib/files/safe-output";
import { resolveFinalRoot, resolveOutputRoot } from "@/lib/output-dir";
import { BACK_COVER_FILENAME, slotFilename, slotLabel } from "@/lib/calendar/slot-label";

const execFileAsync = promisify(execFile);

const WRAP_SCRIPT = path.join(process.cwd(), "scripts", "mockup", "wrap_mockup.py");
const TIMEOUT_MS = 120_000;

export interface MockupResult {
  status: "done" | "failed" | "skipped";
  files: string[];
  error?: string;
}

/**
 * Resolves the directory containing the 5 template files. Checks env,
 * or app asset fallback. Valid when Context Covers.png exists inside.
 */
export async function resolveTemplatesDir(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
  cwd: string = process.cwd(),
): Promise<string | null> {
  const candidates = [
    env.MOCKUP_TEMPLATES_DIR,
    path.join(cwd, "assets", "mockup_templates"),
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
      // Bỏ qua nếu thư mục không tồn tại hoặc thiếu file
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
      error: "Chưa có thư mục file in (da-che). Hãy bấm \"Xuất file in\" trước khi tạo mockup.",
    };
  }

  const templatesDir = await resolveTemplatesDir();
  if (!templatesDir) {
    const tried = [
      process.env.MOCKUP_TEMPLATES_DIR,
      path.join(process.cwd(), "assets", "mockup_templates"),
    ].filter(Boolean) as string[];
    const errorMsg = `Không tìm thấy thư mục mockup template (đã thử: ${tried.join(", ")})`;
    console.warn(`[wrapBatchMockup] ${errorMsg}`);
    await prisma.generationBatch.update({
      where: { id: batchId },
      data: { mockupStatus: "failed" },
    });
    return {
      status: "failed",
      files: [],
      error: errorMsg,
    };
  }

  const expected = [
    ...Array.from({ length: 13 }, (_, i) => ({ name: slotFilename(i), label: slotLabel(i) })),
    { name: BACK_COVER_FILENAME, label: "Bìa sau" },
  ];

  const imagePaths: string[] = [];
  for (const { name, label } of expected) {
    let p = path.join(censoredDir, name);
    try {
      await fs.access(p);
    } catch {
      // For back cover or edge cases, fall back to uncensored dir if not in censored
      p = path.join(uncensoredDir, name);
      try {
        await fs.access(p);
      } catch {
        // Mockup cũ (nếu có) được ghép từ bộ ảnh trước đó -- xoá để không hiển thị nhầm.
        await fs.rm(mockupDir, { recursive: true, force: true });
        await prisma.generationBatch.update({ where: { id: batchId }, data: { mockupStatus: null } });
        return {
          status: "skipped",
          files: [],
          error: `Mockup cần đủ 14 trang nhưng đang thiếu "${label}" (${name}). Hãy sửa lại ảnh đó rồi xuất file in lại.`,
        };
      }
    }
    imagePaths.push(p);
  }

  // Xoá mockup cũ để thư mục luôn khớp đúng lần tạo gần nhất.
  await fs.rm(mockupDir, { recursive: true, force: true });
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
    const err = error as Error & { code?: string | number; stderr?: string | Buffer };
    let message: string;
    if (err.code === "ENOENT") {
      message = `Không tìm thấy Python để tạo mockup (MOCKUP_PYTHON=${pythonBin})`;
    } else {
      const baseMsg = err.message || "Lỗi khi chạy script mockup";
      const stderrStr = typeof err.stderr === "string" ? err.stderr : err.stderr ? err.stderr.toString("utf-8") : "";
      const trimmedStderr = stderrStr.trim();
      message = trimmedStderr ? `${baseMsg}: ${trimmedStderr.slice(-300)}` : baseMsg;
    }
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
