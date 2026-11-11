import { describe, expect, it } from "vitest";
import {
  LOCATION_FAMILIES,
  STYLE_ERA,
  TIME_WEATHER,
  familyConflicts,
  normalizeRecentConcepts,
  pickConceptSeed,
  type LocationFamily,
} from "@/lib/llm/concept-diversity";
import { composeUserMessage, SHARED_BIAS_PROMPT } from "@/lib/llm/default-system-prompt";
import { finalizeSuggestedImage, missingAnchorTags } from "@/lib/llm/finalize-suggestion";

const CAR: LocationFamily = { key: "car", direction: "one vintage car", keywords: ["car", "roadster", "supercar"] };
const LIBRARY: LocationFamily = { key: "library", direction: "a historic library", keywords: ["library", "books"] };

describe("familyConflicts", () => {
  it("matches keywords on word boundaries only", () => {
    expect(familyConflicts(CAR, ["Luxury supercar garage campaign"])).toBe(true);
    expect(familyConflicts(CAR, ["Cozy cardigan autumn walk"])).toBe(false);
    expect(familyConflicts(LIBRARY, [])).toBe(false);
  });
});

describe("pickConceptSeed", () => {
  it("never picks a family whose key was used recently", () => {
    for (let i = 0; i < 20; i++) {
      const seed = pickConceptSeed({ keys: ["car"], themes: [] }, () => i / 20, [CAR, LIBRARY]);
      expect(seed.key).toBe("library");
    }
  });

  it("avoids by keyword when only a theme is known (user-specified batches)", () => {
    for (let i = 0; i < 20; i++) {
      const seed = pickConceptSeed({ keys: [], themes: ["Red supercar showroom"] }, () => i / 20, [CAR, LIBRARY]);
      expect(seed.key).toBe("library");
    }
  });

  it("falls back to all families when every family is excluded", () => {
    const seed = pickConceptSeed({ keys: ["car", "library"], themes: [] }, () => 0, [CAR, LIBRARY]);
    expect(seed.key).toBe("car");
  });

  it("combines location direction, time/weather and style axes", () => {
    const seed = pickConceptSeed({ keys: [], themes: [] }, () => 0, [LIBRARY]);
    expect(seed.text).toBe(`a historic library, ${TIME_WEATHER[0]}, ${STYLE_ERA[0]}`);
  });

  it("never repeats any of the last 10 families", () => {
    const recentKeys = LOCATION_FAMILIES.slice(0, 10).map((family) => family.key);
    for (let i = 0; i < 100; i++) {
      const seed = pickConceptSeed({ keys: recentKeys, themes: [] }, () => i / 100);
      expect(recentKeys).not.toContain(seed.key);
    }
  });

  it("built-in families have unique keys and keywords", () => {
    const keys = LOCATION_FAMILIES.map((family) => family.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(LOCATION_FAMILIES.length).toBeGreaterThanOrEqual(45);
    for (const family of LOCATION_FAMILIES) expect(family.keywords.length).toBeGreaterThan(0);
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
