import { z } from "zod";
import {
  AGES,
  ANIME_BODY_TYPES,
  ANIME_EYES,
  ANIME_FACE_FEATURES,
  ANIME_HAIR,
  BODY_TYPES,
  EYES,
  FACE_FEATURES,
  HAIR,
  NATIONALITIES,
} from "@/lib/llm/appearance-diversity";
import { ANIME_LOOK, LOCATION_FAMILIES, PHOTO_LOOK, TIME_WEATHER } from "@/lib/llm/concept-diversity";
import { AXES, type Axis, type Intent, type SubjectSpec } from "@/lib/llm/axis-decision";
import type { LlmClient } from "@/lib/llm/client";

/**
 * Lượt LLM ngắn chạy TRƯỚC lượt sinh prompt: với mỗi trục mà code tự bốc seed
 * đa dạng, xác định người dùng đã ràng buộc nó chưa (nêu rõ / ngụ ý / không),
 * để seed không đè lên ý người dùng. Chỉ xét các trục hữu hạn này, không cố mô
 * hình hoá toàn bộ ý định.
 */

export interface CatalogItem {
  id: string;
  label: string;
}
export type IntentCatalog = Partial<Record<Axis, CatalogItem[]>>;

const fromStrings = (items: string[]): CatalogItem[] => items.map((item) => ({ id: item, label: item }));
const fromKeyed = (items: { key: string; label: string }[]): CatalogItem[] =>
  items.map((item) => ({ id: item.key, label: item.label }));

export function buildIntentCatalog(isAnime: boolean): IntentCatalog {
  const shared = {
    age: fromStrings(AGES),
    location: LOCATION_FAMILIES.map((family) => ({ id: family.key, label: family.direction })),
    timeWeather: fromStrings(TIME_WEATHER),
  };
  if (isAnime) {
    return {
      ...shared,
      hair: fromKeyed(ANIME_HAIR),
      eyes: fromStrings(ANIME_EYES),
      face: fromStrings(ANIME_FACE_FEATURES),
      body: fromKeyed(ANIME_BODY_TYPES),
      look: fromStrings(ANIME_LOOK),
    };
  }
  return {
    ...shared,
    nationality: fromKeyed(NATIONALITIES),
    hair: fromKeyed(HAIR),
    eyes: fromStrings(EYES),
    face: fromStrings(FACE_FEATURES),
    body: fromKeyed(BODY_TYPES),
    look: fromStrings(PHOTO_LOOK),
  };
}

export const INTENT_SYSTEM_PROMPT = `Bạn phân tích yêu cầu tạo bộ ảnh của người dùng (thường là tiếng Việt, có thể dùng tiếng lóng). Hệ thống có các TRỤC đa dạng, mỗi trục có một danh sách lựa chọn (id = mô tả). Với TỪNG trục, xếp vào đúng một trạng thái:
- "locked": người dùng NÊU RÕ đặc điểm của trục này (vd "tóc đỏ" → hair; "ở thư viện" → location; "người Nhật" → nationality).
- "narrowed": người dùng KHÔNG nêu rõ nhưng yêu cầu NGỤ Ý hoặc giới hạn trục này (vd "cô gái Nhật Bản" ngụ ý màu tóc/mắt/nét mặt Đông Á; "nữ hoàng băng giá" ngụ ý bối cảnh lạnh). Khi đó liệt kê vào "compatible" các id mà người xem sẽ thấy TỰ NHIÊN, đúng với hình ảnh người dùng hình dung; nghi ngờ thì loại.
- "free": yêu cầu không liên quan gì tới trục này.
HOẠT ĐỘNG / SỰ KIỆN ngụ ý địa điểm (vd "bữa tiệc", "đám cưới", "tập gym", "nấu ăn", "đi bơi"): trục location chỉ được chứa những nơi hoạt động đó THƯỜNG diễn ra (tiệc → hộp đêm, biệt thự, lounge, khách sạn...; KHÔNG phải bãi biển hay đường phố chỉ vì "có thể"). Nếu không id nào thật sự hợp → "locked".
Với bộ ảnh ANIME: quốc tịch/dân tộc KHÔNG tự động giới hạn màu tóc/mắt (quy ước anime cho phép màu tuỳ ý), trừ khi người dùng muốn rõ nét thật.

Ngoài các trục, trả thêm:
- "coreIntent": cụm TIẾNG ANH ngắn (≤ 12 từ) nêu hoạt động / sự kiện / chủ đề cốt lõi người dùng muốn thấy ở MỌI ảnh (vd "a wild BDSM party", "a couple making love"); null nếu yêu cầu chỉ tả nhân vật/nơi chốn.
- "subjects": số người trong MỖI ảnh. "kind": "solo" (1 người — mặc định khi người dùng chỉ tả một nhân vật), "couple" (2 người), "group" (3 người). "tags": tag Danbooru của nhóm chính (vd "1girl", "1boy, 1girl", "1boy, 2girls"). "description": cùng ý bằng tiếng Anh tự nhiên (vd "one woman", "a man and a woman", "one man and two women"). Nhóm chính TỐI ĐA 3 người; khi ý người dùng đông hơn (tiệc, lễ hội, đám đông) thì giữ nhóm chính ≤ 3 và đặt "crowd": true (người phụ mờ ở hậu cảnh), ngược lại "crowd": false.

Chỉ dùng id có trong danh sách. Trả về JSON đúng dạng:
{"axes": {"<trục>": {"status": "locked" | "narrowed" | "free", "compatible": ["<id>", ...]}}, "coreIntent": "..." | null, "subjects": {"kind": "...", "tags": "...", "description": "...", "crowd": false}}
("compatible" chỉ cần khi "narrowed").`;

export function composeIntentMessage(request: string, isAnime: boolean, catalog: IntentCatalog): string {
  const lines = [`Loại ảnh: ${isAnime ? "ANIME" : "ẢNH THỰC"}`, `Yêu cầu của người dùng: ${request}`, "", "Các trục:"];
  for (const axis of AXES) {
    const items = catalog[axis];
    if (!items) continue;
    const list = items.map((item) => (item.id === item.label ? item.id : `${item.id}=${item.label}`)).join(" | ");
    lines.push(`- ${axis}: ${list}`);
  }
  return lines.join("\n");
}

const rawIntentSchema = z.object({
  axes: z.record(
    z.string(),
    z.object({
      status: z.enum(["locked", "narrowed", "free"]),
      compatible: z.array(z.string()).optional(),
    }),
  ),
});

/** Chuẩn hoá phản hồi LLM về Intent; id lạ bị bỏ. Shape sai → null. */
export function sanitizeIntent(raw: unknown, catalog: IntentCatalog): Intent | null {
  const parsed = rawIntentSchema.safeParse(raw);
  if (!parsed.success) return null;
  const intent = {} as Intent;
  for (const axis of AXES) {
    const items = catalog[axis];
    const entry = parsed.data.axes[axis];
    if (!items || !entry || entry.status === "free") {
      intent[axis] = { mode: "free" };
    } else if (entry.status === "locked") {
      intent[axis] = { mode: "omit" };
    } else {
      const known = new Set(items.map((item) => item.id));
      const ids = new Set((entry.compatible ?? []).filter((id) => known.has(id)));
      // Ngụ ý nhưng không id nào hợp -> không bốc, để prompt chính tự theo người dùng.
      intent[axis] = ids.size === 0 ? { mode: "omit" } : ids.size === known.size ? { mode: "free" } : { mode: "pool", ids };
    }
  }
  return intent;
}

const coreIntentSchema = z.string().trim().min(1).max(120);
const subjectsSchema = z.object({
  kind: z.enum(["solo", "couple", "group"]),
  tags: z.string().trim().min(1).max(60),
  description: z.string().trim().min(1).max(100),
  crowd: z.boolean().optional().default(false),
});

/** coreIntent/subjects được kiểm tra riêng: sai thì null, không làm hỏng phần trục. */
export function sanitizeExtras(raw: unknown): { coreIntent: string | null; subjects: SubjectSpec | null } {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const core = coreIntentSchema.safeParse(obj.coreIntent);
  const subjects = subjectsSchema.safeParse(obj.subjects);
  return { coreIntent: core.success ? core.data : null, subjects: subjects.success ? subjects.data : null };
}

export interface IntentAnalysis {
  axes: Intent;
  coreIntent: string | null;
  subjects: SubjectSpec | null;
}

export function summarizeIntent(analysis: IntentAnalysis | null): string {
  if (!analysis) return "unavailable (fallback)";
  const axes = AXES.map((axis) => {
    const decision = analysis.axes[axis];
    if (decision.mode !== "pool") return `${axis}=${decision.mode}`;
    return axis === "location" ? `${axis}=[${[...decision.ids].join(",")}]` : `${axis}=pool(${decision.ids.size})`;
  }).join(" ");
  const subjects = analysis.subjects
    ? `${analysis.subjects.kind}(${analysis.subjects.tags}${analysis.subjects.crowd ? ", crowd" : ""})`
    : "none";
  return `${axes} | core=${JSON.stringify(analysis.coreIntent)} | subjects=${subjects}`;
}

const INTENT_TIMEOUT_MS = 30_000;

/** Lỗi bất kỳ → null, route quay về cách bốc seed cũ. */
export async function analyzeIntent(
  client: LlmClient,
  request: string,
  isAnime: boolean,
): Promise<IntentAnalysis | null> {
  const catalog = buildIntentCatalog(isAnime);
  try {
    const raw = await client.completeJson(INTENT_SYSTEM_PROMPT, composeIntentMessage(request, isAnime, catalog), {
      temperature: 0,
      timeoutMs: INTENT_TIMEOUT_MS,
    });
    const axes = sanitizeIntent(raw, catalog);
    if (!axes) {
      console.warn("[LLM intent] bad shape, falling back", JSON.stringify(raw).slice(0, 300));
      return null;
    }
    return { axes, ...sanitizeExtras(raw) };
  } catch (error) {
    console.warn("[LLM intent] failed, falling back:", error instanceof Error ? error.message : error);
    return null;
  }
}
