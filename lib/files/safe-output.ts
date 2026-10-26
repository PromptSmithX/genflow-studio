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

export function buildWorkflowUploadFilename(originalFilename: string): string {
  const base = sanitizeFilenameSegment(path.basename(originalFilename, path.extname(originalFilename)));
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = crypto.randomBytes(4).toString("hex");
  return `${timestamp}_${base}_${suffix}.json`;
}
