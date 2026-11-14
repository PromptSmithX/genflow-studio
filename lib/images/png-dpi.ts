import zlib from "node:zlib";

export const PRINT_DPI = 300;

const SIGNATURE_LENGTH = 8;
const IHDR_END = SIGNATURE_LENGTH + 4 + 4 + 13 + 4;

function pngChunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/**
 * Ghi DPI vào PNG (chunk pHYs). @napi-rs/canvas không ghi chunk này, thiếu nó
 * Windows/Photoshop mặc định báo 96 DPI dù số pixel đã đủ cho khổ in.
 */
export function withPngDpi(png: Buffer, dpi: number): Buffer {
  const pixelsPerMeter = Math.round(dpi / 0.0254);
  const data = Buffer.alloc(9);
  data.writeUInt32BE(pixelsPerMeter, 0);
  data.writeUInt32BE(pixelsPerMeter, 4);
  data.writeUInt8(1, 8);
  const phys = pngChunk("pHYs", data);

  const chunks: Buffer[] = [png.subarray(0, IHDR_END), phys];
  let offset = IHDR_END;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (png.toString("latin1", offset + 4, offset + 8) !== "pHYs") chunks.push(png.subarray(offset, end));
    offset = end;
  }
  return Buffer.concat(chunks);
}
