import { describe, expect, it } from "vitest";
import { mergeTags } from "@/lib/prompts/merge-tags";

describe("mergeTags", () => {
  it("joins non-empty parts with ', '", () => {
    expect(mergeTags("photorealistic, raw photo", "red hair, smiling")).toBe(
      "photorealistic, raw photo, red hair, smiling",
    );
  });

  it("drops empty, null and undefined parts", () => {
    expect(mergeTags("", "blurry", null, undefined, "  ")).toBe("blurry");
  });

  it("trims each part", () => {
    expect(mergeTags("  anime style  ", "  detailed eyes  ")).toBe("anime style, detailed eyes");
  });

  it("returns an empty string when every part is empty", () => {
    expect(mergeTags("", null, undefined)).toBe("");
  });
});
