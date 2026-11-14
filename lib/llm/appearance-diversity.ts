import { prisma } from "@/lib/db";
import { applyDecision, type Intent } from "@/lib/llm/axis-decision";

/**
 * Đa dạng NGOẠI HÌNH nhân vật giữa các bộ lịch bằng code (cùng khuôn với
 * concept-diversity): mỗi batch bốc ngẫu nhiên quốc tịch + tóc + mắt + nét mặt +
 * độ tuổi + dáng người, né các lựa chọn của vài batch gần nhất, rồi gửi cho LLM
 * MỘT dòng gợi ý (~30 token). LLM chỉ dùng gợi ý cho các đặc điểm người dùng
 * KHÔNG tự nêu -- ý người dùng luôn ưu tiên.
 *
 * Chỉ người trưởng thành. Danh sách dáng người KHÔNG có dáng béo: dáng béo chỉ
 * xuất hiện khi người dùng tự yêu cầu (xem `requestWantsHeavyBody`).
 */

export type Region = "europe" | "asia" | "latin" | "africa" | "middle-east" | "north-america" | "oceania";

export interface Nationality {
  key: string;
  label: string;
  region: Region;
}

export const NATIONALITIES: Nationality[] = [
  { key: "french", label: "French", region: "europe" },
  { key: "italian", label: "Italian", region: "europe" },
  { key: "spanish", label: "Spanish", region: "europe" },
  { key: "portuguese", label: "Portuguese", region: "europe" },
  { key: "russian", label: "Russian", region: "europe" },
  { key: "ukrainian", label: "Ukrainian", region: "europe" },
  { key: "polish", label: "Polish", region: "europe" },
  { key: "czech", label: "Czech", region: "europe" },
  { key: "swedish", label: "Swedish", region: "europe" },
  { key: "norwegian", label: "Norwegian", region: "europe" },
  { key: "irish", label: "Irish", region: "europe" },
  { key: "german", label: "German", region: "europe" },
  { key: "greek", label: "Greek", region: "europe" },
  { key: "dutch", label: "Dutch", region: "europe" },
  { key: "japanese", label: "Japanese", region: "asia" },
  { key: "korean", label: "Korean", region: "asia" },
  { key: "chinese", label: "Chinese", region: "asia" },
  { key: "vietnamese", label: "Vietnamese", region: "asia" },
  { key: "thai", label: "Thai", region: "asia" },
  { key: "filipino", label: "Filipino", region: "asia" },
  { key: "indonesian", label: "Indonesian", region: "asia" },
  { key: "indian", label: "Indian", region: "asia" },
  { key: "brazilian", label: "Brazilian", region: "latin" },
  { key: "colombian", label: "Colombian", region: "latin" },
  { key: "mexican", label: "Mexican", region: "latin" },
  { key: "argentinian", label: "Argentinian", region: "latin" },
  { key: "nigerian", label: "Nigerian", region: "africa" },
  { key: "ethiopian", label: "Ethiopian", region: "africa" },
  { key: "lebanese", label: "Lebanese", region: "middle-east" },
  { key: "persian", label: "Persian", region: "middle-east" },
  { key: "american", label: "American", region: "north-america" },
  { key: "australian", label: "Australian", region: "oceania" },
];

export const HAIR = [
  { key: "platinum-blonde", label: "platinum blonde long straight hair" },
  { key: "honey-blonde", label: "honey blonde wavy shoulder-length hair" },
  { key: "strawberry-blonde", label: "strawberry blonde loose curls" },
  { key: "auburn", label: "auburn red long wavy hair" },
  { key: "copper", label: "copper ginger curly hair" },
  { key: "chestnut", label: "chestnut brown layered hair" },
  { key: "dark-brown", label: "dark brown sleek straight hair" },
  { key: "jet-black-long", label: "jet black very long straight hair" },
  { key: "black-bob", label: "glossy black chin-length bob" },
  { key: "black-curly", label: "black voluminous curly hair" },
  { key: "ash-brown", label: "ash brown pixie cut" },
  { key: "caramel-balayage", label: "caramel balayage beach waves" },
  { key: "silver-dyed", label: "dyed silver-grey long hair" },
  { key: "pastel-pink", label: "dyed pastel pink wavy hair" },
  { key: "braids", label: "long braided hair" },
  { key: "updo", label: "dark hair in an elegant updo with loose strands" },
];

export const EYES = [
  "deep brown eyes",
  "hazel eyes",
  "green eyes",
  "light blue eyes",
  "grey eyes",
  "amber eyes",
  "dark almond-shaped eyes",
  "blue-green eyes",
];

// CHỈ nét nhận dạng TĨNH. Không đưa biểu cảm (cười, lúm đồng tiền khi cười...)
// vào đây: gợi ý này thành đặc điểm cố định của nhân vật, bị lặp ở mọi ảnh và
// đè lên biểu cảm hợp với hành động của từng ảnh.
export const FACE_FEATURES = [
  "light freckles across the nose",
  "high cheekbones",
  "full lips",
  "monolid eyes",
  "a subtle cleft chin",
  "a straight defined nose",
  "a small beauty mark near the lips",
  "strong elegant jawline",
  "soft round face",
  "heart-shaped face",
  "thick natural eyebrows",
  "a small mole on the cheek",
  "upturned button nose",
  "almond-shaped eyes",
];

export const AGES = ["early 20s", "mid 20s", "late 20s", "early 30s"];

/** Dáng người mặc định -- KHÔNG có dáng béo (chỉ khi người dùng tự yêu cầu). */
export const BODY_TYPES = [
  { key: "slim", label: "slim figure" },
  { key: "petite", label: "slender petite figure" },
  { key: "athletic", label: "athletic toned body" },
  { key: "tall-model", label: "tall long-legged model figure" },
  { key: "hourglass", label: "fit hourglass figure" },
  { key: "natural", label: "natural average build" },
  { key: "dancer", label: "lean graceful dancer's body" },
];

export const ANIME_HAIR = [
  { key: "silver-hime", label: "long silver hair with hime cut" },
  { key: "pink-twintails", label: "pink hair in long twintails" },
  { key: "black-ahoge", label: "short black hair with ahoge" },
  { key: "blue-ponytail", label: "long blue hair in a high ponytail" },
  { key: "two-tone", label: "two-tone black and red hair" },
  { key: "lavender-braid", label: "lavender wavy hair with a side braid" },
  { key: "blonde-bob", label: "messy blonde bob with side bangs" },
  { key: "white-straight", label: "white very long straight hair" },
  { key: "orange-short", label: "short orange hair with a hairclip" },
  { key: "brown-braids", label: "brown hair in low twin braids" },
  { key: "green-bangs", label: "medium green hair with blunt bangs" },
  { key: "red-curls", label: "long crimson hair with drill curls" },
  { key: "teal-gradient", label: "teal hair with gradient tips" },
  { key: "black-long", label: "long glossy black hair" },
];

export const ANIME_EYES = [
  "red eyes",
  "violet eyes",
  "golden eyes",
  "aqua eyes",
  "emerald green eyes",
  "heterochromia, blue and gold eyes",
  "pink eyes",
  "deep blue eyes",
  "amber eyes",
];

// Chỉ nét TĨNH, không biểu cảm (xem FACE_FEATURES).
export const ANIME_FACE_FEATURES = [
  "mole under eye",
  "sharp upturned eyes",
  "gentle drooping eyes",
  "long eyelashes",
  "light freckles",
  "beauty mark near the lips",
  "thick eyebrows",
  "slender face",
];

// "petite" với nét vẽ anime dễ làm nhân vật trông trẻ hơn tuổi -> loại.
export const ANIME_BODY_TYPES = BODY_TYPES.filter((body) => body.key !== "petite");

export const RECENT_APPEARANCE_LIMIT = 5;
const HAIR_BODY_AVOID_WINDOW = 3;
const ANIME_KEY_PREFIX = "anime|";

/** Bỏ dấu tiếng Việt + lowercase để khớp từ khoá không phụ thuộc cách gõ. */
export function normalizeVi(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

function hasPhrase(normalized: string, phrases: string[]): boolean {
  return phrases.some((phrase) => new RegExp(`(^|[^a-z])${phrase}([^a-z]|$)`).test(normalized));
}

// Nêu đích danh một quốc tịch/nước -> bỏ trục quốc tịch, theo người dùng.
// Từ tiếng Việt ngắn (vd "đức", "thái", "nga", "mỹ") trùng với từ thường sau khi
// bỏ dấu ("dâm dục", "mang thai", "ngả", ...) -> chỉ khớp khi đi kèm "người/cô
// gái/nước" để tránh bỏ nhầm trục quốc tịch.
const VI_COUNTRY_WORDS = [
  "nhat", "nhat ban", "han", "han quoc", "trung", "trung quoc", "viet", "viet nam", "thai", "thai lan",
  "nga", "phap", "tay ban nha", "duc", "anh", "my", "an do", "thuy dien", "ba lan", "hy lap",
];
const SPECIFIC_NATIONALITY_PHRASES = [
  ...VI_COUNTRY_WORDS.flatMap((word) => [`nguoi ${word}`, `co gai ${word}`, `nuoc ${word}`, `gai ${word}`]),
  "nhat ban", "han quoc", "trung quoc", "viet nam", "thai lan", "tay ban nha", "thuy dien", "hy lap", "nguoi y", "nuoc y",
  "japan", "japanese", "korea", "korean", "china", "chinese", "vietnam", "vietnamese", "thailand",
  "russia", "russian", "france", "french", "italia", "italy", "italian", "spain", "spanish",
  "germany", "german", "british", "english", "america", "american", "brazil", "brasil", "ukraine",
  "ukrainian", "philippines", "filipino", "indonesia", "indonesian", "india", "indian", "mexico",
  "mexican", "sweden", "swedish", "poland", "polish", "greece", "greek", "ireland", "irish",
];

const REGION_PHRASES: { region: Region; phrases: string[] }[] = [
  { region: "europe", phrases: ["chau au", "nguoi tay", "co gai tay", "phuong tay", "europe", "european"] },
  { region: "asia", phrases: ["chau a", "asia", "asian", "a dong"] },
  { region: "latin", phrases: ["latin", "latina", "my latinh", "nam my"] },
  { region: "africa", phrases: ["chau phi", "africa", "african"] },
  { region: "middle-east", phrases: ["trung dong", "middle east", "arab", "a rap"] },
];

/**
 * Suy ra phạm vi quốc tịch từ yêu cầu người dùng:
 * - "skip": người dùng đã nêu đích danh nước -> không gợi ý quốc tịch.
 * - Region[]: chỉ bốc trong các vùng người dùng nêu (vd "châu âu").
 * - null: không nêu gì -> bốc toàn cầu.
 */
export function detectNationalityScope(request: string): "skip" | Region[] | null {
  const normalized = normalizeVi(request);
  if (hasPhrase(normalized, SPECIFIC_NATIONALITY_PHRASES)) return "skip";
  const regions = REGION_PHRASES.filter((entry) => hasPhrase(normalized, entry.phrases)).map((entry) => entry.region);
  return regions.length > 0 ? regions : null;
}

// Từ khoá cho thấy NGƯỜI DÙNG muốn dáng đầy đặn/béo -> mới cho phép tag béo.
const HEAVY_BODY_REQUEST_PHRASES = [
  "beo", "map", "beo phi", "mum mim", "tron trinh", "tron tria", "bu bam", "bung mo", "phom phap", "dam nguoi",
  "chubby", "plump", "fat", "bbw", "overweight", "obese", "curvy", "thick", "full figure", "plus size", "plus-size",
];

export function requestWantsHeavyBody(request: string): boolean {
  return hasPhrase(normalizeVi(request), HEAVY_BODY_REQUEST_PHRASES);
}

export interface RecentAppearances {
  /** appearanceKey của các batch gần nhất (mới nhất trước), dạng "nat|hair|body". */
  keys: string[];
}

export interface AppearanceSeed {
  key: string;
  text: string;
}

function pickFrom<T>(items: T[], random: () => number): T {
  return items[Math.floor(random() * items.length) % items.length];
}

function pickAvoiding<T>(items: T[], keyOf: (item: T) => string, avoid: Set<string>, random: () => number): T {
  const fresh = items.filter((item) => !avoid.has(keyOf(item)));
  return pickFrom(fresh.length > 0 ? fresh : items, random);
}

function pickOptional<T>(pool: T[] | null, random: () => number): T | null {
  return pool ? pickFrom(pool, random) : null;
}

function pickAvoidingOptional<T>(
  pool: T[] | null,
  keyOf: (item: T) => string,
  avoid: Set<string>,
  random: () => number,
): T | null {
  return pool ? pickAvoiding(pool, keyOf, avoid, random) : null;
}

function nationalityPool(request: string, intent: Intent | null | undefined): Nationality[] | null {
  if (intent) return applyDecision(NATIONALITIES, (nat) => nat.key, intent.nationality);
  // Không có intent (lượt phân tích lỗi) -> đoán phạm vi bằng từ khoá như trước.
  const scope = detectNationalityScope(request);
  if (scope === "skip") return null;
  const pool = scope ? NATIONALITIES.filter((nat) => scope.includes(nat.region)) : NATIONALITIES;
  return pool.length > 0 ? pool : NATIONALITIES;
}

/**
 * Bốc ngoại hình cho một batch. Quốc tịch né 5 batch gần nhất, tóc + dáng né 3
 * batch gần nhất; mắt/nét mặt/tuổi tự do. `intent` (nếu có) bỏ các trục người
 * dùng đã nêu và thu hẹp các trục người dùng ngụ ý.
 */
export function pickAppearanceSeed(
  request: string,
  recent: RecentAppearances = { keys: [] },
  random: () => number = Math.random,
  intent?: Intent | null,
): AppearanceSeed {
  const parsed = recent.keys.filter((key) => !key.startsWith(ANIME_KEY_PREFIX)).map((key) => key.split("|"));
  const recentNats = new Set(parsed.slice(0, RECENT_APPEARANCE_LIMIT).map((parts) => parts[0]).filter(Boolean));
  const recentHair = new Set(parsed.slice(0, HAIR_BODY_AVOID_WINDOW).map((parts) => parts[1]).filter(Boolean));
  const recentBody = new Set(parsed.slice(0, HAIR_BODY_AVOID_WINDOW).map((parts) => parts[2]).filter(Boolean));

  const nationality = pickAvoidingOptional(nationalityPool(request, intent), (nat) => nat.key, recentNats, random);
  const hair = pickAvoidingOptional(applyDecision(HAIR, (item) => item.key, intent?.hair), (item) => item.key, recentHair, random);
  const body = pickAvoidingOptional(applyDecision(BODY_TYPES, (item) => item.key, intent?.body), (item) => item.key, recentBody, random);
  const eyes = pickOptional(applyDecision(EYES, (item) => item, intent?.eyes), random);
  const face = pickOptional(applyDecision(FACE_FEATURES, (item) => item, intent?.face), random);
  const age = pickOptional(applyDecision(AGES, (item) => item, intent?.age), random);

  const parts = [
    nationality ? `${nationality.label} woman` : null,
    age ? `in her ${age}` : null,
    hair?.label,
    eyes,
    face,
    body?.label,
  ].filter(Boolean);

  return {
    key: [nationality?.key ?? "", hair?.key ?? "", body?.key ?? ""].join("|"),
    text: parts.join(", "),
  };
}

/**
 * Ngoại hình cho bộ anime: không quốc tịch, luôn là người trưởng thành; tóc +
 * dáng né 3 bộ anime gần nhất. Key "anime|hair|body".
 */
export function pickAnimeAppearanceSeed(
  recent: RecentAppearances = { keys: [] },
  random: () => number = Math.random,
  intent?: Intent | null,
): AppearanceSeed {
  const parsed = recent.keys
    .filter((key) => key.startsWith(ANIME_KEY_PREFIX))
    .slice(0, HAIR_BODY_AVOID_WINDOW)
    .map((key) => key.split("|"));
  const recentHair = new Set(parsed.map((parts) => parts[1]).filter(Boolean));
  const recentBody = new Set(parsed.map((parts) => parts[2]).filter(Boolean));

  const hair = pickAvoidingOptional(applyDecision(ANIME_HAIR, (item) => item.key, intent?.hair), (item) => item.key, recentHair, random);
  const body = pickAvoidingOptional(
    applyDecision(ANIME_BODY_TYPES, (item) => item.key, intent?.body),
    (item) => item.key,
    recentBody,
    random,
  );
  const age = pickOptional(applyDecision(AGES, (item) => item, intent?.age), random);

  return {
    key: `${ANIME_KEY_PREFIX}${hair?.key ?? ""}|${body?.key ?? ""}`,
    text: [
      age ? `adult woman in her ${age}` : "adult woman",
      "mature features",
      hair?.label,
      pickOptional(applyDecision(ANIME_EYES, (item) => item, intent?.eyes), random),
      pickOptional(applyDecision(ANIME_FACE_FEATURES, (item) => item, intent?.face), random),
      body?.label,
    ]
      .filter(Boolean)
      .join(", "),
  };
}

/** appearanceKey của các batch gần nhất trong DB (mới nhất trước), cả thực lẫn anime. */
export async function loadRecentAppearances(limit = 15): Promise<RecentAppearances> {
  const rows = await prisma.generationBatch.findMany({
    where: { appearanceKey: { not: null } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { appearanceKey: true },
  });
  return { keys: rows.map((row) => row.appearanceKey).filter((key): key is string => Boolean(key)) };
}
