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
