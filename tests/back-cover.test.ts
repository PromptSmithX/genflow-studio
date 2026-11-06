import { describe, expect, it } from "vitest";
import { createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import { composeBackCover } from "@/lib/images/back-cover";
import { loadBackCoverGeometry, type BackCoverGeometry } from "@/lib/calendar/back-cover-format";

const WHITE: [number, number, number] = [255, 255, 255];
const RED: [number, number, number] = [255, 0, 0];

function makeSafeZone11x8_5(): BackCoverGeometry {
  // Vùng an toàn premade_wall_11x8_5: margin 112, né lò xo (y<148) và ô mã vạch (y>=2282).
  return {
    widthPx: 3375,
    heightPx: 2625,
    contentRect: { x: 112, y: 260, width: 3151, height: 1910 },
  };
}

async function makeSolidPng(width: number, height: number, hex: string): Promise<Buffer> {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, width, height);
  return canvas.encode("png");
}

function pixelAt(ctx: SKRSContext2D, x: number, y: number): [number, number, number] {
  const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
  return [r, g, b];
}

async function render(out: Buffer): Promise<SKRSContext2D> {
  const result = await loadImage(out);
  const canvas = createCanvas(result.width, result.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(result, 0, 0);
  return ctx;
}

describe("loadBackCoverGeometry", () => {
  it("keeps the grid area clear of margins, spiral, hanging hole and barcode box", async () => {
    const geom = await loadBackCoverGeometry("premade_wall_11x8_5");
    expect(geom).not.toBeNull();
    const { x, y, width, height } = geom!.contentRect;
    expect(x).toBeGreaterThanOrEqual(112);
    expect(x + width).toBeLessThanOrEqual(3375 - 112);
    expect(y).toBeGreaterThanOrEqual(148);
    expect(y + height).toBeLessThanOrEqual(2282);
    expect(y + height).toBeLessThanOrEqual(2512 - 70);
  });
});

describe("composeBackCover", () => {
  it("produces an image at exactly the template's print-page size", async () => {
    const geom = makeSafeZone11x8_5();
    const artworks = await Promise.all(Array.from({ length: 12 }, () => makeSolidPng(1152, 952, "#336699")));
    const out = await composeBackCover(artworks, geom);
    const result = await loadImage(out);
    expect(result.width).toBe(geom.widthPx);
    expect(result.height).toBe(geom.heightPx);
  });

  it("stays inside the safe zone with white gaps between cells and rounded corners", async () => {
    const geom = makeSafeZone11x8_5();
    const artworks = await Promise.all(Array.from({ length: 12 }, () => makeSolidPng(1152, 952, "#ff0000")));
    const ctx = await render(await composeBackCover(artworks, geom));

    const whitePoints: Array<[number, number]> = [
      [0, 0], // góc trang
      [1687, 100], // vùng lò xo
      [3200, 2500], // ô mã vạch
      [1687, 2512], // lỗ treo
      [888, 563], // khe giữa cột 1 và cột 2
      [488, 889], // khe giữa hàng 1 và hàng 2
      [123, 261], // góc trên-trái ô đầu tiên (bo góc)
    ];
    for (const [x, y] of whitePoints) {
      expect(pixelAt(ctx, x, y), `(${x},${y})`).toEqual(WHITE);
    }

    const cellCenters: Array<[number, number]> = [
      [488, 563],
      [2887, 563],
      [488, 1867],
      [2887, 1867],
    ];
    for (const [x, y] of cellCenters) {
      expect(pixelAt(ctx, x, y), `(${x},${y})`).toEqual(RED);
    }
  });

  it("shows the whole image without cropping when aspect ratio differs from the cell", async () => {
    const geom = makeSafeZone11x8_5();
    const ctx = await render(await composeBackCover([await makeSolidPng(2000, 500, "#ff0000")], geom));

    // Ảnh rộng -> chiếm toàn bộ chiều ngang ô, chừa trắng phía trên/dưới.
    expect(pixelAt(ctx, 115, 563)).toEqual(RED);
    expect(pixelAt(ctx, 861, 563)).toEqual(RED);
    expect(pixelAt(ctx, 488, 300)).toEqual(WHITE);
    expect(pixelAt(ctx, 488, 830)).toEqual(WHITE);
  });

  it("leaves unused cells blank when fewer than 12 artworks are given", async () => {
    const geom = makeSafeZone11x8_5();
    const artworks = await Promise.all(Array.from({ length: 3 }, () => makeSolidPng(1152, 952, "#0000ff")));
    const ctx = await render(await composeBackCover(artworks, geom));

    expect(pixelAt(ctx, 2887, 1867)).toEqual(WHITE);
  });
});
