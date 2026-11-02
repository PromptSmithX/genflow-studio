import { describe, expect, it } from "vitest";
import { createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import { composeBackCover } from "@/lib/images/back-cover";
import type { BackCoverGeometry } from "@/lib/calendar/back-cover-format";

function makeFullBleed11x8_5(): BackCoverGeometry {
  // Bìa sau full-bleed: contentRect = toàn trang (size_px của premade_wall_11x8_5).
  return {
    widthPx: 3375,
    heightPx: 2625,
    contentRect: { x: 0, y: 0, width: 3375, height: 2625 },
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

describe("composeBackCover", () => {
  it("produces an image at exactly the template's print-page size", async () => {
    const geom = makeFullBleed11x8_5();
    const artworks = await Promise.all(Array.from({ length: 12 }, () => makeSolidPng(1152, 952, "#336699")));
    const out = await composeBackCover(artworks, geom);
    const result = await loadImage(out);
    expect(result.width).toBe(geom.widthPx);
    expect(result.height).toBe(geom.heightPx);
  });

  it("fills the whole page edge-to-edge with 12 artworks (no white margins; former barcode/spiral/bottom areas covered)", async () => {
    const geom = makeFullBleed11x8_5();
    const artworks = await Promise.all(Array.from({ length: 12 }, () => makeSolidPng(1152, 952, "#ff0000")));
    const ctx = await render(await composeBackCover(artworks, geom));

    const points: Array<[number, number]> = [
      [0, 0], // góc trên-trái
      [geom.widthPx - 1, 0], // góc trên-phải (dải lò xo cũ)
      [0, geom.heightPx - 1], // góc dưới-trái
      [geom.widthPx - 1, geom.heightPx - 1], // góc dưới-phải (vùng mã vạch cũ)
      [Math.floor(geom.widthPx / 2), geom.heightPx - 20], // giữa đáy (dải trắng cũ)
      [Math.floor(geom.widthPx / 2), Math.floor(geom.heightPx / 2)], // tâm
    ];
    for (const [x, y] of points) {
      expect(pixelAt(ctx, x, y)).toEqual([255, 0, 0]);
    }
  });

  it("leaves unused cells blank when fewer than 12 artworks are given", async () => {
    const geom = makeFullBleed11x8_5();
    const artworks = await Promise.all(Array.from({ length: 3 }, () => makeSolidPng(1152, 952, "#0000ff")));
    const ctx = await render(await composeBackCover(artworks, geom));

    // 3 ảnh -> chỉ lấp hàng đầu (cột 1-3). Ô cuối (hàng 3, cột 4) phải còn trắng.
    expect(pixelAt(ctx, 2953, 2187)).toEqual([255, 255, 255]);
  });
});
