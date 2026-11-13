import { describe, expect, it } from "vitest";
import { finalizeSuggestedImage, finalizeEtsy, scrubAnimeKeyVisual } from "@/lib/llm/finalize-suggestion";
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

  it("anime: also strips duplicate-subject phrasing", () => {
    const image = makeImage({ positive: "a scene, the same girl appears, side by side" });
    const result = finalizeSuggestedImage(image, { isCover: false, isAnimeMedium: true });
    expect(result.positive).not.toContain("same girl");
    expect(result.positive).not.toContain("side by side");
  });

  const couple = { kind: "couple", tags: "1boy, 1girl", description: "a man and a woman", crowd: false } as const;

  it("anime couple: one count line, LLM scene kept verbatim, count-only anchor tags dropped", () => {
    const scene = "a young man and a young woman on a rooftop, the woman sits on top of the man facing him, from side";
    const result = finalizeSuggestedImage(makeImage({ positive: scene }), {
      isCover: false,
      isAnimeMedium: true,
      subjects: { ...couple, description: "a young man and a young woman" },
      anchorTags: "1boy, 1girl, a young man and a young woman, silver hair, rooftop terrace",
    });
    expect(result.positive.startsWith("balanced anatomy")).toBe(true);
    expect(result.positive.match(/exactly two people: one woman and one man/g)?.length).toBe(1);
    expect(result.positive.endsWith(scene)).toBe(true);
    expect(result.positive).not.toMatch(/1boy|1girl/);
    expect(result.positive).toContain("silver hair");
  });

  it("anime couple: count line is present even when the LLM scene omits the count", () => {
    const image = makeImage({ positive: "the woman leans on the railing, the man behind her, from behind" });
    const result = finalizeSuggestedImage(image, { isCover: false, isAnimeMedium: true, subjects: couple });
    expect(result.positive.match(/exactly two people/g)?.length).toBe(1);
    expect(result.positive).not.toContain("a man and a woman");
  });

  it("anime couple: no negated phrases and no framing tags injected over the LLM's shot", () => {
    const image = makeImage({
      positive: "the man and the woman in a VIP booth, the woman bends over the armrest, from side view, full body",
    });
    const result = finalizeSuggestedImage(image, {
      isCover: false,
      isAnimeMedium: true,
      subjects: couple,
      anchorTags: "adult woman in her mid 20s, long glossy black hair, handsome adult man in his late 20s",
    });
    expect(result.positive).not.toMatch(/\bno\s|\bonly\b|\bonce\b|panel|empty space/);
    expect(result.positive).not.toMatch(/headroom|framing|breathing room|top of the head/);
    expect(result.positive).toContain("adult woman in her mid 20s");
    expect(result.positive).toContain("from side view, full body");
  });

  it("anime group: count line built from intent tags", () => {
    const result = finalizeSuggestedImage(makeImage({ positive: "two women and a man in a hot tub, from above" }), {
      isCover: false,
      isAnimeMedium: true,
      subjects: { kind: "group", tags: "2girls, 1boy", description: "two women and a man", crowd: false },
    });
    expect(result.positive).toContain("exactly three people: two women and one man");
    expect(result.positive).toContain("two women and a man in a hot tub");
  });

  it("anime couple: the app no longer rewrites the LLM's scene (pose, distance, props)", () => {
    const scene = "a man and a woman, both standing face to face against a neon pillar, from front view, full body";
    const result = finalizeSuggestedImage(makeImage({ positive: scene }), {
      isCover: false,
      isAnimeMedium: true,
      subjects: couple,
    });
    expect(result.positive.endsWith(scene)).toBe(true);
  });

  it("real couple standing against a pillar: unchanged", () => {
    const real = finalizeSuggestedImage(makeImage({ positive: "the woman stands against a pillar" }), {
      isCover: false,
      isAnimeMedium: false,
      subjects: couple,
    });
    expect(real.positive).toContain("against a pillar");
  });

  it("real couple standing full body: framing unchanged", () => {
    const image = makeImage({ positive: "the woman stands kissing the man, full body" });
    const result = finalizeSuggestedImage(image, { isCover: false, isAnimeMedium: false, subjects: couple });
    expect(result.positive).toContain("full body");
    expect(result.positive).toContain("breathing room");
  });

  it("real couple: lead tags unchanged", () => {
    const image = makeImage({ positive: "a scene" });
    const result = finalizeSuggestedImage(image, { isCover: false, isAnimeMedium: false, subjects: couple });
    expect(result.positive.startsWith("a man and a woman, natural body proportions")).toBe(true);
    expect(result.positive).not.toContain("each character appears only once");
  });

  it("anime months drop 'key visual', cover keeps it", () => {
    const month = finalizeSuggestedImage(makeImage({ positive: "bedroom, detailed anime key visual, rain" }), {
      isCover: false,
      isAnimeMedium: true,
    });
    expect(month.positive.toLowerCase()).not.toContain("key visual");

    const cover = finalizeSuggestedImage(makeImage({ positive: "bedroom, anime key visual title" }), {
      isCover: true,
      isAnimeMedium: true,
    });
    expect(cover.positive.toLowerCase()).toContain("key visual");
  });

  it("anime: does not re-inject a paraphrased anchor tag; real still does", () => {
    const anchorTags = "adult man short black hair, large canopy bed";
    const positive = "adult man with short black hair and muscular build, on the bed";
    const anime = finalizeSuggestedImage(makeImage({ positive }), { isCover: false, isAnimeMedium: true, anchorTags });
    expect(anime.positive).not.toContain("adult man short black hair");
    expect(anime.positive).toContain("large canopy bed");

    const real = finalizeSuggestedImage(makeImage({ positive }), { isCover: false, isAnimeMedium: false, anchorTags });
    expect(real.positive).toContain("adult man short black hair");
  });

  it("anime: rewrites appearance epithets to plain nouns; real unchanged", () => {
    const anchorTags = "long crimson hair with drill curls, golden eyes";
    const positive =
      "golden-eyed woman lifted in full nelson, lavender wavy hair beauty smiling, woman with long crimson hair with drill curls on all fours";
    const anime = finalizeSuggestedImage(makeImage({ positive }), { isCover: false, isAnimeMedium: true, anchorTags });
    expect(anime.positive).toContain("the woman lifted in full nelson");
    expect(anime.positive).toContain("the woman smiling");
    expect(anime.positive).toContain("the woman on all fours");
    expect(anime.positive).not.toMatch(/golden-eyed woman|hair beauty|woman with long crimson/);

    const real = finalizeSuggestedImage(makeImage({ positive }), { isCover: false, isAnimeMedium: false, anchorTags });
    expect(real.positive).toContain("golden-eyed woman");
  });
});

describe("scrubAnimeKeyVisual", () => {
  it("rewrites the medium preset phrase and removes loose key-visual tags", () => {
    const out = scrubAnimeKeyVisual(
      "anime style, high quality anime key visual, clean lineart, detailed anime key visual, anime key visual, rain",
    );
    expect(out).toBe("anime style, high quality anime illustration, clean lineart, rain");
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
