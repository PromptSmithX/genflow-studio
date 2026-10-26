import { describe, expect, it } from "vitest";
import { resolveSeeds, randomSeed } from "@/lib/seed";

describe("randomSeed", () => {
  it("produces a non-negative safe integer", () => {
    for (let i = 0; i < 20; i++) {
      const seed = randomSeed();
      expect(Number.isSafeInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("resolveSeeds", () => {
  it("returns distinct random seeds per image in random mode", () => {
    const seeds = resolveSeeds({ mode: "random", count: 5 });
    expect(seeds).toHaveLength(5);
    for (const seed of seeds) {
      expect(Number.isSafeInteger(seed)).toBe(true);
    }
  });

  it("repeats the same fixed seed for every image when not incrementing", () => {
    const seeds = resolveSeeds({ mode: "fixed", count: 3, fixedSeed: 42, incrementFixedSeed: false });
    expect(seeds).toEqual([42, 42, 42]);
  });

  it("increments the fixed seed per image when requested", () => {
    const seeds = resolveSeeds({ mode: "fixed", count: 3, fixedSeed: 42, incrementFixedSeed: true });
    expect(seeds).toEqual([42, 43, 44]);
  });

  it("throws when fixed mode is used without a fixed seed", () => {
    expect(() => resolveSeeds({ mode: "fixed", count: 1, fixedSeed: null })).toThrow();
  });
});
