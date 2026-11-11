import { describe, expect, it } from "vitest";
import {
  CONCEPT_SEEDS,
  normalizeRecentConcepts,
  pickConceptSeed,
  seedConflicts,
  type ConceptSeed,
} from "@/lib/llm/concept-diversity";
import { composeUserMessage, SHARED_BIAS_PROMPT } from "@/lib/llm/default-system-prompt";
import { finalizeSuggestedImage, missingAnchorTags } from "@/lib/llm/finalize-suggestion";

const CAR: ConceptSeed = { theme: "red roadster on a cliff road", keywords: ["car", "roadster", "supercar"] };
const LIBRARY: ConceptSeed = { theme: "old library", keywords: ["library", "books"] };

describe("seedConflicts", () => {
  it("matches keywords on word boundaries only", () => {
    expect(seedConflicts(CAR, ["Luxury supercar garage campaign"])).toBe(true);
    expect(seedConflicts(CAR, ["Cozy cardigan autumn walk"])).toBe(false);
    expect(seedConflicts(LIBRARY, [])).toBe(false);
  });
});

describe("pickConceptSeed", () => {
  it("never picks a seed that overlaps recent concepts when an alternative exists", () => {
    for (let i = 0; i < 20; i++) {
      const theme = pickConceptSeed(["supercar showroom"], () => i / 20, [CAR, LIBRARY]);
      expect(theme).toBe(LIBRARY.theme);
    }
  });

  it("falls back to the full list when every seed conflicts", () => {
    expect(pickConceptSeed(["supercar", "library"], () => 0, [CAR, LIBRARY])).toBe(CAR.theme);
  });

  it("avoids all vehicle seeds after a vehicle batch", () => {
    const recent = ["Supercar and motorcycle luxury garage", "private jet and yacht lifestyle"];
    for (let i = 0; i < 50; i++) {
      const theme = pickConceptSeed(recent, () => i / 50);
      expect(theme).not.toMatch(/roadster|motorcycle|yacht|jet/);
    }
  });

  it("every built-in seed has keywords", () => {
    for (const seed of CONCEPT_SEEDS) expect(seed.keywords.length).toBeGreaterThan(0);
  });
});

describe("normalizeRecentConcepts", () => {
  it("drops empty/duplicate entries, truncates, and caps the count", () => {
    const long = "x".repeat(100);
    const result = normalizeRecentConcepts([null, " A  b ", "a b", "", long, "c", "d", "e", "f"], 4);
    expect(result).toEqual(["A b", "x".repeat(60), "c", "d"]);
  });
});

describe("composeUserMessage concept hints", () => {
  it("adds seed and avoid list", () => {
    const msg = composeUserMessage({
      request: "cô gái châu âu",
      count: 13,
      conceptSeed: "old library",
      avoidConcepts: ["supercar garage", "snowy onsen"],
    });
    expect(msg).toContain("old library");
    expect(msg).toContain("supercar garage; snowy onsen");
  });

  it("omits hints when none are given", () => {
    const msg = composeUserMessage({ request: "x", count: 2 });
    expect(msg).toBe("Số ảnh cần tạo: 2\nYêu cầu của người dùng: x");
  });

  it("locked concept overrides seed and avoid list", () => {
    const msg = composeUserMessage({
      request: "x",
      count: 2,
      conceptSeed: "old library",
      avoidConcepts: ["snowy onsen"],
      lockedConcept: { theme: "red roadster on a cliff road", anchorTags: "red roadster, blonde hair" },
    });
    expect(msg).toContain("red roadster on a cliff road");
    expect(msg).toContain("anchorTags: red roadster, blonde hair");
    expect(msg).not.toContain("old library");
    expect(msg).not.toContain("snowy onsen");
  });
});

describe("shared prompt no longer primes vehicles", () => {
  it("has no vehicle concept matrix", () => {
    expect(SHARED_BIAS_PROMPT).not.toMatch(/siêu xe|hypercar|capo|phi cơ/);
  });
});

describe("anchorTags injection", () => {
  it("missingAnchorTags skips tags already present", () => {
    expect(missingAnchorTags("Red Roadster, blonde hair, cliff road", "a woman, red roadster, sunset")).toBe(
      "blonde hair, cliff road",
    );
    expect(missingAnchorTags(undefined, "x")).toBe("");
  });

  it("injects missing anchor tags into artwork and cover positives", () => {
    const artwork = finalizeSuggestedImage(
      { positive: "sitting on the hood, sunset", caption: "c" },
      { isCover: false, isAnimeMedium: false, anchorTags: "red vintage roadster, coastal cliff road" },
    );
    expect(artwork.positive).toContain("red vintage roadster, coastal cliff road");

    const cover = finalizeSuggestedImage(
      { positive: "standing by the car", caption: "c", title: "LUNA" },
      { isCover: true, isAnimeMedium: false, anchorTags: "red vintage roadster" },
    );
    expect(cover.positive).toContain("red vintage roadster");
  });

  it("strips duplicate-subject phrases from anchor tags for real medium", () => {
    const result = finalizeSuggestedImage(
      { positive: "a scene", caption: "c" },
      { isCover: false, isAnimeMedium: false, anchorTags: "same woman, identical twins, red roadster" },
    );
    expect(result.positive).toContain("red roadster");
    expect(result.positive).not.toMatch(/same woman|identical|twins/i);
  });
});
