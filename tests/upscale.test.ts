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

/** Ảnh có dải đỏ sát mép trên, dải xanh lá sát mép dưới -- để kiểm tra không bị cắt mép. */
async function makeEdgeBandsSourcePng(width: number, height: number, band: number): Promise<Buffer> {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#ff0000";
  ctx.fillRect(0, 0, width, band);
  ctx.fillStyle = "#00ff00";
  ctx.fillRect(0, height - band, width, band);
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

  it("stretches instead of cropping: content at the very top and bottom edges survives on 11x8.5", async () => {
    // Ảnh gen thật 1152x952 (~1.21) lên khổ 11x8.5 (1.286): cover-crop cũ cắt
    // ~82px mỗi mép trên/dưới (mất chữ bìa); kéo giãn phải giữ nguyên 2 mép.
    const src = await makeEdgeBandsSourcePng(1152, 952, 8);
    const format = makeFormat({ widthPx: 3375, heightPx: 2625 });
    const out = await upscaleToSize(src, format);
    const result = await loadImage(out);
    const canvas = createCanvas(result.width, result.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(result, 0, 0);

    const midX = Math.round(format.widthPx / 2);
    expect(isReddish(ctx, midX, 1)).toBe(true);
    expect(isGreenish(ctx, midX, format.heightPx - 2)).toBe(true);
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
