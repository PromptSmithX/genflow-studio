import { describe, expect, it } from "vitest";
import {
  ANIME_HAIR,
  BODY_TYPES,
  NATIONALITIES,
  detectNationalityScope,
  pickAnimeAppearanceSeed,
  pickAppearanceSeed,
  requestWantsHeavyBody,
} from "@/lib/llm/appearance-diversity";
import type { Intent } from "@/lib/llm/axis-decision";
import { composeUserMessage, SHARED_BIAS_PROMPT } from "@/lib/llm/default-system-prompt";
import { finalizeSuggestedImage } from "@/lib/llm/finalize-suggestion";

const EUROPEAN_KEYS = new Set(NATIONALITIES.filter((nat) => nat.region === "europe").map((nat) => nat.key));

describe("detectNationalityScope", () => {
  it("limits to Europe for 'cô gái châu âu' (with or without diacritics)", () => {
    expect(detectNationalityScope("cô gái châu âu")).toEqual(["europe"]);
    expect(detectNationalityScope("co gai chau au tren du thuyen")).toEqual(["europe"]);
  });

  it("skips nationality when the user names a country", () => {
    expect(detectNationalityScope("cô gái nhật bản ở vườn hoa anh đào")).toBe("skip");
    expect(detectNationalityScope("cô gái Việt Nam")).toBe("skip");
    expect(detectNationalityScope("người Nga trong tuyết")).toBe("skip");
  });

  it("does not mistake common Vietnamese words for countries", () => {
    // "dâm dục" -> "duc" (Đức), "mang thai" -> "thai", "y tá" -> "y" (Ý)
    expect(detectNationalityScope("cô gái dâm dục")).toBeNull();
    expect(detectNationalityScope("cô gái y tá")).toBeNull();
    expect(detectNationalityScope("cô gái chơi bóng chuyền ở biển")).toBeNull();
  });
});

describe("pickAppearanceSeed", () => {
  it("picks only European nationalities for a European request", () => {
    for (let i = 0; i < 40; i++) {
      const seed = pickAppearanceSeed("cô gái châu âu", { keys: [] }, () => i / 40);
      expect(EUROPEAN_KEYS.has(seed.key.split("|")[0])).toBe(true);
    }
  });

  it("omits nationality when the user named one", () => {
    const seed = pickAppearanceSeed("cô gái nhật bản", { keys: [] }, () => 0);
    expect(seed.key.split("|")[0]).toBe("");
    expect(seed.text).not.toMatch(/woman,/);
  });

  it("avoids nationalities of the last 5 batches and hair/body of the last 3", () => {
    const recent = ["french|auburn|slim", "italian|chestnut|athletic", "spanish|copper|petite", "russian|x|y", "swedish|x|y"];
    for (let i = 0; i < 40; i++) {
      const [nat, hair, body] = pickAppearanceSeed("cô gái châu âu", { keys: recent }, () => i / 40).key.split("|");
      expect(["french", "italian", "spanish", "russian", "swedish"]).not.toContain(nat);
      expect(["auburn", "chestnut", "copper"]).not.toContain(hair);
      expect(["slim", "athletic", "petite"]).not.toContain(body);
    }
  });

  it("only describes adults", () => {
    const seed = pickAppearanceSeed("cô gái", { keys: [] }, () => 0.5);
    expect(seed.text).toMatch(/in her (early|mid|late) (20s|30s)/);
  });

  it("ignores anime batches when avoiding recent hair/body", () => {
    const recent = ["anime|pink-twintails|slim", "anime|blonde-bob|athletic", "anime|x|tall-model", "french|auburn|hourglass"];
    const bodies = new Set<string>();
    for (let i = 0; i < 40; i++) {
      bodies.add(pickAppearanceSeed("cô gái châu âu", { keys: recent }, () => i / 40).key.split("|")[2]);
    }
    expect(bodies.has("slim")).toBe(true);
    expect(bodies.has("hourglass")).toBe(false);
  });
});

describe("pickAppearanceSeed with intent", () => {
  const free = { mode: "free" } as const;
  const baseIntent: Intent = {
    nationality: free, hair: free, eyes: free, face: free, body: free, age: free, location: free, timeWeather: free, look: free,
  };

  it("omits locked axes and picks narrowed axes only from the pool", () => {
    const intent: Intent = {
      ...baseIntent,
      nationality: { mode: "omit" },
      hair: { mode: "pool", ids: new Set(["jet-black-long", "black-bob"]) },
      eyes: { mode: "pool", ids: new Set(["deep brown eyes"]) },
    };
    for (let i = 0; i < 40; i++) {
      const seed = pickAppearanceSeed("cô gái nhật bản", { keys: [] }, () => i / 40, intent);
      const [nat, hair] = seed.key.split("|");
      expect(nat).toBe("");
      expect(["jet-black-long", "black-bob"]).toContain(hair);
      expect(seed.text).toContain("deep brown eyes");
      expect(seed.text).not.toMatch(/ woman,/);
    }
  });

  it("avoids recent hair inside the pool, falling back to the pool when all are recent", () => {
    const intent: Intent = { ...baseIntent, hair: { mode: "pool", ids: new Set(["jet-black-long", "black-bob"]) } };
    for (let i = 0; i < 20; i++) {
      expect(pickAppearanceSeed("x", { keys: ["|jet-black-long|"] }, () => i / 20, intent).key.split("|")[1]).toBe("black-bob");
      const both = pickAppearanceSeed("x", { keys: ["|jet-black-long|", "|black-bob|"] }, () => i / 20, intent);
      expect(["jet-black-long", "black-bob"]).toContain(both.key.split("|")[1]);
    }
  });

  it("returns empty text when every appearance axis is locked", () => {
    const omit = { mode: "omit" } as const;
    const intent: Intent = { ...baseIntent, nationality: omit, hair: omit, eyes: omit, face: omit, body: omit, age: omit };
    expect(pickAppearanceSeed("x", { keys: [] }, Math.random, intent)).toEqual({ key: "||", text: "" });
  });

  it("anime keeps the adult marker even when age is locked", () => {
    const seed = pickAnimeAppearanceSeed({ keys: [] }, () => 0, { ...baseIntent, age: { mode: "omit" } });
    expect(seed.text.startsWith("adult woman, mature features")).toBe(true);
  });
});

describe("pickAnimeAppearanceSeed", () => {
  it("uses anime traits, no nationality, always an adult", () => {
    for (let i = 0; i < 40; i++) {
      const seed = pickAnimeAppearanceSeed({ keys: [] }, () => i / 40);
      expect(seed.key.startsWith("anime|")).toBe(true);
      expect(seed.text).toMatch(/^adult woman in her (early|mid|late) (20s|30s), mature features/);
      expect(ANIME_HAIR.some((hair) => seed.text.includes(hair.label))).toBe(true);
      for (const nat of NATIONALITIES) expect(seed.text).not.toContain(`${nat.label} woman`);
    }
  });

  it("never picks a petite body", () => {
    for (let i = 0; i < 40; i++) {
      expect(pickAnimeAppearanceSeed({ keys: [] }, () => i / 40).text).not.toMatch(/petite/);
    }
  });

  it("avoids hair/body of the last 3 anime batches, ignoring real ones", () => {
    const recent = ["french|auburn|slim", "anime|pink-twintails|athletic", "anime|silver-hime|dancer", "anime|blue-ponytail|natural"];
    for (let i = 0; i < 40; i++) {
      const [, hair, body] = pickAnimeAppearanceSeed({ keys: recent }, () => i / 40).key.split("|");
      expect(["pink-twintails", "silver-hime", "blue-ponytail"]).not.toContain(hair);
      expect(["athletic", "dancer", "natural"]).not.toContain(body);
    }
  });
});

describe("no heavy body by default", () => {
  it("body type list has no heavy/obese types", () => {
    for (const body of BODY_TYPES) expect(body.label).not.toMatch(/chubby|plump|fat|overweight|obese|bbw/i);
  });

  it("shared prompt no longer primes chubby tags", () => {
    expect(SHARED_BIAS_PROMPT).not.toMatch(/"chubby, plump/);
    expect(SHARED_BIAS_PROMPT).toContain("KHÔNG BAO GIỜ tự thêm dáng béo");
  });

  it("detects explicit heavy-body requests", () => {
    expect(requestWantsHeavyBody("cô gái mũm mĩm")).toBe(true);
    expect(requestWantsHeavyBody("cô gái béo")).toBe(true);
    expect(requestWantsHeavyBody("curvy girl")).toBe(true);
    expect(requestWantsHeavyBody("cô gái châu âu")).toBe(false);
  });

  it("strips heavy-body tags from positive and anchor tags unless allowed", () => {
    const stripped = finalizeSuggestedImage(
      { positive: "blonde woman, chubby, plump body, soft belly, red dress, fatale look", caption: "c" },
      { isCover: false, isAnimeMedium: false, anchorTags: "full figure, green eyes" },
    );
    expect(stripped.positive).not.toMatch(/chubby|plump|soft belly|full figure/i);
    expect(stripped.positive).toContain("green eyes");
    expect(stripped.positive).toContain("fatale look");

    const kept = finalizeSuggestedImage(
      { positive: "blonde woman, chubby, soft belly", caption: "c" },
      { isCover: false, isAnimeMedium: false, allowHeavyBody: true },
    );
    expect(kept.positive).toContain("chubby");
    expect(kept.positive).toContain("soft belly");
  });
});

describe("composeUserMessage appearance hint", () => {
  it("adds the appearance line, and skips it when the concept is locked", () => {
    const msg = composeUserMessage({ request: "x", count: 13, appearanceSeed: "Irish woman, copper ginger curly hair" });
    expect(msg).toContain("Ngoại hình gợi ý");
    expect(msg).toContain("copper ginger curly hair");

    const locked = composeUserMessage({
      request: "x",
      count: 2,
      appearanceSeed: "Irish woman",
      lockedConcept: { theme: "old library", anchorTags: "blonde hair" },
    });
    expect(locked).not.toContain("Irish woman");
  });
});
