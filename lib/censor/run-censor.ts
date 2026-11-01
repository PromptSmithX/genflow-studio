import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const execFileAsync = promisify(execFile);

const CENSOR_SCRIPT = path.join(process.cwd(), "scripts", "censor", "censor.py");

export interface CensorItem {
  input: string;
  output: string;
}

export type MaskStatus = "censored" | "clean" | "failed" | "skipped";

export interface CensorResult extends CensorItem {
  status: MaskStatus;
  error?: string;
}

export function isCensorConfigured(): boolean {
  return Boolean(process.env.CENSOR_PYTHON);
}

/**
 * Runs the NudeNet censor sidecar (scripts/censor/censor.py) once for a whole
 * batch of images, so the model loads a single time instead of once per
 * image. Requires CENSOR_PYTHON (path to a Python 3.11 interpreter with
 * nudenet installed, see scripts/censor/README.md) -- when unset, every item
 * comes back "skipped" instead of throwing, so the app keeps working without
 * the optional censor env installed.
 */
export async function censorImages(items: CensorItem[]): Promise<CensorResult[]> {
  if (items.length === 0) return [];

  const pythonPath = process.env.CENSOR_PYTHON;
  if (!pythonPath) {
    return items.map((item) => ({ ...item, status: "skipped" }));
  }

  const manifestPath = path.join(os.tmpdir(), `anima-censor-${randomUUID()}.json`);
  const manifest = { items, threshold: 0.25, padding: 0.2, blur_radius: 35, feather: 8 };
  await fs.writeFile(manifestPath, JSON.stringify(manifest), "utf-8");

  try {
    const { stdout } = await execFileAsync(pythonPath, [CENSOR_SCRIPT, manifestPath], {
      timeout: 180_000,
      maxBuffer: 10 * 1024 * 1024,
    });

    const lastLine = stdout.trim().split("\n").pop() ?? "";
    const parsed = JSON.parse(lastLine) as { results?: CensorResult[] };
    if (!parsed.results) throw new Error("Censor script không trả về kết quả hợp lệ");
    return parsed.results;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lỗi không xác định khi che ảnh";
    return items.map((item) => ({ ...item, status: "failed", error: message }));
  } finally {
    await fs.unlink(manifestPath).catch(() => {});
  }
}
