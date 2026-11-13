import { describe, expect, it } from "vitest";
import { animeTemplateMode, type SubjectSpec } from "@/lib/llm/axis-decision";
import { assembleAnimePositive, finalizeSuggestedImage } from "@/lib/llm/finalize-suggestion";
import { composeUserMessage } from "@/lib/llm/default-system-prompt";
import { llmSuggestionResultSchema, type LlmImageSuggestion } from "@/lib/validations/llm";

const couple: SubjectSpec = { kind: "couple", tags: "1boy, 1girl", description: "a man and a woman", crowd: false };
const soloF: SubjectSpec = { kind: "solo", tags: "1girl", description: "one woman", crowd: false };
const soloM: SubjectSpec = { kind: "solo", tags: "1boy", description: "one man", crowd: false };

function image(extra: Partial<LlmImageSuggestion>): LlmImageSuggestion {
  return { positive: "", caption: "c", ...extra };
}

const coupleImage = () =>
  image({
    scene: "moonlit neon city street at night, low brick wall",
    woman: "sits on the edge of the wall, leans forward to kiss him, hands on his shoulders",
    man: "stands between her legs, holding her waist",
    shot: { camera: "from front, upper body" },
  });

describe("animeTemplateMode", () => {
  it("maps intent subjects to a template mode", () => {
    expect(animeTemplateMode(couple)).toBe("couple");
    expect(animeTemplateMode(soloF)).toBe("solo_f");
    expect(animeTemplateMode(soloM)).toBe("solo_m");
  });

  it("returns null for other casts and missing subjects", () => {
    expect(animeTemplateMode(null)).toBeNull();
    expect(animeTemplateMode({ ...couple, kind: "group", tags: "1boy, 2girls" })).toBeNull();
    expect(animeTemplateMode({ ...couple, tags: "2girls" })).toBeNull();
    expect(animeTemplateMode({ ...couple, tags: "1boy, 1girl, 1other" })).toBeNull();
  });
});

describe("assembleAnimePositive", () => {
  it("couple: scene, the woman, the man, camera in that order", () => {
    const img = coupleImage();
    expect(assembleAnimePositive(img, couple)).toBe(true);
    expect(img.positive).toBe(
      "moonlit neon city street at night, low brick wall, the woman sits on the edge of the wall, leans forward to kiss him, hands on his shoulders, the man stands between her legs, holding her waist, from front, upper body",
    );
  });

  it("strips a leading 'the woman' / 'man' the LLM wrote anyway, but keeps possessives", () => {
    const img = image({ scene: "a rooftop", woman: "The woman, sits on a bench", man: "man's hand on her waist" });
    assembleAnimePositive(img, couple);
    expect(img.positive).toContain("the woman sits on a bench");
    expect(img.positive).not.toMatch(/the woman the woman/i);
    expect(img.positive).toContain("the man man's hand on her waist");
  });

  it("solo_f / solo_m: lead tag + only the matching person field", () => {
    const f = image({ scene: "balcony at dusk", woman: "leans on the railing", man: "ignored", shot: { camera: "from side" } });
    assembleAnimePositive(f, soloF);
    expect(f.positive).toBe("1girl, balcony at dusk, the woman leans on the railing, from side");
    const m = image({ scene: "garage", man: "wipes his hands on a rag", woman: "ignored" });
    assembleAnimePositive(m, soloM);
    expect(m.positive).toBe("1boy, garage, the man wipes his hands on a rag");
  });

  it("falls back to the free-form positive when template fields are incomplete", () => {
    const img = image({ positive: "free text from the LLM", scene: "only a scene" });
    expect(assembleAnimePositive(img, couple)).toBe(false);
    expect(img.positive).toBe("free text from the LLM");
  });

  it("assembles best-effort when fields are incomplete and there is no positive", () => {
    const img = image({ scene: "a rooftop", woman: "sits on a bench" });
    expect(assembleAnimePositive(img, couple)).toBe(true);
    expect(img.positive).toBe("a rooftop, the woman sits on a bench");
  });

  it("does nothing for non-template subjects", () => {
    const img = image({ positive: "two women on a sofa", scene: "x", woman: "y" });
    expect(assembleAnimePositive(img, { ...couple, tags: "2girls" })).toBe(false);
    expect(img.positive).toBe("two women on a sofa");
  });
});

describe("finalizeSuggestedImage with the anime template", () => {
  it("couple: the pair is introduced once (count line), the rest is 'the woman' / 'the man'", () => {
    const result = finalizeSuggestedImage(coupleImage(), {
      isCover: false,
      isAnimeMedium: true,
      subjects: couple,
      anchorTags: "silver hair, young man short dark hair, young woman mid 20s, rooftop terrace",
    });
    expect(result.positive.match(/exactly two people: one woman and one man/g)).toHaveLength(1);
    expect(result.positive.match(/\ban?\s+(?:young\s+)?(?:man|woman)\b/gi)).toBeNull();
    expect(result.positive).toContain("the man short dark hair");
    expect(result.positive.endsWith("from front, upper body")).toBe(true);
  });

  it("crowd is only added by code, once", () => {
    const result = finalizeSuggestedImage(coupleImage(), {
      isCover: false,
      isAnimeMedium: true,
      subjects: { ...couple, crowd: true },
    });
    expect(result.positive.match(/blurred people in the background/g)).toHaveLength(1);
  });

  it("cover keeps title / CALENDAR / year blocks", () => {
    const cover = image({
      scene: 'a neon street, large bold title text "NIGHT", uppercase text "CALENDAR", year text "2027"',
      woman: "stands smiling",
      man: "stands beside her",
      title: "NIGHT",
      year: "2027",
    });
    const result = finalizeSuggestedImage(cover, { isCover: true, isAnimeMedium: true, subjects: couple });
    expect(result.positive).toContain('"NIGHT"');
    expect(result.positive).toContain("CALENDAR");
  });

  it("REAL medium is untouched even if the LLM returns template fields", () => {
    const real = image({ positive: "a woman at a cafe", scene: "x", woman: "y" });
    const result = finalizeSuggestedImage(real, { isCover: false, isAnimeMedium: false, subjects: couple });
    expect(result.positive).toContain("a woman at a cafe");
    expect(result.positive).not.toContain("the woman y");
  });
});

describe("llmSuggestionResultSchema (template fields)", () => {
  const base = { negative: "", images: [] as unknown[] };

  it("keeps scene/woman/man/shot and does not require positive", () => {
    const parsed = llmSuggestionResultSchema.parse({
      ...base,
      images: [{ scene: "s", woman: "w", man: "m", shot: { camera: "from side" }, caption: "c" }],
    });
    expect(parsed.images[0]).toMatchObject({ positive: "", scene: "s", woman: "w", man: "m", shot: { camera: "from side" } });
  });

  it("tolerates null / wrong-typed optional fields instead of failing the whole response", () => {
    const parsed = llmSuggestionResultSchema.parse({
      ...base,
      images: [{ positive: "p", scene: "s", woman: "w", man: null, shot: "from side", caption: "c" }],
    });
    expect(parsed.images[0].man).toBeUndefined();
    expect(parsed.images[0].shot).toBeUndefined();
  });
});

describe("composeUserMessage template line", () => {
  it("adds the format line only for anime with a template mode", () => {
    const anime = composeUserMessage({ request: "x", count: 13, subjects: couple, isAnime: true });
    expect(anime).toContain("Định dạng ảnh: couple");
    expect(anime).toContain('"scene", "woman", "man"');
    expect(composeUserMessage({ request: "x", count: 13, subjects: soloF, isAnime: true })).toContain("Định dạng ảnh: solo_f");
    expect(composeUserMessage({ request: "x", count: 13, subjects: couple, isAnime: false })).not.toContain("Định dạng ảnh");
    expect(
      composeUserMessage({ request: "x", count: 13, subjects: { ...couple, tags: "2girls" }, isAnime: true }),
    ).not.toContain("Định dạng ảnh");
  });
});
