import { describe, expect, it } from "vitest";
import { finalizeSuggestedImage, finalizeEtsy } from "@/lib/llm/finalize-suggestion";
import type { EtsySuggestion, LlmImageSuggestion } from "@/lib/validations/llm";

function makeImage(overrides: Partial<LlmImageSuggestion> = {}): LlmImageSuggestion {
  return { positive: "a scene", caption: "caption", ...overrides };
}

describe("finalizeSuggestedImage", () => {
  it("cover (isCover=true): keeps title and ensures CALENDAR + title + year text are present", () => {
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

  it("cover: forces year to fixed 2027 even when LLM returns a different year", () => {
    const image = makeImage({ positive: "a scene", year: "2099" });
    const result = finalizeSuggestedImage(image, { isCover: true, isAnimeMedium: false });
    expect(result.year).toBe("2027");
    expect(result.positive.toLowerCase()).toContain('year text "2027"');
    expect(result.positive).not.toContain("2099");
  });

  it("cover: normalizes a wrong year baked in positive and leaves only one 2027", () => {
    const image = makeImage({
      positive: 'cinematic portrait, large bold title text "YUKI", uppercase text "CALENDAR", year text "2025"',
      title: "YUKI",
      year: "2025",
    });
    const result = finalizeSuggestedImage(image, { isCover: true, isAnimeMedium: false });

    // Năm sai (2025) bị chuẩn hoá hết; chỉ còn ĐÚNG MỘT "2027" (chống vẽ lặp).
    expect(result.positive).not.toContain("2025");
    expect(result.positive.toLowerCase()).toContain('year text "2027"');
    expect(result.positive.match(/2027/g)?.length).toBe(1);
  });

  it("cover: strips year baked into the title name", () => {
    const image = makeImage({ positive: "a scene", title: "YUKI 2025", year: "2025" });
    const result = finalizeSuggestedImage(image, { isCover: true, isAnimeMedium: false });
    expect(result.title).toBe("YUKI 2027");
  });

  it("cover with no title/year: defaults to THE COLLECTION and fixed 2027", () => {
    const image = makeImage({ positive: "a scene" });
    const result = finalizeSuggestedImage(image, { isCover: true, isAnimeMedium: false });
    expect(result.title).toBe("THE COLLECTION");
    expect(result.year).toBe("2027");
  });

  it("artwork (isCover=false): strips title/year and front-loads single-subject tags", () => {
    const image = makeImage({ positive: "a scene", title: "LUNA", year: "2027" });
    const result = finalizeSuggestedImage(image, { isCover: false, isAnimeMedium: false });

    expect(result.title).toBeUndefined();
    expect(result.year).toBeUndefined();
    // Giống nhánh anime: cụm single-subject nằm ở ĐẦU positive.
    expect(result.positive.startsWith("solo, one person only")).toBe(true);
  });

  it("artwork + anime: prepends anime single-subject tags", () => {
    const image = makeImage({ positive: "a scene" });
    const result = finalizeSuggestedImage(image, { isCover: false, isAnimeMedium: true });
    expect(result.positive.startsWith("solo, solo focus")).toBe(true);
  });

  it("artwork + anime + couple: preserves couple tags and does NOT prepend solo tags", () => {
    const image = makeImage({ positive: "couple, 1girl, 1boy, lovers embracing on the beach" });
    const result = finalizeSuggestedImage(image, { isCover: false, isAnimeMedium: true });
    expect(result.positive.startsWith("balanced anatomy")).toBe(true);
    expect(result.positive).not.toContain("solo");
    expect(result.positive).not.toContain("no other people");
    expect(result.positive).toContain("couple, 1girl, 1boy");
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

function makeEtsy(overrides: Partial<EtsySuggestion> = {}): EtsySuggestion {
  return { title: "Wall Calendar", description: "A set.", tags: [], ...overrides };
}

describe("finalizeEtsy", () => {
  it("forces any year in title/description/tags to 2027", () => {
    const result = finalizeEtsy(
      makeEtsy({
        title: "Yuki Wall Calendar 2025 | Printable",
        description: "A 2025 calendar for your wall, 12 artworks for 2026.",
        tags: ["2025 calendar", "wall calendar", "gift 2026"],
      }),
    );

    expect(result.title).toContain("2027");
    expect(result.title).not.toContain("2025");
    expect(result.description).not.toContain("2025");
    expect(result.description).not.toContain("2026");
    expect(result.description).toContain("2027");
    expect(result.tags).toContain("2027 calendar");
    expect(result.tags.some((t) => t.includes("2025") || t.includes("2026"))).toBe(false);
  });

  it("strips all digital-delivery wording (lịch in vật lý, không phải file tải)", () => {
    const result = finalizeEtsy(
      makeEtsy({
        title: "Tokyo Wall Calendar 2027 | Printable Digital Download | Gift for Him",
        description:
          "A printable digital download calendar.\n\nWhat's inside\n\nInstant download PDF ready to print at home",
        tags: [
          "digital download",
          "printable calendar",
          "instant download",
          "downloadable art",
          "wall calendar",
          "tokyo photography",
        ],
      }),
    );

    const banned = /digital download|printable|downloadable|instant download|pdf|print at home/i;
    expect(banned.test(result.title)).toBe(false);
    expect(banned.test(result.description)).toBe(false);
    expect(result.tags.every((t) => !banned.test(t))).toBe(true);
    // Title không còn đoạn rỗng giữa 2 dấu gạch.
    expect(result.title).not.toMatch(/\|\s*\|/);
    expect(result.title).toContain("Tokyo Wall Calendar 2027");
    expect(result.title).toContain("Gift for Him");
    // Vẫn đủ 13 tag (bù bằng fallback) và giữ tag sạch do LLM cung cấp.
    expect(result.tags).toHaveLength(13);
    expect(result.tags).toContain("wall calendar");
    expect(result.tags).toContain("tokyo photography");
    // Description giữ cấu trúc xuống dòng.
    expect(result.description).toContain("What's inside");
    expect(result.description).toContain("\n\n");
  });
});
