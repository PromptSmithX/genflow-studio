import type { TextLayer } from "@/lib/validations/llm";

export interface ResolvedLayer {
  text: string;
  x: number;
  y: number;
  fontSizePx: number;
  align: "left" | "center" | "right";
  color: string;
  style: TextLayer["style"];
  maxWidth: number;
  uppercase: boolean;
}

// Cỡ chữ theo chiều cao ảnh; render sẽ co lại nếu vượt maxWidth.
const SIZE_FRACTION: Record<TextLayer["size"], number> = {
  xl: 0.13,
  l: 0.085,
  m: 0.052,
  s: 0.038,
};

// Thứ tự xếp chồng khi nhiều layer cùng một vị trí neo.
const ROLE_ORDER: Record<TextLayer["role"], number> = {
  title: 0,
  year: 1,
  badge: 2,
  quote: 3,
};

const LINE_FACTOR = 1.12;
const MARGIN_FRACTION = 0.05;

type Vertical = "top" | "center" | "bottom";
type Horizontal = "left" | "center" | "right";

function parsePos(pos: TextLayer["pos"]): { vert: Vertical; horiz: Horizontal } {
  if (pos === "center") return { vert: "center", horiz: "center" };
  const [vert, horiz] = pos.split("-") as [Vertical, Horizontal];
  return { vert, horiz };
}

function uppercaseFor(style: TextLayer["style"]): boolean {
  return style === "bold-caps" || style === "tall-caps";
}

/**
 * Chuyển danh sách textLayers (từ LLM) thành các layer đã tính sẵn toạ độ px
 * trên ảnh kích thước (imageW x imageH). Hàm thuần, không phụ thuộc canvas, để
 * dễ unit-test. Layer cùng vị trí neo sẽ được xếp chồng theo thứ tự role.
 */
export function resolveLayers(layers: TextLayer[], imageW: number, imageH: number): ResolvedLayer[] {
  const margin = Math.round(Math.min(imageW, imageH) * MARGIN_FRACTION);
  const maxWidth = imageW - margin * 2;

  // Gom layer theo vị trí neo (vert|horiz).
  const groups = new Map<string, TextLayer[]>();
  for (const layer of layers) {
    const { vert, horiz } = parsePos(layer.pos);
    const key = `${vert}|${horiz}`;
    const list = groups.get(key) ?? [];
    list.push(layer);
    groups.set(key, list);
  }

  const resolved: ResolvedLayer[] = [];

  for (const [key, list] of groups) {
    const [vert, horiz] = key.split("|") as [Vertical, Horizontal];
    const sorted = [...list].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);

    const fontSizes = sorted.map((l) => Math.round(imageH * SIZE_FRACTION[l.size]));
    const lineHeights = fontSizes.map((fs) => fs * LINE_FACTOR);
    const totalHeight = lineHeights.reduce((sum, h) => sum + h, 0);

    let startY: number;
    if (vert === "top") startY = margin;
    else if (vert === "bottom") startY = imageH - margin - totalHeight;
    else startY = imageH / 2 - totalHeight / 2;

    let x: number;
    let align: ResolvedLayer["align"];
    if (horiz === "left") {
      x = margin;
      align = "left";
    } else if (horiz === "right") {
      x = imageW - margin;
      align = "right";
    } else {
      x = imageW / 2;
      align = "center";
    }

    let cursorY = startY;
    sorted.forEach((layer, i) => {
      resolved.push({
        text: layer.text,
        x,
        y: cursorY,
        fontSizePx: fontSizes[i],
        align,
        color: layer.color || "white",
        style: layer.style,
        maxWidth,
        uppercase: uppercaseFor(layer.style),
      });
      cursorY += lineHeights[i];
    });
  }

  return resolved;
}
