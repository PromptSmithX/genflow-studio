import path from "node:path";

/**
 * Root directory for all on-disk app data (workflows, generated outputs).
 * Set ANIMA_DATA_DIR when running packaged (Electron sets it to the OS
 * per-user app data folder); falls back to "<cwd>/data" for `next dev`/`next
 * start`, matching the pre-packaging behavior.
 */
export function getDataRoot(): string {
  return process.env.ANIMA_DATA_DIR
    ? process.env.ANIMA_DATA_DIR
    : path.join(/* turbopackIgnore: true */ process.cwd(), "data");
}
