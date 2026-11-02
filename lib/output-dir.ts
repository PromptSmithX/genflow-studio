import path from "node:path";
import type { AppSettings } from "@prisma/client";

/**
 * The output directory is a user-configurable DB value, so Turbopack
 * can't statically scope this path.join and would otherwise trace the
 * whole project into the server bundle. Safe to ignore: resolveSafePath
 * is what actually guards against escaping this root.
 */
export function resolveOutputRoot(settings: AppSettings): string {
  return path.isAbsolute(settings.outputDirectory)
    ? settings.outputDirectory
    : path.join(/* turbopackIgnore: true */ process.cwd(), settings.outputDirectory);
}

/**
 * Where masked (censored) copies are mirrored to, as a sibling of the output
 * root -- e.g. "../data/outputs" -> "../data/outputs_censored" -- so the full
 * masked set can be grabbed from disk without digging through unmasked files.
 */
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
