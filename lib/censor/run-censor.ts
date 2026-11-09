// Local CPU fallback for censoring sensitive regions; primary censor runs in RunPod worker.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const execFileAsync = promisify(execFile);

const CENSOR_SCRIPT = path.join(process.cwd(), "scripts", "censor", "censor.py");

const SUBPROCESS_TIMEOUT_MS = 180_000;

export interface CensorItem {
  input: string;
  output: string;
}

export type MaskStatus = "censored" | "clean" | "failed" | "skipped";

export interface CensorResult extends CensorItem {
  status: MaskStatus;
  error?: string;
}

interface CensorParams {
  threshold: number;
  padding: number;
  blur_radius: number;
  feather: number;
  model_path: string;
  inference_resolution: number;
}

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Reads censor tuning knobs from env defaults matching scripts/censor/censor.py.
function readParams(): CensorParams {
  return {
    threshold: num(process.env.CENSOR_THRESHOLD, 0.25),
    padding: num(process.env.CENSOR_PADDING, 0.35),
    blur_radius: num(process.env.CENSOR_BLUR_RADIUS, 45),
    feather: num(process.env.CENSOR_FEATHER, 8),
    model_path: process.env.CENSOR_MODEL_PATH ?? "",
    inference_resolution: num(process.env.CENSOR_INFERENCE_RESOLUTION, 320),
  };
}

// Censors a batch using the local NudeNet sidecar subprocess.
async function censorViaSubprocess(items: CensorItem[], pythonPath: string, params: CensorParams): Promise<CensorResult[]> {
  const manifestPath = path.join(os.tmpdir(), `anima-censor-${randomUUID()}.json`);
  const manifest = { items, ...params };
  await fs.writeFile(manifestPath, JSON.stringify(manifest), "utf-8");

  try {
    const { stdout } = await execFileAsync(pythonPath, [CENSOR_SCRIPT, manifestPath], {
      timeout: SUBPROCESS_TIMEOUT_MS,
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

// Local CPU fallback: uses CENSOR_PYTHON subprocess if available, else marks items skipped.
export async function censorImages(items: CensorItem[]): Promise<CensorResult[]> {
  if (items.length === 0) return [];

  const params = readParams();
  if (process.env.CENSOR_PYTHON) {
    return censorViaSubprocess(items, process.env.CENSOR_PYTHON, params);
  }
  return items.map((item) => ({ ...item, status: "skipped" }));
}
