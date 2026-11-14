import path from "node:path";
import type { AppSettings } from "@prisma/client";
import { getDataRoot } from "@/lib/paths";

/**
 * Internal working root (raw ComfyUI downloads) inside the app data dir. All the
 * other internal roots below are siblings of it. The user-chosen folder only
 * receives the tidy results folder -- see resolveResultsRoot.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept so existing resolveOutputRoot(settings) call sites don't need touching
export function resolveOutputRoot(_settings?: AppSettings): string {
  return path.join(/* turbopackIgnore: true */ getDataRoot(), "outputs");
}

/** Where masked (censored) copies are mirrored to, as a sibling of the output root. */
export function resolveCensoredRoot(outputRoot: string): string {
  const parent = path.dirname(outputRoot);
  const base = path.basename(outputRoot);
  return path.join(parent, `${base}_censored`);
}

/**
 * Where the print-ready upscaled copies of the ORIGINAL (unmasked) images live,
 * as a sibling of the output root -- e.g. "../data/outputs" ->
 * "../data/outputs_upscaled".
 */
export function resolveUpscaledRoot(outputRoot: string): string {
  const parent = path.dirname(outputRoot);
  const base = path.basename(outputRoot);
  return path.join(parent, `${base}_upscaled`);
}

/** Sibling root for the upscaled copies of the MASKED (censored) images. */
export function resolveUpscaledCensoredRoot(outputRoot: string): string {
  const parent = path.dirname(outputRoot);
  const base = path.basename(outputRoot);
  return path.join(parent, `${base}_upscaled_censored`);
}

/**
 * Where the composited back-cover image of a batch (12 artworks collaged into
 * one print-page) lives, as a sibling of the output root -- e.g.
 * "../data/outputs" -> "../data/outputs_backcovers". One file per batch, at
 * "<batchId>/back_cover.png".
 */
export function resolveBackCoverRoot(outputRoot: string): string {
  const parent = path.dirname(outputRoot);
  const base = path.basename(outputRoot);
  return path.join(parent, `${base}_backcovers`);
}

/**
 * Where the tidy, ready-to-deliver export of a batch lives, as a sibling of the
 * output root -- e.g. "../data/outputs" -> "../data/outputs_final". Per batch:
 * "<slug>/khong-che/" (14 uncensored) and "<slug>/da-che/" (13 censored + the
 * uncensored back cover), files renamed to print order. This is a COPY of the
 * upscaled/censored/back-cover roots; those stay the internal source of truth.
 */
export function resolveFinalRoot(outputRoot: string): string {
  const parent = path.dirname(outputRoot);
  const base = path.basename(outputRoot);
  return path.join(parent, `${base}_final`);
}

/**
 * Thư mục kết quả cho người dùng = thư mục họ chọn (settings.outputDirectory).
 * Mỗi batch: "<slug>/{14x11.5,11x8.5}/" (chỉ bản org), "<slug>/previews/",
 * "<slug>/etsy.txt" -- xem lib/generations/results-folder.ts. Nếu trùng work
 * root (để mặc định "outputs") thì dùng "outputs_ket-qua" để không đè ảnh gốc.
 * Turbopack không scope được path.join theo giá trị DB nên phải ignore;
 * resolveSafePath mới là thứ chặn thoát khỏi root.
 */
export function resolveResultsRoot(settings: AppSettings): string {
  const chosen = path.isAbsolute(settings.outputDirectory)
    ? settings.outputDirectory
    : path.join(/* turbopackIgnore: true */ getDataRoot(), settings.outputDirectory);
  const workRoot = resolveOutputRoot();
  if (path.resolve(chosen).toLowerCase() === path.resolve(workRoot).toLowerCase()) {
    return path.join(path.dirname(workRoot), `${path.basename(workRoot)}_ket-qua`);
  }
  return chosen;
}
