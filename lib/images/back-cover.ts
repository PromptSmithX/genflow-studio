import { createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import type { BackCoverGeometry } from "@/lib/calendar/back-cover-format";
import { PRINT_DPI, withPngDpi } from "@/lib/images/png-dpi";

const GRID_COLS = 4;
const GRID_ROWS = 3;
const CELL_GAP_RATIO = 0.015; // khe trắng giữa các ô, tính theo chiều rộng vùng an toàn
const CORNER_RADIUS_RATIO = 0.05; // bán kính bo góc, tính theo cạnh ngắn của ảnh đã vẽ
const BACKGROUND_COLOR = "#FFFFFF";

/** Scale "contain" (thấy toàn bộ ảnh, không crop), căn giữa trong ô, bo góc. */
function drawContainRounded(
  ctx: SKRSContext2D,
  image: Awaited<ReturnType<typeof loadImage>>,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const { width, height } = image;
  const scale = Math.min(w / width, h / height);
  const drawW = width * scale;
  const drawH = height * scale;
  const dx = x + (w - drawW) / 2;
  const dy = y + (h - drawH) / 2;
  const radius = Math.min(drawW, drawH) * CORNER_RADIUS_RATIO;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(dx, dy, drawW, drawH, radius);
  ctx.clip();
  ctx.drawImage(image, dx, dy, drawW, drawH);
  ctx.restore();
}

/**
 * Ghép tối đa 12 artwork thành lưới 4 cột x 3 hàng trong vùng an toàn
 * `geom.contentRect`, có khe trắng giữa các ô; mỗi ảnh hiển thị trọn vẹn và bo
 * góc. Ít hơn 12 ảnh thì các ô còn lại để trắng.
 */
export async function composeBackCover(artworks: Buffer[], geom: BackCoverGeometry): Promise<Buffer> {
  const canvas = createCanvas(geom.widthPx, geom.heightPx);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.fillStyle = BACKGROUND_COLOR;
  ctx.fillRect(0, 0, geom.widthPx, geom.heightPx);

  const { x: originX, y: originY, width: areaW, height: areaH } = geom.contentRect;
  const gap = Math.round(areaW * CELL_GAP_RATIO);
  const cellW = (areaW - gap * (GRID_COLS - 1)) / GRID_COLS;
  const cellH = (areaH - gap * (GRID_ROWS - 1)) / GRID_ROWS;

  const items = artworks.slice(0, GRID_COLS * GRID_ROWS);
  for (let i = 0; i < items.length; i++) {
    const col = i % GRID_COLS;
    const row = Math.floor(i / GRID_COLS);
    const cellX = originX + col * (cellW + gap);
    const cellY = originY + row * (cellH + gap);

    const image = await loadImage(items[i]);
    drawContainRounded(ctx, image, cellX, cellY, cellW, cellH);
  }

  return withPngDpi(await canvas.encode("png"), PRINT_DPI);
}
