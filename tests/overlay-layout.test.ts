import { describe, expect, it } from "vitest";
import { resolveLayers } from "@/lib/overlay/layout";
import type { TextLayer } from "@/lib/validations/llm";

const W = 1000;
const H = 1000;

function layer(partial: Partial<TextLayer> & Pick<TextLayer, "role" | "text" | "pos">): TextLayer {
  return { color: "white", size: "l", style: "bold-caps", ...partial };
}

describe("resolveLayers", () => {
  it("anchors a bottom-center title near the bottom, centered", () => {
    const [r] = resolveLayers([layer({ role: "title", text: "NAME", pos: "bottom-center", size: "xl" })], W, H);
    expect(r.align).toBe("center");
    expect(r.x).toBe(W / 2);
    // bottom-anchored: top of the text sits in the lower half
    expect(r.y).toBeGreaterThan(H / 2);
  });

  it("anchors a top-left layer at the margin with left align", () => {
    const [r] = resolveLayers([layer({ role: "title", text: "NAME", pos: "top-left" })], W, H);
    expect(r.align).toBe("left");
    const margin = Math.round(Math.min(W, H) * 0.05);
    expect(r.x).toBe(margin);
    expect(r.y).toBe(margin);
  });

  it("right-anchored layers align right at width minus margin", () => {
    const [r] = resolveLayers([layer({ role: "badge", text: "12 PHOTOS", pos: "top-right", style: "tall-caps" })], W, H);
    expect(r.align).toBe("right");
    const margin = Math.round(Math.min(W, H) * 0.05);
    expect(r.x).toBe(W - margin);
  });

  it("stacks layers sharing an anchor without overlap, title above year", () => {
    const resolved = resolveLayers(
      [
        layer({ role: "year", text: "2027", pos: "bottom-center", size: "m" }),
        layer({ role: "title", text: "NAME", pos: "bottom-center", size: "xl" }),
      ],
      W,
      H,
    );
    const title = resolved.find((r) => r.text === "NAME")!;
    const year = resolved.find((r) => r.text === "2027")!;
    // title sorted first -> drawn higher (smaller y) than year
    expect(title.y).toBeLessThan(year.y);
    // no overlap: year starts at/after title's line box
    expect(year.y).toBeGreaterThanOrEqual(title.y + title.fontSizePx);
  });

  it("uppercases for bold-caps/tall-caps styles but not script/serif/sans", () => {
    const resolved = resolveLayers(
      [
        layer({ role: "title", text: "name", pos: "bottom-center", style: "bold-caps" }),
        layer({ role: "badge", text: "12 photos", pos: "top-left", style: "tall-caps" }),
        layer({ role: "quote", text: "a quote", pos: "top-right", style: "script" }),
        layer({ role: "year", text: "2027", pos: "center", style: "serif" }),
      ],
      W,
      H,
    );
    expect(resolved.find((r) => r.text === "name")!.uppercase).toBe(true);
    expect(resolved.find((r) => r.text === "12 photos")!.uppercase).toBe(true);
    expect(resolved.find((r) => r.text === "a quote")!.uppercase).toBe(false);
    expect(resolved.find((r) => r.text === "2027")!.uppercase).toBe(false);
  });

  it("does not uppercase sans style", () => {
    const [r] = resolveLayers([layer({ role: "year", text: "2027", pos: "center", style: "sans" })], W, H);
    expect(r.uppercase).toBe(false);
  });

  it("scales font size with the size enum", () => {
    const [xl] = resolveLayers([layer({ role: "title", text: "A", pos: "center", size: "xl" })], W, H);
    const [s] = resolveLayers([layer({ role: "title", text: "A", pos: "center", size: "s" })], W, H);
    expect(xl.fontSizePx).toBeGreaterThan(s.fontSizePx);
  });
});
