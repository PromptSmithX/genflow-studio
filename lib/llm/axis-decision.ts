export const AXES = ["nationality", "hair", "eyes", "face", "body", "age", "location", "timeWeather", "look"] as const;
export type Axis = (typeof AXES)[number];

/** free: bốc như cũ · omit: không bốc trục này · pool: chỉ bốc trong các id này. */
export type AxisDecision = { mode: "free" } | { mode: "omit" } | { mode: "pool"; ids: Set<string> };
export type Intent = Record<Axis, AxisDecision>;

/**
 * Số người trong mỗi ảnh do lượt phân tích intent quyết định. `tags` (Danbooru)
 * cho anime, `description` (tiếng Anh tự nhiên) cho ảnh thực; `crowd` = có
 * người phụ mờ ở hậu cảnh (tiệc, lễ hội...).
 */
export interface SubjectSpec {
  kind: "solo" | "couple" | "group";
  tags: string;
  description: string;
  crowd: boolean;
}

/** Danh sách sau khi áp quyết định của trục; null = không bốc trục này. */
export function applyDecision<T>(items: T[], idOf: (item: T) => string, decision?: AxisDecision): T[] | null {
  if (!decision || decision.mode === "free") return items;
  if (decision.mode === "omit") return null;
  const filtered = items.filter((item) => decision.ids.has(idOf(item)));
  return filtered.length > 0 ? filtered : null;
}
