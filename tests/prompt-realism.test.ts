import { describe, expect, it } from "vitest";
import { PHOTO_LOOK } from "@/lib/llm/concept-diversity";
import {
  CALENDAR_SYSTEM_PROMPT_ANIME,
  CALENDAR_SYSTEM_PROMPT_REAL,
  FRAMING_HEADROOM_TAGS,
  FRAMING_MARGIN_TAGS,
} from "@/lib/llm/default-system-prompt";
import { dedupePhrases, finalizeSuggestedImage } from "@/lib/llm/finalize-suggestion";

describe("photo look axis stays realistic", () => {
  it("has no stylized looks", () => {
    for (const look of PHOTO_LOOK) {
      expect(look).not.toMatch(/pastel|noir|art deco|futuristic|high-fashion|editorial|1920s|1950s|1970s/i);
    }
  });
});

describe("system prompts allow mixed shot distances", () => {
  it("no longer forces every image to be a wide full-body shot", () => {
    for (const prompt of [CALENDAR_SYSTEM_PROMPT_REAL, CALENDAR_SYSTEM_PROMPT_ANIME]) {
      expect(prompt).not.toContain("LUÔN là ảnh TOÀN THÂN");
      expect(prompt).toContain("ĐA DẠNG CỰ LY");
    }
    expect(CALENDAR_SYSTEM_PROMPT_REAL).not.toMatch(/ống rộng \(vd "35mm/);
    expect(CALENDAR_SYSTEM_PROMPT_REAL).toContain("three-quarter shot");
  });

  it("keeps anchorTags free of palette/mood/photo-style words", () => {
    expect(CALENDAR_SYSTEM_PROMPT_REAL).not.toContain("bảng màu chủ đạo, loại không gian/mood");
    expect(CALENDAR_SYSTEM_PROMPT_REAL).toContain("≤ ~25 từ");
  });
});

describe("framing tags follow shot distance", () => {
  it("full-body shots get the full margin tags", () => {
    const result = finalizeSuggestedImage(
      { positive: "full body shot, head to toe, 50mm, standing by the window", caption: "c" },
      { isCover: false, isAnimeMedium: false },
    );
    expect(result.positive).toContain(FRAMING_MARGIN_TAGS);
    expect(result.positive).not.toContain(FRAMING_HEADROOM_TAGS);
  });

  it("closer shots only get headroom, not 'below the body'", () => {
    const result = finalizeSuggestedImage(
      { positive: "three-quarter shot, 50mm, sitting on the stairs", caption: "c" },
      { isCover: false, isAnimeMedium: false },
    );
    expect(result.positive).toContain(FRAMING_HEADROOM_TAGS);
    expect(result.positive).not.toContain("below the body");
  });
});

describe("dedupePhrases", () => {
  it("drops exact repeated phrases case-insensitively, keeping the first", () => {
    expect(dedupePhrases("a, Cinematic Editorial Photography, b, cinematic editorial photography, a")).toBe(
      "a, Cinematic Editorial Photography, b",
    );
  });

  it("removes duplicates introduced by injected anchor tags", () => {
    const result = finalizeSuggestedImage(
      { positive: "ash brown pixie cut, leaning on a door, ash brown pixie cut", caption: "c" },
      { isCover: false, isAnimeMedium: false, anchorTags: "ash brown pixie cut, blue-green eyes" },
    );
    expect(result.positive.match(/ash brown pixie cut/g)?.length).toBe(1);
    expect(result.positive).toContain("blue-green eyes");
  });
});
