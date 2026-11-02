import { createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import type { BackCoverGeometry } from "@/lib/calendar/back-cover-format";

const GRID_COLS = 4;
const GRID_ROWS = 3;
const CELL_GAP_PX = 0; // full-bleed: 12 ảnh phủ kín, không khe trắng giữa các ô
const BACKGROUND_COLOR = "#FFFFFF";

/**
 * Cover-crop + center một ảnh vào đúng ô (x,y,w,h) -- cùng công thức
 * "scale theo cạnh lớn hơn rồi căn giữa" của lib/images/upscale.ts, chỉ khác
 * là vẽ vào một vùng con của canvas thay vì phủ kín toàn canvas.
 */
async function drawCover(
  ctx: SKRSContext2D,
  image: Awaited<ReturnType<typeof loadImage>>,
  x: number,
  y: number,
  w: number,
  h: number,
): Promise<void> {
  const { width, height } = image;
  const scale = Math.max(w / width, h / height);
  const drawW = width * scale;
  const drawH = height * scale;
  const dx = x + (w - drawW) / 2;
  const dy = y + (h - drawH) / 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(image, dx, dy, drawW, drawH);
  ctx.restore();
}

/**
 * Ghép tối đa 12 artwork thành lưới 4 cột x 3 hàng phủ KÍN TOÀN TRANG in
 * (`geom.contentRect` = toàn khổ `geom.widthPx x geom.heightPx`), các ô khít
 * nhau không khe trắng. Nền trắng chỉ còn ý nghĩa dự phòng: nếu có ít hơn 12
 * ảnh thì các ô trống để nền trắng, không kéo giãn ô đã có.
 */
export async function composeBackCover(artworks: Buffer[], geom: BackCoverGeometry): Promise<Buffer> {
  const canvas = createCanvas(geom.widthPx, geom.heightPx);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.fillStyle = BACKGROUND_COLOR;
  ctx.fillRect(0, 0, geom.widthPx, geom.heightPx);

  const { x: originX, y: originY, width: areaW, height: areaH } = geom.contentRect;
  // Biên cột/hàng làm tròn về số nguyên để các ô khít nhau tuyệt đối, không để
  // lại đường kẻ trắng mảnh do lệch pixel khi full-bleed.
  const colEdge = (c: number) => Math.round(originX + (areaW * c) / GRID_COLS);
  const rowEdge = (r: number) => Math.round(originY + (areaH * r) / GRID_ROWS);

  const items = artworks.slice(0, GRID_COLS * GRID_ROWS);
  for (let i = 0; i < items.length; i++) {
    const col = i % GRID_COLS;
    const row = Math.floor(i / GRID_COLS);
    const cellX = colEdge(col);
    const cellY = rowEdge(row);
    const cellW = colEdge(col + 1) - cellX - (col < GRID_COLS - 1 ? CELL_GAP_PX : 0);
    const cellH = rowEdge(row + 1) - cellY - (row < GRID_ROWS - 1 ? CELL_GAP_PX : 0);

    const image = await loadImage(items[i]);
    await drawCover(ctx, image, cellX, cellY, cellW, cellH);
  }

  return canvas.encode("png");
}
