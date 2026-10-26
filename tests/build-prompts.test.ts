import { describe, expect, it } from "vitest";
import { buildPrompts } from "@/lib/prompts/build-prompts";

describe("buildPrompts", () => {
  it("joins global, idea, style and per-image parts in order", () => {
    const result = buildPrompts({
      globalPositive: "high quality",
      globalNegative: "blurry",
      idea: "a girl in a garden",
      stylePositive: "anime style",
      styleNegative: "extra fingers",
      imagePositiveOverride: "golden hour",
      imageNegativeOverride: "watermark",
    });

    expect(result.positiveFinal).toBe("high quality, a girl in a garden, anime style, golden hour");
    expect(result.negativeFinal).toBe("blurry, extra fingers, watermark");
  });

  it("trims whitespace and drops blank parts without extra separators", () => {
    const result = buildPrompts({
      globalPositive: "  high quality  ",
      globalNegative: "",
      idea: "  ",
      stylePositive: "anime style",
      styleNegative: "",
      imagePositiveOverride: null,
      imageNegativeOverride: undefined,
    });

    expect(result.positiveFinal).toBe("high quality, anime style");
    expect(result.negativeFinal).toBe("");
  });

  it("never emits the literal strings undefined/null", () => {
    const result = buildPrompts({
      globalPositive: "",
      globalNegative: "",
      idea: "",
      stylePositive: "",
      styleNegative: "",
    });

    expect(result.positiveFinal).toBe("");
    expect(result.negativeFinal).toBe("");
    expect(result.positiveFinal).not.toContain("undefined");
    expect(result.positiveFinal).not.toContain("null");
  });
});
