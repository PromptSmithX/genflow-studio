import { describe, expect, it } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { withPngDpi } from "@/lib/images/png-dpi";
import { upscaleToSize } from "@/lib/images/upscale";

function physChunks(png: Buffer): { x: number; y: number; unit: number }[] {
  const found = [];
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    if (png.toString("latin1", offset + 4, offset + 8) === "pHYs") {
      found.push({ x: png.readUInt32BE(offset + 8), y: png.readUInt32BE(offset + 12), unit: png.readUInt8(offset + 16) });
    }
    offset += 12 + length;
  }
  return found;
}

async function makePng(width: number, height: number): Promise<Buffer> {
  const canvas = createCanvas(width, height);
  canvas.getContext("2d").fillRect(0, 0, width, height);
  return canvas.encode("png");
}

describe("withPngDpi", () => {
  it("writes a 300 DPI pHYs chunk and keeps the image readable", async () => {
    const out = withPngDpi(await makePng(40, 30), 300);
    expect(physChunks(out)).toEqual([{ x: 11811, y: 11811, unit: 1 }]);
    const image = await loadImage(out);
    expect([image.width, image.height]).toEqual([40, 30]);
  });

  it("replaces an existing pHYs chunk instead of adding a second one", async () => {
    const out = withPngDpi(withPngDpi(await makePng(10, 10), 96), 300);
    expect(physChunks(out)).toEqual([{ x: 11811, y: 11811, unit: 1 }]);
  });

  it("upscaled print pages carry the format DPI", async () => {
    const out = await upscaleToSize(await makePng(64, 48), {
      id: "t",
      label: "t",
      widthPx: 330,
      heightPx: 255,
      dpi: 300,
    });
    expect(physChunks(out)).toEqual([{ x: 11811, y: 11811, unit: 1 }]);
  });
});
