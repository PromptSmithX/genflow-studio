export interface BuildPromptsInput {
  globalPositive: string;
  globalNegative: string;
  idea: string;
  stylePositive: string;
  styleNegative: string;
  imagePositiveOverride?: string | null;
  imageNegativeOverride?: string | null;
}

export interface BuildPromptsResult {
  positiveFinal: string;
  negativeFinal: string;
  parts: {
    positive: {
      global: string;
      idea: string;
      style: string;
      override: string;
    };
    negative: {
      global: string;
      style: string;
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
 * Pure helper that joins global/idea/style/per-image prompt fragments into
 * the final positive/negative strings sent to ComfyUI. Order is fixed by
 * the product spec and must not be reordered or deduplicated, since that
 * could change the user's intended meaning.
 */
export function buildPrompts(input: BuildPromptsInput): BuildPromptsResult {
  const globalPositive = cleanPart(input.globalPositive);
  const globalNegative = cleanPart(input.globalNegative);
  const idea = cleanPart(input.idea);
  const stylePositive = cleanPart(input.stylePositive);
  const styleNegative = cleanPart(input.styleNegative);
  const positiveOverride = cleanPart(input.imagePositiveOverride);
  const negativeOverride = cleanPart(input.imageNegativeOverride);

  const positiveFinal = joinParts([globalPositive, idea, stylePositive, positiveOverride]);
  const negativeFinal = joinParts([globalNegative, styleNegative, negativeOverride]);

  return {
    positiveFinal,
    negativeFinal,
    parts: {
      positive: {
        global: globalPositive,
        idea,
        style: stylePositive,
        override: positiveOverride,
      },
      negative: {
        global: globalNegative,
        style: styleNegative,
        override: negativeOverride,
      },
    },
  };
}
