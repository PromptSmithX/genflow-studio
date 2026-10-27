export interface BuildPromptsInput {
  globalPositive: string;
  globalNegative: string;
  stylePositive: string;
  styleNegative: string;
  scenePositive?: string | null;
  sceneNegative?: string | null;
  posePositive?: string | null;
  poseNegative?: string | null;
  imagePositiveOverride?: string | null;
  imageNegativeOverride?: string | null;
}

export interface BuildPromptsResult {
  positiveFinal: string;
  negativeFinal: string;
  parts: {
    positive: {
      global: string;
      style: string;
      scene: string;
      pose: string;
      override: string;
    };
    negative: {
      global: string;
      style: string;
      scene: string;
      pose: string;
      override: string;
    };
  };
}

function cleanPart(part: string | null | undefined): string {
  return (part ?? "").trim();
}

function joinParts(parts: string[]): string {
  return parts.filter((part) => part.length > 0).join(", ");
}

/**
 * Pure helper that joins global/style/scene/pose/per-image prompt fragments
 * into the final positive/negative strings sent to ComfyUI. Order is fixed by
 * the product spec and must not be reordered or deduplicated, since that
 * could change the user's intended meaning.
 */
export function buildPrompts(input: BuildPromptsInput): BuildPromptsResult {
  const globalPositive = cleanPart(input.globalPositive);
  const globalNegative = cleanPart(input.globalNegative);
  const stylePositive = cleanPart(input.stylePositive);
  const styleNegative = cleanPart(input.styleNegative);
  const scenePositive = cleanPart(input.scenePositive);
  const sceneNegative = cleanPart(input.sceneNegative);
  const posePositive = cleanPart(input.posePositive);
  const poseNegative = cleanPart(input.poseNegative);
  const positiveOverride = cleanPart(input.imagePositiveOverride);
  const negativeOverride = cleanPart(input.imageNegativeOverride);

  const positiveFinal = joinParts([globalPositive, stylePositive, scenePositive, posePositive, positiveOverride]);
  const negativeFinal = joinParts([globalNegative, styleNegative, sceneNegative, poseNegative, negativeOverride]);

  return {
    positiveFinal,
    negativeFinal,
    parts: {
      positive: {
        global: globalPositive,
        style: stylePositive,
        scene: scenePositive,
        pose: posePositive,
        override: positiveOverride,
      },
      negative: {
        global: globalNegative,
        style: styleNegative,
        scene: sceneNegative,
        pose: poseNegative,
        override: negativeOverride,
      },
    },
  };
}
