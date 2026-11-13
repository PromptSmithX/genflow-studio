import { describe, expect, it } from "vitest";
import type { SubjectSpec } from "@/lib/llm/axis-decision";
import {
  ANIME_SINGLE_SUBJECT_TAGS,
  CALENDAR_SYSTEM_PROMPT_ANIME,
  CALENDAR_SYSTEM_PROMPT_REAL,
  CROWD_BACKGROUND_TAGS,
  MULTI_SUBJECT_QUALITY_TAGS,
  SHARED_BIAS_PROMPT,
  SINGLE_SUBJECT_QUALITY_TAGS,
  composeUserMessage,
} from "@/lib/llm/default-system-prompt";
import { finalizeSuggestedImage } from "@/lib/llm/finalize-suggestion";

const group: SubjectSpec = { kind: "group", tags: "1boy, 2girls", description: "one man and two women", crowd: false };
const party: SubjectSpec = { ...group, crowd: true };
const soloInCrowd: SubjectSpec = { kind: "solo", tags: "1girl", description: "one woman", crowd: true };
const solo: SubjectSpec = { kind: "solo", tags: "1girl", description: "one woman", crowd: false };

function finalize(isAnimeMedium: boolean, subjects?: SubjectSpec | null, isCover = false) {
  return finalizeSuggestedImage(
    { positive: "dancing under neon lights, champagne", caption: "c", title: "PARTY" },
    { isCover, isAnimeMedium, subjects },
  ).positive;
}

describe("finalizeSuggestedImage subject tags", () => {
  it("real group drops the solo tags and leads with the group description", () => {
    const positive = finalize(false, group);
    expect(positive.startsWith(`one man and two women, ${MULTI_SUBJECT_QUALITY_TAGS}`)).toBe(true);
    expect(positive).not.toMatch(/\bsolo\b|one person only/);
  });

  it("anime group: one total-count line from the intent tags", () => {
    const positive = finalize(true, group);
    expect(positive.startsWith("balanced anatomy")).toBe(true);
    expect(positive.match(/exactly three people: two women and one man/g)?.length).toBe(1);
    expect(positive).not.toContain("one man and two women");
    expect(positive).not.toMatch(/\bsolo\b|no other people|only once/);
  });

  it("adds blurred background people for crowd scenes, also on the cover", () => {
    expect(finalize(false, party)).toContain(CROWD_BACKGROUND_TAGS);
    expect(finalize(true, party, true)).toContain(CROWD_BACKGROUND_TAGS);
  });

  it("solo with a crowd keeps one main subject without 'no other people'", () => {
    expect(finalize(true, soloInCrowd).startsWith("one main character in sharp focus, balanced anatomy")).toBe(true);
    expect(finalize(true, soloInCrowd)).not.toContain("no other people");
    expect(finalize(false, soloInCrowd).startsWith("one main subject in sharp focus")).toBe(true);
  });

  it("plain solo or missing subjects keeps the old behavior", () => {
    expect(finalize(false, solo).startsWith(SINGLE_SUBJECT_QUALITY_TAGS)).toBe(true);
    expect(finalize(false, null).startsWith(SINGLE_SUBJECT_QUALITY_TAGS)).toBe(true);
    expect(finalize(true, undefined).startsWith(ANIME_SINGLE_SUBJECT_TAGS)).toBe(true);
  });
});

describe("composeUserMessage intent lines", () => {
  it("adds the core intent and subject lines (description for multi-person, tags only for anime solo)", () => {
    const real = composeUserMessage({ request: "bữa tiệc", count: 13, coreIntent: "a wild party", subjects: party });
    expect(real).toContain("Ý chính BẮT BUỘC thể hiện rõ ở MỌI ảnh: a wild party");
    expect(real).toContain('mô tả rõ "one man and two women"');
    expect(real).toContain("người phụ MỜ ở hậu cảnh");

    const anime = composeUserMessage({ request: "x", count: 13, subjects: group, isAnime: true });
    expect(anime).toContain('mô tả rõ "one man and two women"');
    expect(anime).not.toContain('"1boy, 2girls"');
    expect(anime).toContain("Không có người nào khác");

    const animeSolo = composeUserMessage({ request: "x", count: 13, subjects: solo, isAnime: true });
    expect(animeSolo).toContain('mở đầu positive bằng "1girl"');
  });

  it("keeps the lines when the concept is locked (regenerate flow)", () => {
    const msg = composeUserMessage({
      request: "x",
      count: 2,
      coreIntent: "a wild party",
      subjects: group,
      lockedConcept: { theme: "Nightclub party", anchorTags: "x" },
    });
    expect(msg).toContain("a wild party");
    expect(msg).toContain("Số người trong MỖI ảnh");
  });

  it("omits both lines when intent is unavailable", () => {
    const msg = composeUserMessage({ request: "x", count: 13, coreIntent: null, subjects: null });
    expect(msg).not.toContain("Ý chính");
    expect(msg).not.toContain("Số người trong MỖI ảnh");
  });

  it("anime system prompt asks for a per-image shot plan; real prompt does not", () => {
    expect(CALENDAR_SYSTEM_PROMPT_ANIME).toContain('"shot": { "camera": "...", "poses": "...", "visible": "..." }');
    expect(CALENDAR_SYSTEM_PROMPT_REAL).not.toContain('"shot"');
  });

  it("rule 6 lets the pose decide whether breasts, pussy or both are exposed", () => {
    expect(SHARED_BIAS_PROMPT).toContain("lộ vú hoặc lồn (hoặc cả hai) tuỳ theo tư thế");
    expect(SHARED_BIAS_PROMPT).not.toMatch(/phải hở hang lộ ra vú (và|hoặc) lồn rõ thấy/);
  });

  it("shared prompt no longer forces a single model unconditionally", () => {
    expect(SHARED_BIAS_PROMPT).not.toContain("STRICT SINGLE SUBJECT");
    expect(SHARED_BIAS_PROMPT).toContain('"bữa tiệc"');
  });
});
