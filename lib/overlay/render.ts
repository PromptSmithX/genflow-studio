import path from "node:path";
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import type { OverlaySpec, TextLayer } from "@/lib/validations/llm";
import { resolveLayers } from "@/lib/overlay/layout";

const FONT_FAMILY: Record<TextLayer["style"], string> = {
  serif: "Playfair Display",
  "bold-caps": "Anton",
  "tall-caps": "Bebas Neue",
  script: "Great Vibes",
  sans: "Montserrat",
};

let fontsRegistered = false;
function registerFonts(): void {
  if (fontsRegistered) return;
  const dir = path.join(/* turbopackIgnore: true */ process.cwd(), "assets", "fonts");
  GlobalFonts.registerFromPath(path.join(dir, "Anton-Regular.ttf"), "Anton");
  GlobalFonts.registerFromPath(path.join(dir, "BebasNeue-Regular.ttf"), "Bebas Neue");
  GlobalFonts.registerFromPath(path.join(dir, "PlayfairDisplay-Bold.ttf"), "Playfair Display");
  GlobalFonts.registerFromPath(path.join(dir, "GreatVibes-Regular.ttf"), "Great Vibes");
  GlobalFonts.registerFromPath(path.join(dir, "Montserrat-SemiBold.ttf"), "Montserrat");
  fontsRegistered = true;
}

/**
 * Vẽ các textLayers (từ OverlaySpec) lên ảnh đã gen và trả về PNG buffer mới.
 * Model chỉ gen ảnh sạch; mọi chữ được compose ở đây bằng canvas nên luôn nét
 * và canh đúng, không phụ thuộc khả năng vẽ chữ của model.
 */
export async function renderOverlay(imageBuffer: Buffer, spec: OverlaySpec): Promise<Buffer> {
  registerFonts();

  const img = await loadImage(imageBuffer);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  const layers = resolveLayers(spec.textLayers, img.width, img.height);

  for (const layer of layers) {
    const family = FONT_FAMILY[layer.style];
    const text = layer.uppercase ? layer.text.toUpperCase() : layer.text;

    // Co cỡ chữ cho vừa bề ngang cho phép.
    let fontSize = layer.fontSizePx;
    ctx.font = `${fontSize}px "${family}"`;
    let width = ctx.measureText(text).width;
    if (width > layer.maxWidth && width > 0) {
      fontSize = Math.max(8, Math.floor((fontSize * layer.maxWidth) / width));
      ctx.font = `${fontSize}px "${family}"`;
    }

    ctx.textAlign = layer.align;
    ctx.textBaseline = "top";

    // Bóng đổ tăng độ đọc trên nền bất kỳ.
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = Math.max(2, Math.round(fontSize * 0.06));
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = Math.max(1, Math.round(fontSize * 0.02));

    // Viền tối mảnh.
    ctx.lineWidth = Math.max(1, fontSize * 0.05);
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.strokeText(text, layer.x, layer.y);

    // Bỏ bóng khi tô để chữ không bị nhòe màu.
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.fillStyle = layer.color || "white";
    ctx.fillText(text, layer.x, layer.y);
  }

  return canvas.toBuffer("image/png");
}
