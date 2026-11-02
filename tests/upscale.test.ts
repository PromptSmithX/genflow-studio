import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import type { GeneratedImage } from "@prisma/client";
import { upscaleToSize } from "@/lib/images/upscale";
import { resolveUpscaledRoot, resolveUpscaledCensoredRoot } from "@/lib/output-dir";
import { resolveImageVariant, type VariantRoots } from "@/lib/images/variant";
import type { CalendarFormat } from "@/lib/calendar/formats";

function makeFormat(overrides: Partial<CalendarFormat> = {}): CalendarFormat {
  return {
    id: "test",
    label: "test",
    widthPx: 3375,
    heightPx: 2625,
    dpi: 300,
    ...overrides,
  };
}

async function makeSourcePng(width: number, height: number): Promise<Buffer> {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ff0000";
  ctx.fillRect(0, 0, width, height);
  return canvas.encode("png");
}

/** Ảnh nửa trái đỏ / nửa phải xanh lá, để kiểm tra cover-crop có cắt vào 2 bên hay không. */
async function makeSplitSourcePng(width: number, height: number): Promise<Buffer> {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ff0000";
  ctx.fillRect(0, 0, width / 2, height);
  ctx.fillStyle = "#00ff00";
  ctx.fillRect(width / 2, 0, width / 2, height);
  return canvas.encode("png");
}

function isReddish(ctx: SKRSContext2D, x: number, y: number): boolean {
  const [r, g] = ctx.getImageData(x, y, 1, 1).data;
  return r > 150 && g < 100;
}

function isGreenish(ctx: SKRSContext2D, x: number, y: number): boolean {
  const [r, g] = ctx.getImageData(x, y, 1, 1).data;
  return g > 150 && r < 100;
}

describe("upscaleToSize", () => {
  it("produces an image at exactly the target dimensions", async () => {
    const src = await makeSourcePng(64, 48);
    const out = await upscaleToSize(src, makeFormat({ widthPx: 300, heightPx: 240 }));
    const result = await loadImage(out);
    expect(result.width).toBe(300);
    expect(result.height).toBe(240);
  });

  it("upscales a square source toward a landscape print page", async () => {
    const src = await makeSourcePng(100, 100);
    const out = await upscaleToSize(src, makeFormat({ widthPx: 3375, heightPx: 2625 }));
    const result = await loadImage(out);
    expect(result.width).toBe(3375);
    expect(result.height).toBe(2625);
  });

  it("never crops the sides when the source ratio already matches the calendar formats (only top/bottom get trimmed)", async () => {
    // Tỉ lệ gen thật của app (1152x952 ~ 1.21, xem COVER_DEFAULT_WIDTH/HEIGHT ở
    // assistant-create-form.tsx) -- bằng-hoặc-vuông-hơn mọi khổ lịch, nên
    // cover-crop phải luôn khít theo chiều ngang (không cắt chữ bìa 2 bên).
    const src = await makeSplitSourcePng(1152, 952);
    const format = makeFormat({ widthPx: 3375, heightPx: 2625 }); // 11x8.5", khổ rộng nhất
    const out = await upscaleToSize(src, format);
    const result = await loadImage(out);
    const canvas = createCanvas(result.width, result.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(result, 0, 0);

    const midY = Math.round(format.heightPx / 2);
    expect(isReddish(ctx, 1, midY)).toBe(true);
    expect(isGreenish(ctx, format.widthPx - 2, midY)).toBe(true);
  });
});

describe("output-dir upscale roots", () => {
  const root = path.join("x", "data", "outputs");

  it("derives the upscaled sibling roots", () => {
    expect(resolveUpscaledRoot(root)).toBe(path.join("x", "data", "outputs_upscaled"));
    expect(resolveUpscaledCensoredRoot(root)).toBe(path.join("x", "data", "outputs_upscaled_censored"));
  });
});

describe("resolveImageVariant", () => {
  const roots: VariantRoots = {
    outputRoot: "out",
    censoredRoot: "cen",
    upscaledRoot: "up",
    upscaledCensoredRoot: "upcen",
  };

  const base = {
    relativePath: "a.png",
    maskedRelativePath: "a.png",
    upscaledRelativePath: "a.png",
    upscaledMaskedRelativePath: "a.png",
  } as GeneratedImage;

  it("defaults to the original", () => {
    expect(resolveImageVariant(base, null, roots)).toEqual({ root: "out", relativePath: "a.png", downloadSuffix: "" });
  });

  it("maps each variant to its root", () => {
    expect(resolveImageVariant(base, "masked", roots)?.root).toBe("cen");
    expect(resolveImageVariant(base, "upscaled", roots)?.root).toBe("up");
    expect(resolveImageVariant(base, "upscaled-masked", roots)?.root).toBe("upcen");
  });

  it("returns null when the requested variant has no file", () => {
    const noExtra = { relativePath: "a.png", maskedRelativePath: null, upscaledRelativePath: null, upscaledMaskedRelativePath: null } as GeneratedImage;
    expect(resolveImageVariant(noExtra, "masked", roots)).toBeNull();
    expect(resolveImageVariant(noExtra, "upscaled", roots)).toBeNull();
    expect(resolveImageVariant(noExtra, "upscaled-masked", roots)).toBeNull();
  });
});
