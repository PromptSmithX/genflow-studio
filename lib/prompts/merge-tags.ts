/**
 * Joins two optional, comma-separated tag strings into one, trimming each
 * and dropping empty parts. Used to merge a MediumPreset's base tags with
 * per-image LLM-generated tags (positive) or the LLM's shared negative tag
 * string (negative) before they're sent as positiveOverride/negativeOverride.
 */
export function mergeTags(...parts: (string | null | undefined)[]): string {
  return parts
    .map((part) => (part ?? "").trim())
    .filter((part) => part.length > 0)
    .join(", ");
}
