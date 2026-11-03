import { describe, expect, it } from "vitest";
import { finalizeSuggestedImage } from "@/lib/llm/finalize-suggestion";
import type { LlmImageSuggestion } from "@/lib/validations/llm";

function makeImage(overrides: Partial<LlmImageSuggestion> = {}): LlmImageSuggestion {
  return { positive: "a scene", caption: "caption", ...overrides };
}

describe("finalizeSuggestedImage", () => {
  it("cover (isCover=true): keeps title/year and ensures CALENDAR + title + year text are present", () => {
    const image = makeImage({
      positive: "cinematic portrait, golden hour",
      title: "LUNA",
      year: "2027",
    });
    const result = finalizeSuggestedImage(image, { isCover: true, isAnimeMedium: false });

    expect(result.title).toBe("LUNA");
    expect(result.year).toBe("2027");
    expect(result.positive.toLowerCase()).toContain('title text "luna"');
    expect(result.positive.toLowerCase()).toContain('text "calendar"');
    expect(result.positive.toLowerCase()).toContain('year text "2027"');
  });

  it("cover with no title/year: defaults to THE COLLECTION and next year", () => {
    const image = makeImage({ positive: "a scene" });
    const result = finalizeSuggestedImage(image, { isCover: true, isAnimeMedium: false });
    expect(result.title).toBe("THE COLLECTION");
    expect(result.year).toBe(String(new Date().getFullYear() + 1));
  });

  it("artwork (isCover=false): strips title/year and adds single-subject tags", () => {
    const image = makeImage({ positive: "a scene", title: "LUNA", year: "2027" });
    const result = finalizeSuggestedImage(image, { isCover: false, isAnimeMedium: false });

    expect(result.title).toBeUndefined();
    expect(result.year).toBeUndefined();
    expect(result.positive).toContain("solo, one person only");
  });

  it("artwork + anime: prepends anime single-subject tags", () => {
    const image = makeImage({ positive: "a scene" });
    const result = finalizeSuggestedImage(image, { isCover: false, isAnimeMedium: true });
    expect(result.positive.startsWith("solo, solo focus")).toBe(true);
  });

  it("strips copy-space / negative-space / split-composition phrases from positive", () => {
    const image = makeImage({
      positive: "a scene, copy space at the top, split composition, clean simple floor",
    });
    const result = finalizeSuggestedImage(image, { isCover: false, isAnimeMedium: false });
    expect(result.positive.toLowerCase()).not.toContain("copy space");
    expect(result.positive.toLowerCase()).not.toContain("split composition");
    expect(result.positive.toLowerCase()).not.toContain("clean simple floor");
  });

  it("real-only: strips duplicate-subject phrases (same woman, identical, twins)", () => {
    const image = makeImage({ positive: "a scene, the same woman, identical twins, side by side" });
    const result = finalizeSuggestedImage(image, { isCover: false, isAnimeMedium: false });
    const lower = result.positive.toLowerCase();
    expect(lower).not.toContain("same woman");
    expect(lower).not.toContain("identical");
    expect(lower).not.toContain("twins");
    expect(lower).not.toContain("side by side");
  });

  it("anime: does NOT strip duplicate-subject phrasing (real-only rule)", () => {
    const image = makeImage({ positive: "a scene, the same girl appears" });
    const result = finalizeSuggestedImage(image, { isCover: false, isAnimeMedium: true });
    expect(result.positive).toContain("the same girl appears");
  });
});
