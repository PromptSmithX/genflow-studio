import fs from "node:fs/promises";
import path from "node:path";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BackCoverGeometry {
  widthPx: number;
  heightPx: number;
  /** Vùng an toàn để vẽ lưới artwork: thụt lề + né lò xo, lỗ treo, ô mã vạch. */
  contentRect: Rect;
}

interface KeepOut {
  rect?: [number, number, number, number];
  circle?: [number, number, number];
}

interface FormatJson {
  size_px?: [number, number];
  text_margin_px?: number;
  pages?: { back_cover?: { keep_out?: KeepOut[] } };
}

const TEMPLATES_DIR = "Printify_Premade_Grid_Calendar_Templates";

/** Trả về [top, bottom] theo trục y của một keep-out, hoặc null nếu không hợp lệ. */
function keepOutYSpan(k: KeepOut): [number, number] | null {
  if (Array.isArray(k.rect) && k.rect.length === 4) return [k.rect[1], k.rect[3]];
  if (Array.isArray(k.circle) && k.circle.length === 3) {
    const [, cy, r] = k.circle;
    return [cy - r, cy + r];
  }
  return null;
}

/**
 * Đọc `Printify_Premade_Grid_Calendar_Templates/<id>/format.json` để lấy khổ in
 * và tính vùng an toàn cho lưới bìa sau: trang thụt `text_margin_px` mỗi cạnh,
 * rồi mỗi keep-out ở nửa trên đẩy mép trên xuống dưới nó (+margin), keep-out ở
 * nửa dưới kéo mép dưới lên trên nó (-margin).
 */
export async function loadBackCoverGeometry(formatId: string): Promise<BackCoverGeometry | null> {
  const formatPath = path.join(
    /* turbopackIgnore: true */ process.cwd(),
    TEMPLATES_DIR,
    formatId,
    "format.json",
  );

  let parsed: FormatJson;
  try {
    const raw = await fs.readFile(formatPath, "utf-8");
    parsed = JSON.parse(raw) as FormatJson;
  } catch {
    return null;
  }

  const size = parsed.size_px;
  if (!Array.isArray(size) || size.length !== 2) return null;
  const [widthPx, heightPx] = size;
  if (!Number.isFinite(widthPx) || !Number.isFinite(heightPx)) return null;

  const margin = Number.isFinite(parsed.text_margin_px) ? Math.max(0, parsed.text_margin_px as number) : 0;
  let top = margin;
  let bottom = heightPx - margin;
  const left = margin;
  const right = widthPx - margin;

  for (const k of parsed.pages?.back_cover?.keep_out ?? []) {
    const span = keepOutYSpan(k);
    if (!span) continue;
    const [kTop, kBottom] = span;
    if ((kTop + kBottom) / 2 < heightPx / 2) {
      top = Math.max(top, kBottom + margin);
    } else {
      bottom = Math.min(bottom, kTop - margin);
    }
  }

  if (bottom <= top || right <= left) {
    return { widthPx, heightPx, contentRect: { x: 0, y: 0, width: widthPx, height: heightPx } };
  }

  const contentRect: Rect = {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.round(right - left),
    height: Math.round(bottom - top),
  };
  return { widthPx, heightPx, contentRect };
}
