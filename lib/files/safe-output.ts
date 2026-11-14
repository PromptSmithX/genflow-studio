import path from "node:path";
import crypto from "node:crypto";

/**
 * Resolves a relative path against a root directory and rejects any
 * traversal/symlink-style escape outside that root, so generated image
 * paths stored in the DB (or workflow upload destinations) can never be
 * used to read/write files elsewhere on disk.
 */
export function resolveSafePath(root: string, relativePath: string): string {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(resolvedRoot, relativePath);

  const rootWithSep = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(rootWithSep)) {
    throw new Error(`Path "${relativePath}" escapes the allowed root "${root}"`);
  }

  return resolvedTarget;
}

const SAFE_FILENAME_RE = /[^a-zA-Z0-9._-]/g;

export function sanitizeFilenameSegment(input: string): string {
  const cleaned = input.replace(SAFE_FILENAME_RE, "_");
  return cleaned.length > 0 ? cleaned : "file";
}

/**
 * Builds a collision-resistant, filesystem-safe filename for a downloaded
 * ComfyUI output image: timestamp + job id + short random suffix, keeping
 * the original extension.
 */
export function buildOutputFilename(jobId: string, originalFilename: string): string {
  const ext = path.extname(originalFilename) || ".png";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeJobId = sanitizeFilenameSegment(jobId);
  const suffix = crypto.randomBytes(4).toString("hex");
  return `${timestamp}_${safeJobId}_${suffix}${ext}`;
}

/**
 * Slug cũ dùng khi batch chưa có r2SkuBase (bộ tạo trước khi đổi sang đặt tên
 * theo SKU, hoặc ensureSkuBase lỡ thất bại). Định dạng:
 * `YYYY-MM-DD_HH-mm_<nhãn>_<6 ký tự cuối id>`, thời gian theo local của máy chạy
 * app, nhãn lấy từ ideaPrompt đã sanitize + cắt ~40 ký tự.
 */
function buildLegacyBatchFolder(batch: { id: string; ideaPrompt: string; createdAt: Date }): string {
  const d = batch.createdAt;
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
  const label = sanitizeFilenameSegment(batch.ideaPrompt).slice(0, 40).replace(/_+$/, "");
  const shortId = batch.id.slice(-6);
  return [stamp, label, shortId].filter(Boolean).join("_");
}

/**
 * Tên folder gom toàn bộ output của một batch (ảnh gen / censor / upscale) và
 * folder kết quả cho người dùng. Ưu tiên dùng thẳng mã SKU đã gán cho batch
 * (vd "CAL-REA-2611-U8QMB" -- cùng định dạng với Excel/Sheets/R2) để dễ đối
 * chiếu; rơi về slug thời gian cũ nếu batch chưa có r2SkuBase. Tính xác định
 * với cùng input nên mọi job trong batch cùng ra một folder.
 */
export function buildBatchFolder(batch: {
  id: string;
  ideaPrompt: string;
  createdAt: Date;
  r2SkuBase?: string | null;
}): string {
  if (batch.r2SkuBase) return batch.r2SkuBase;
  return buildLegacyBatchFolder(batch);
}

export function buildWorkflowUploadFilename(originalFilename: string): string {
  const base = sanitizeFilenameSegment(path.basename(originalFilename, path.extname(originalFilename)));
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = crypto.randomBytes(4).toString("hex");
  return `${timestamp}_${base}_${suffix}.json`;
}
