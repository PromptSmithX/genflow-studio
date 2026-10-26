import { describe, expect, it } from "vitest";
import { buildPrompts } from "@/lib/prompts/build-prompts";

describe("buildPrompts", () => {
  it("joins global, style, scene, pose and per-image parts in order", () => {
    const result = buildPrompts({
      globalPositive: "high quality",
      globalNegative: "blurry",
      stylePositive: "anime style",
      styleNegative: "extra fingers",
      scenePositive: "in a garden",
      sceneNegative: "indoor",
      posePositive: "standing",
      poseNegative: "sitting",
      imagePositiveOverride: "golden hour",
      imageNegativeOverride: "watermark",
    });

    expect(result.positiveFinal).toBe("high quality, anime style, in a garden, standing, golden hour");
    expect(result.negativeFinal).toBe("blurry, extra fingers, indoor, sitting, watermark");
  });

  it("trims whitespace and drops blank parts without extra separators", () => {
    const result = buildPrompts({
      globalPositive: "  high quality  ",
      globalNegative: "",
      stylePositive: "anime style",
      styleNegative: "",
      scenePositive: "  ",
      sceneNegative: null,
      posePositive: undefined,
      poseNegative: "",
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
      stylePositive: "",
      styleNegative: "",
    });

    expect(result.positiveFinal).toBe("");
    expect(result.negativeFinal).toBe("");
    expect(result.positiveFinal).not.toContain("undefined");
    expect(result.positiveFinal).not.toContain("null");
  });
});
