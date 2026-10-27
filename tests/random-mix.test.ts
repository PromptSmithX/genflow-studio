import { describe, expect, it } from "vitest";
import { buildRandomMix } from "@/lib/generations/random-mix";

function key(image: { sceneId?: string; poseId?: string }) {
  return `${image.sceneId ?? ""}|${image.poseId ?? ""}`;
}

describe("buildRandomMix", () => {
  it("returns exactly `count` images", () => {
    const images = buildRandomMix(["s1", "s2"], ["p1", "p2"], 3);
    expect(images).toHaveLength(3);
  });

  it("uses every unique combination once before repeating any", () => {
    const images = buildRandomMix(["s1", "s2"], ["p1", "p2"], 4);
    const keys = images.map(key).sort();
    expect(keys).toEqual(["s1|p1", "s1|p2", "s2|p1", "s2|p2"]);
  });

  it("repeats combinations only after exhausting the unique set", () => {
    const images = buildRandomMix(["s1", "s2"], ["p1"], 5);
    expect(images).toHaveLength(5);
    const counts = new Map<string, number>();
    for (const image of images) {
      counts.set(key(image), (counts.get(key(image)) ?? 0) + 1);
    }
    // 2 unique combinations, 5 requested -> first 2 full passes (4 images)
    // cover both combinations twice each, remaining 1 covers one more.
    for (const count of counts.values()) {
      expect(count).toBeGreaterThanOrEqual(2);
      expect(count).toBeLessThanOrEqual(3);
    }
  });

  it("falls back to undefined scene/pose when a library is empty", () => {
    const images = buildRandomMix([], [], 3);
    expect(images).toHaveLength(3);
    for (const image of images) {
      expect(image.sceneId).toBeUndefined();
      expect(image.poseId).toBeUndefined();
    }
  });

  it("keeps scenes when only poses are empty", () => {
    const images = buildRandomMix(["s1", "s2"], [], 2);
    expect(images).toHaveLength(2);
    for (const image of images) {
      expect(["s1", "s2"]).toContain(image.sceneId);
      expect(image.poseId).toBeUndefined();
    }
  });
});
