import { describe, expect, it } from "vitest";
import { FACE_FEATURES } from "@/lib/llm/appearance-diversity";
import { CALENDAR_SYSTEM_PROMPT_REAL, SHARED_BIAS_PROMPT } from "@/lib/llm/default-system-prompt";
import { finalizeSuggestedImage } from "@/lib/llm/finalize-suggestion";

describe("expressions belong to each image, not the character", () => {
  it("appearance face features are static (no smiles/expressions)", () => {
    for (const feature of FACE_FEATURES) {
      expect(feature).not.toMatch(/smil|grin|dimple|laugh|gaze|pout/i);
    }
  });

  it("prompts tell the LLM to infer expression per moment and keep it out of anchorTags", () => {
    expect(SHARED_BIAS_PROMPT).toContain("BIỂU CẢM THEO KHOẢNH KHẮC");
    expect(CALENDAR_SYSTEM_PROMPT_REAL).toContain("biểu cảm/cảm xúc");
  });

  it("drops expression phrases from injected anchor tags", () => {
    const result = finalizeSuggestedImage(
      { positive: "riding on top, sweaty bodies", caption: "c" },
      {
        isCover: false,
        isAnimeMedium: false,
        anchorTags: "auburn wavy hair, a gap-tooth smile, green eyes, dimples when smiling, warm happy expression",
      },
    );
    expect(result.positive).toContain("auburn wavy hair");
    expect(result.positive).toContain("green eyes");
    expect(result.positive).not.toMatch(/gap-tooth|dimples|smiling|happy expression/i);
  });

  it("never touches the expression the LLM wrote for the image itself", () => {
    const result = finalizeSuggestedImage(
      { positive: "walking on the beach, laughing with joy", caption: "c" },
      { isCover: false, isAnimeMedium: false, anchorTags: "blonde hair" },
    );
    expect(result.positive).toContain("laughing with joy");
  });
});
