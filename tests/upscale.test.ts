import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import type { GeneratedImage } from "@prisma/client";
import { upscaleToSize } from "@/lib/images/upscale";
import { resolveUpscaledRoot, resolveUpscaledCensoredRoot } from "@/lib/output-dir";
import { resolveImageVariant, type VariantRoots } from "@/lib/images/variant";

async function makeSourcePng(width: number, height: number): Promise<Buffer> {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ff0000";
  ctx.fillRect(0, 0, width, height);
  return canvas.encode("png");
}

describe("upscaleToSize", () => {
  it("produces an image at exactly the target dimensions", async () => {
    const src = await makeSourcePng(64, 48);
    const out = await upscaleToSize(src, 300, 240);
    const result = await loadImage(out);
    expect(result.width).toBe(300);
    expect(result.height).toBe(240);
  });

  it("upscales a square source toward a landscape print page", async () => {
    const src = await makeSourcePng(100, 100);
    const out = await upscaleToSize(src, 3375, 2625);
    const result = await loadImage(out);
    expect(result.width).toBe(3375);
    expect(result.height).toBe(2625);
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
