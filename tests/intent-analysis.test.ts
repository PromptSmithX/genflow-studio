import { describe, expect, it, vi } from "vitest";
import { applyDecision } from "@/lib/llm/axis-decision";
import {
  analyzeIntent,
  buildIntentCatalog,
  composeIntentMessage,
  INTENT_SYSTEM_PROMPT,
  sanitizeExtras,
  sanitizeIntent,
  summarizeIntent,
} from "@/lib/llm/intent-analysis";
import type { LlmClient } from "@/lib/llm/client";

const realCatalog = buildIntentCatalog(false);

describe("buildIntentCatalog", () => {
  it("has a nationality axis only for real photos", () => {
    expect(realCatalog.nationality?.length).toBeGreaterThan(0);
    expect(buildIntentCatalog(true).nationality).toBeUndefined();
  });

  it("lists every catalog axis in the message", () => {
    const message = composeIntentMessage("cô gái nhật bản", false, realCatalog);
    expect(message).toContain("cô gái nhật bản");
    expect(message).toContain("- hair: platinum-blonde=platinum blonde long straight hair");
    expect(message).toContain("- location: historic-library=");
  });
});

describe("sanitizeIntent", () => {
  it("maps locked to omit, narrowed to a pool of known ids, missing to free", () => {
    const intent = sanitizeIntent(
      {
        axes: {
          nationality: { status: "locked" },
          hair: { status: "narrowed", compatible: ["jet-black-long", "black-bob", "made-up-id"] },
          eyes: { status: "free" },
        },
      },
      realCatalog,
    );
    expect(intent?.nationality).toEqual({ mode: "omit" });
    expect(intent?.hair).toEqual({ mode: "pool", ids: new Set(["jet-black-long", "black-bob"]) });
    expect(intent?.eyes).toEqual({ mode: "free" });
    expect(intent?.location).toEqual({ mode: "free" });
  });

  it("omits a narrowed axis when no compatible id is valid", () => {
    const intent = sanitizeIntent({ axes: { hair: { status: "narrowed", compatible: ["nope"] } } }, realCatalog);
    expect(intent?.hair).toEqual({ mode: "omit" });
  });

  it("treats a narrowed axis listing every id as free", () => {
    const all = realCatalog.body!.map((item) => item.id);
    const intent = sanitizeIntent({ axes: { body: { status: "narrowed", compatible: all } } }, realCatalog);
    expect(intent?.body).toEqual({ mode: "free" });
  });

  it("returns null for a malformed response", () => {
    expect(sanitizeIntent({ foo: 1 }, realCatalog)).toBeNull();
    expect(sanitizeIntent({ axes: { hair: { status: "maybe" } } }, realCatalog)).toBeNull();
  });

  it("ignores the nationality axis for anime", () => {
    const intent = sanitizeIntent({ axes: { nationality: { status: "locked" } } }, buildIntentCatalog(true));
    expect(intent?.nationality).toEqual({ mode: "free" });
  });
});

describe("sanitizeExtras", () => {
  it("accepts valid coreIntent and subjects, defaulting crowd to false", () => {
    const extras = sanitizeExtras({
      coreIntent: " a wild party ",
      subjects: { kind: "couple", tags: "1boy, 1girl", description: "a man and a woman" },
    });
    expect(extras.coreIntent).toBe("a wild party");
    expect(extras.subjects).toEqual({ kind: "couple", tags: "1boy, 1girl", description: "a man and a woman", crowd: false });
  });

  it("nulls out missing or malformed fields independently", () => {
    expect(sanitizeExtras({ coreIntent: null, subjects: { kind: "crowd", tags: "x", description: "y" } })).toEqual({
      coreIntent: null,
      subjects: null,
    });
    expect(sanitizeExtras("nope")).toEqual({ coreIntent: null, subjects: null });
  });
});

describe("intent prompt", () => {
  it("tells the analyzer that activities constrain location and to report subjects", () => {
    expect(INTENT_SYSTEM_PROMPT).toContain("HOẠT ĐỘNG / SỰ KIỆN");
    expect(INTENT_SYSTEM_PROMPT).toContain('"subjects"');
    expect(INTENT_SYSTEM_PROMPT).not.toContain("càng nhiều càng tốt");
  });
});

describe("applyDecision", () => {
  const items = ["a", "b", "c"];
  it("keeps all for free/undefined, null for omit, filters for pool", () => {
    expect(applyDecision(items, (x) => x)).toEqual(items);
    expect(applyDecision(items, (x) => x, { mode: "free" })).toEqual(items);
    expect(applyDecision(items, (x) => x, { mode: "omit" })).toBeNull();
    expect(applyDecision(items, (x) => x, { mode: "pool", ids: new Set(["b"]) })).toEqual(["b"]);
    expect(applyDecision(items, (x) => x, { mode: "pool", ids: new Set(["z"]) })).toBeNull();
  });
});

describe("analyzeIntent", () => {
  it("calls the LLM at temperature 0 and sanitizes the result", async () => {
    const completeJson = vi.fn().mockResolvedValue({
      axes: { nationality: { status: "locked" }, location: { status: "narrowed", compatible: ["nightclub", "beach?"] } },
      coreIntent: "a wild party",
      subjects: { kind: "group", tags: "1boy, 2girls", description: "one man and two women", crowd: true },
    });
    const analysis = await analyzeIntent({ completeJson } as unknown as LlmClient, "bữa tiệc", false);
    expect(completeJson.mock.calls[0][2]).toMatchObject({ temperature: 0 });
    expect(analysis?.axes.nationality).toEqual({ mode: "omit" });
    expect(analysis?.coreIntent).toBe("a wild party");
    expect(analysis?.subjects?.tags).toBe("1boy, 2girls");
    const summary = summarizeIntent(analysis);
    expect(summary).toContain("nationality=omit");
    expect(summary).toContain("location=[nightclub]");
    expect(summary).toContain("subjects=group(1boy, 2girls, crowd)");
  });

  it("returns null when the LLM call fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const completeJson = vi.fn().mockRejectedValue(new Error("boom"));
    expect(await analyzeIntent({ completeJson } as unknown as LlmClient, "x", false)).toBeNull();
    expect(summarizeIntent(null)).toContain("fallback");
    warn.mockRestore();
  });
});
