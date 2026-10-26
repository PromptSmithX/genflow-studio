const MAX_SAFE_SEED = Number.MAX_SAFE_INTEGER;

export function randomSeed(): number {
  return Math.floor(Math.random() * MAX_SAFE_SEED);
}

export type SeedMode = "random" | "fixed";

export interface ResolveSeedsInput {
  mode: SeedMode;
  count: number;
  fixedSeed?: number | null;
  incrementFixedSeed?: boolean;
}

/**
 * Resolves one seed per requested image. In fixed mode the base seed can
 * either be reused as-is or incremented per image, per the UI's explicit
 * toggle, so behavior must stay transparent to the user.
 */
export function resolveSeeds(input: ResolveSeedsInput): number[] {
  const { mode, count, fixedSeed, incrementFixedSeed } = input;

  if (mode === "random") {
    return Array.from({ length: count }, () => randomSeed());
  }

  if (fixedSeed === null || fixedSeed === undefined || !Number.isFinite(fixedSeed)) {
    throw new Error("fixedSeed is required when seed mode is 'fixed'");
  }

  return Array.from({ length: count }, (_, index) =>
    incrementFixedSeed ? fixedSeed + index : fixedSeed,
  );
}
