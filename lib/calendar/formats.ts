import fs from "node:fs/promises";
import path from "node:path";

export interface CalendarFormat {
  id: string;
  label: string;
  widthPx: number;
  heightPx: number;
  dpi: number;
}

interface FormatJson {
  id?: string;
  _source?: string;
  size_px?: [number, number];
  dpi?: number;
}

const TEMPLATES_DIR = "Printify_Premade_Grid_Calendar_Templates";

/**
 * Builds a friendly label. Prefers the real inch size parsed out of `_source`
 * (e.g. "...11x8.5in...") and always appends the pixel size, since that is what
 * the upscaler targets.
 */
function buildLabel(source: string | undefined, widthPx: number, heightPx: number): string {
  const inch = source?.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*in/i);
  const px = `${widthPx}×${heightPx}px`;
  return inch ? `${inch[1]}×${inch[2]}" · ${px}` : px;
}

/**
 * Lists the Printify calendar page formats available to upscale toward, read
 * from `Printify_Premade_Grid_Calendar_Templates/*\/format.json`. Each format's
 * `size_px` is the exact print-page pixel size (at 300 DPI) the upscaler should
 * produce. Folders without a valid format.json are skipped. Sorted largest-first
 * so the default pick serves both calendar sizes.
 */
export async function listCalendarFormats(): Promise<CalendarFormat[]> {
  const root = path.join(/* turbopackIgnore: true */ process.cwd(), TEMPLATES_DIR);

  let entries: string[];
  try {
    entries = await fs.readdir(root);
  } catch {
    return [];
  }

  const formats: CalendarFormat[] = [];
  for (const entry of entries) {
    const formatPath = path.join(root, entry, "format.json");
    try {
      const raw = await fs.readFile(formatPath, "utf-8");
      const parsed = JSON.parse(raw) as FormatJson;
      const size = parsed.size_px;
      if (!Array.isArray(size) || size.length !== 2) continue;
      const [widthPx, heightPx] = size;
      if (!Number.isFinite(widthPx) || !Number.isFinite(heightPx)) continue;
      formats.push({
        id: parsed.id ?? entry,
        label: buildLabel(parsed._source, widthPx, heightPx),
        widthPx,
        heightPx,
        dpi: parsed.dpi ?? 300,
      });
    } catch {
      // Thư mục không phải template hợp lệ (thiếu/hỏng format.json) -> bỏ qua.
    }
  }

  return formats.sort((a, b) => b.widthPx * b.heightPx - a.widthPx * a.heightPx);
}
