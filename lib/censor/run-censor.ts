import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const execFileAsync = promisify(execFile);

const CENSOR_SCRIPT = path.join(process.cwd(), "scripts", "censor", "censor.py");

const SUBPROCESS_TIMEOUT_MS = 180_000;
const HTTP_TIMEOUT_MS = 120_000;

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

/**
 * Reads the censor tuning knobs from env so they can be adjusted without a code
 * change. Defaults mirror scripts/censor/censor.py (balanced mode: wider
 * padding + stronger blur). Honoured by both the HTTP and the subprocess path.
 */
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

/**
 * True when a censor backend is reachable: a ComfyUI tunnel is configured (the
 * cloud service is derived from it as `${baseUrl}/censor`) or CENSOR_PYTHON (the
 * local CPU sidecar) is set. The tunnel URL lives in app settings, not env, so
 * callers that know it pass it to {@link censorImages} directly.
 */
export function isCensorConfigured(hasComfyTunnel: boolean): boolean {
  return hasComfyTunnel || Boolean(process.env.CENSOR_PYTHON);
}

function statusFromHeader(header: string | null): MaskStatus {
  // The service tags each response with the real outcome; default to
  // "censored" (the safe assumption) if the header is missing.
  return header === "clean" || header === "censored" ? header : "censored";
}

/**
 * Censors a batch against the GPU cloud service (censor_server.py on the Colab
 * machine), reached through the SAME tunnel as ComfyUI at `${baseUrl}/censor`.
 * One POST per image carrying the raw bytes; the reply body is the masked PNG
 * and `X-Mask-Status` says censored|clean.
 *
 * When the service is not reachable -- the user hasn't started it (Cell 7.5),
 * an older gateway without the /censor route (404), the service process being
 * down (502), or a network/timeout issue -- the item is marked "skipped" (not
 * "failed"), so the UI shows "chưa cấu hình che ảnh" instead of a red error and
 * the generated image still saves fine. Only a real processing error (a 4xx/5xx
 * with a body from a running service) is recorded as "failed".
 */
async function censorViaHttp(items: CensorItem[], censorUrl: string, params: CensorParams): Promise<CensorResult[]> {
  const url = new URL(censorUrl);
  url.searchParams.set("threshold", String(params.threshold));
  url.searchParams.set("padding", String(params.padding));
  url.searchParams.set("blur_radius", String(params.blur_radius));
  url.searchParams.set("feather", String(params.feather));

  const headers: Record<string, string> = {
    "Content-Type": "application/octet-stream",
    // Skip the LocalTunnel/Cloudflare interstitial, same as ComfyClient.
    "bypass-tunnel-reminder": "1",
  };
  // Parity with ComfyClient: authenticate through the gateway if a token is set.
  if (process.env.COMFY_GATEWAY_TOKEN) {
    headers.Authorization = `Bearer ${process.env.COMFY_GATEWAY_TOKEN}`;
  }

  const results: CensorResult[] = [];
  for (const item of items) {
    try {
      const data = await fs.readFile(item.input);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers,
          body: new Uint8Array(data),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (response.status === 404 || response.status === 502) {
        // Gateway reachable but censor service not wired up / down -> treat as
        // "not configured" rather than an error.
        results.push({ ...item, status: "skipped" });
        continue;
      }
      if (!response.ok) {
        results.push({ ...item, status: "failed", error: `Censor service trả HTTP ${response.status}` });
        continue;
      }

      const masked = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(item.output, masked);
      results.push({ ...item, status: statusFromHeader(response.headers.get("x-mask-status")) });
    } catch (error) {
      // Network error / connection refused / abort(timeout): the service isn't
      // reachable -> skipped, not failed.
      if (error instanceof Error && error.message.includes("ENOENT")) {
        // The input file genuinely failed to read -- that IS an error.
        results.push({ ...item, status: "failed", error: error.message });
      } else {
        results.push({ ...item, status: "skipped" });
      }
    }
  }
  return results;
}

/**
 * Censors a batch with the local NudeNet sidecar (scripts/censor/censor.py),
 * loaded once for the whole batch. Used as a fallback when no ComfyUI tunnel is
 * configured (local dev / offline). Requires CENSOR_PYTHON to point at a Python
 * with nudenet installed (see scripts/censor/README.md).
 */
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

/**
 * Masks sensitive regions for a whole batch of images. Prefers the GPU cloud
 * service reached through the same tunnel as ComfyUI -- pass `censorUrl`
 * (`${comfyBaseUrl}/censor`) -- and falls back to the local CPU sidecar
 * (CENSOR_PYTHON). When neither is available every item comes back "skipped"
 * instead of throwing, so the app keeps working without a censor backend.
 */
export async function censorImages(items: CensorItem[], censorUrl?: string): Promise<CensorResult[]> {
  if (items.length === 0) return [];

  const params = readParams();
  if (censorUrl) {
    return censorViaHttp(items, censorUrl, params);
  }
  if (process.env.CENSOR_PYTHON) {
    return censorViaSubprocess(items, process.env.CENSOR_PYTHON, params);
  }
  return items.map((item) => ({ ...item, status: "skipped" }));
}
