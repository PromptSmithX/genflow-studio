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

/** Đếm nữ/nam/khác từ tag Danbooru của intent ("1boy, 2girls" -> 2 nữ, 1 nam). */
export function countCast(subjects: SubjectSpec): { women: number; men: number; others: number } {
  const cast = { women: 0, men: 0, others: 0 };
  for (const [, n, who] of subjects.tags.matchAll(/(\d+)\s*(girl|boy|other)s?\b/gi)) {
    const key = who.toLowerCase() === "girl" ? "women" : who.toLowerCase() === "boy" ? "men" : "others";
    cast[key] += Number(n);
  }
  return cast;
}

/**
 * Chế độ template anime (Grok điền trường riêng thay vì một câu positive tự do):
 * couple = đúng 1 nữ + 1 nam, solo_f / solo_m = 1 người. Các trường hợp khác -> null
 * (giữ positive tự do như cũ).
 */
export type AnimeTemplateMode = "couple" | "solo_f" | "solo_m";
export function animeTemplateMode(subjects?: SubjectSpec | null): AnimeTemplateMode | null {
  if (!subjects) return null;
  const { women, men, others } = countCast(subjects);
  if (others > 0) return null;
  if (subjects.kind === "couple" && women === 1 && men === 1) return "couple";
  if (subjects.kind === "solo" && women === 1 && men === 0) return "solo_f";
  if (subjects.kind === "solo" && women === 0 && men === 1) return "solo_m";
  return null;
}

/** Danh sách sau khi áp quyết định của trục; null = không bốc trục này. */
export function applyDecision<T>(items: T[], idOf: (item: T) => string, decision?: AxisDecision): T[] | null {
  if (!decision || decision.mode === "free") return items;
  if (decision.mode === "omit") return null;
  const filtered = items.filter((item) => decision.ids.has(idOf(item)));
  return filtered.length > 0 ? filtered : null;
}
