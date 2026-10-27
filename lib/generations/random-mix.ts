export interface RandomMixImage {
  sceneId?: string;
  poseId?: string;
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Builds `count` image requests by randomly pairing scenes and poses so each
 * generated image looks different. Every unique scene×pose combination is
 * used once before any combination repeats, so repeats only happen once the
 * batch is larger than the number of unique combinations available.
 */
export function buildRandomMix(sceneIds: string[], poseIds: string[], count: number): RandomMixImage[] {
  const scenes = sceneIds.length > 0 ? sceneIds : [undefined];
  const poses = poseIds.length > 0 ? poseIds : [undefined];

  const combinations: RandomMixImage[] = [];
  for (const sceneId of scenes) {
    for (const poseId of poses) {
      combinations.push({ sceneId, poseId });
    }
  }

  const images: RandomMixImage[] = [];
  while (images.length < count) {
    const remaining = count - images.length;
    const pool = shuffle(combinations);
    images.push(...pool.slice(0, remaining));
  }
  return images;
}
