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
  /** Vùng vẽ lưới artwork. Bìa sau dùng full-bleed nên = toàn trang in. */
  contentRect: Rect;
}

interface FormatJson {
  size_px?: [number, number];
}

const TEMPLATES_DIR = "Printify_Premade_Grid_Calendar_Templates";

/**
 * Đọc `Printify_Premade_Grid_Calendar_Templates/<id>/format.json` (cùng nguồn
 * với lib/calendar/formats.ts) để lấy kích thước trang in của bìa sau.
 *
 * Bìa sau dùng kiểu LẤP ĐẦY TOÀN TRANG (full-bleed): 12 artwork phủ kín toàn bộ
 * khổ in, không chừa lề hay né keep-out. Lỗ treo và ô mã vạch nhà in sẽ đục/đè
 * lên ảnh khi in (phần ảnh đó bị cắt -- chấp nhận được), nên không cần tính vùng
 * an toàn như front_cover/month.
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

  // Full-bleed: lưới phủ kín toàn trang.
  const contentRect: Rect = { x: 0, y: 0, width: widthPx, height: heightPx };

  return { widthPx, heightPx, contentRect };
}
