import { prisma } from "@/lib/db";

/**
 * Đa dạng concept giữa các bộ lịch BẰNG CODE (không trông vào LLM tự nhớ):
 * - Mỗi lần /suggest, code bốc ngẫu nhiên một HƯỚNG concept ghép từ 3 trục độc
 *   lập (nhóm địa điểm × thời điểm/thời tiết × phong cách/thời đại, ~50×10×8
 *   tổ hợp). LLM chỉ nhận MỘT dòng hướng (~20 token) và TỰ nghĩ địa điểm cụ
 *   thể + đạo cụ -- vừa kéo LLM khỏi các concept "món ruột", vừa giữ sáng tạo.
 * - Né chính xác theo `key` nhóm địa điểm lưu ở GenerationBatch.conceptSeedKey
 *   của vài bộ gần nhất; batch không có key (người dùng tự nêu bối cảnh / batch
 *   cũ) thì né theo từ khoá trong campaignTheme.
 * Hướng chỉ áp dụng khi người dùng KHÔNG tự nêu bối cảnh -- ý người dùng luôn
 * ưu tiên (SHARED_BIAS_PROMPT mục 1).
 */
export interface LocationFamily {
  key: string;
  direction: string;
  /** Từ khoá tiếng Anh (khớp theo ranh giới từ) để so với campaignTheme. */
  keywords: string[];
}

export const LOCATION_FAMILIES: LocationFamily[] = [
  { key: "historic-library", direction: "a historic library or archive", keywords: ["library", "archive", "bookshelf", "books", "reading room"] },
  { key: "art-atelier", direction: "a painter's or sculptor's atelier", keywords: ["atelier", "painter", "sculptor", "sculpture", "easel", "canvas"] },
  { key: "music-hall", direction: "a concert hall, opera house or music room", keywords: ["piano", "concert", "opera", "orchestra", "violin", "cello"] },
  { key: "dance-studio", direction: "a dance or ballet studio", keywords: ["ballet", "ballerina", "dance", "dancer"] },
  { key: "photo-studio", direction: "a vintage photography or film studio", keywords: ["photography", "darkroom", "film set", "camera"] },
  { key: "theater-backstage", direction: "an old theater stage or backstage", keywords: ["theater", "theatre", "backstage", "curtain", "cabaret"] },
  { key: "museum-gallery", direction: "a museum or art gallery hall", keywords: ["museum", "gallery", "exhibition"] },
  { key: "palace-interior", direction: "a palace or grand historic interior", keywords: ["palace", "royal", "baroque", "castle", "chateau", "ballroom"] },
  { key: "grand-hotel", direction: "a grand hotel lobby, suite or bar", keywords: ["hotel", "lobby", "suite", "art deco"] },
  { key: "penthouse", direction: "a modern penthouse above a city", keywords: ["penthouse", "skyline", "skyscraper", "loft apartment"] },
  { key: "industrial", direction: "an industrial space (factory, warehouse, brick loft)", keywords: ["industrial", "factory", "warehouse", "brick loft"] },
  { key: "night-city", direction: "city streets at night", keywords: ["neon", "cyberpunk", "alley", "city street", "street at night"] },
  { key: "european-oldtown", direction: "a European old town with cobblestone streets", keywords: ["cobblestone", "old town", "paris", "parisian", "rome", "prague"] },
  { key: "cafe-bistro", direction: "a cafe, bistro or patisserie", keywords: ["cafe", "bistro", "patisserie", "bakery", "coffee"] },
  { key: "retro-diner", direction: "a retro diner, bar or roller rink", keywords: ["diner", "jukebox", "roller", "1950s"] },
  { key: "market-bazaar", direction: "a colorful market or bazaar", keywords: ["market", "bazaar", "souk", "flower market"] },
  { key: "train-station", direction: "a vintage train or railway station", keywords: ["train", "railway", "station", "platform", "orient express"] },
  { key: "vintage-vehicle", direction: "one iconic vintage or luxury vehicle", keywords: ["car", "cars", "roadster", "supercar", "hypercar", "motorcycle", "motorbike", "automobile", "garage"] },
  { key: "aviation", direction: "aviation (hangar, airfield or private jet)", keywords: ["jet", "plane", "airplane", "aircraft", "hangar", "airfield", "aviation"] },
  { key: "boat-harbor", direction: "a boat, yacht or harbor", keywords: ["yacht", "boat", "sailing", "harbor", "harbour", "marina", "pier"] },
  { key: "tropical-beach", direction: "a tropical beach or island", keywords: ["beach", "island", "tropical", "seaside", "lagoon"] },
  { key: "rocky-coast", direction: "a wild rocky coastline or lighthouse", keywords: ["lighthouse", "coastline", "cliff", "cliffs", "rocky coast"] },
  { key: "mediterranean", direction: "a Mediterranean seaside village", keywords: ["santorini", "amalfi", "greek", "mediterranean", "riviera"] },
  { key: "lake-river", direction: "a lake, river or waterfall", keywords: ["lake", "river", "waterfall", "lakeside"] },
  { key: "pool-spa", direction: "a pool, spa or bathhouse", keywords: ["pool", "spa", "bathhouse", "bath", "sauna"] },
  { key: "hot-spring", direction: "a hot spring or onsen", keywords: ["onsen", "hot spring", "hot springs"] },
  { key: "snow-mountain", direction: "a snowy mountain or ski lodge", keywords: ["snow", "snowy", "ski", "chalet", "alpine"] },
  { key: "forest", direction: "a deep forest or woodland", keywords: ["forest", "woods", "woodland", "cabin"] },
  { key: "desert", direction: "a desert or canyon", keywords: ["desert", "dune", "dunes", "canyon", "oasis"] },
  { key: "meadow-field", direction: "open fields or meadows (lavender, wheat, sunflower)", keywords: ["lavender", "wheat", "sunflower", "meadow", "field", "fields"] },
  { key: "garden", direction: "a formal or flower garden", keywords: ["garden", "rose garden", "cherry blossom", "sakura"] },
  { key: "greenhouse", direction: "a greenhouse or conservatory", keywords: ["greenhouse", "conservatory", "botanical", "orchid"] },
  { key: "jungle", direction: "a jungle or rainforest", keywords: ["jungle", "rainforest"] },
  { key: "vineyard-farm", direction: "a vineyard, farmhouse or ranch", keywords: ["vineyard", "winery", "wine", "farmhouse", "farm", "ranch", "barn"] },
  { key: "equestrian", direction: "an equestrian stable or horse estate", keywords: ["horse", "equestrian", "stable", "polo"] },
  { key: "sports-court", direction: "a sports venue (tennis, golf, gym, boxing)", keywords: ["tennis", "golf", "gym", "boxing", "court"] },
  { key: "ancient-ruins", direction: "ancient ruins or a temple", keywords: ["ruins", "temple", "ancient", "colosseum"] },
  { key: "gothic-church", direction: "a gothic cathedral or monastery", keywords: ["cathedral", "gothic", "monastery", "chapel"] },
  { key: "east-asian", direction: "a traditional East Asian setting", keywords: ["japanese", "ryokan", "pagoda", "kyoto", "tea house", "hanok"] },
  { key: "moroccan-riad", direction: "a Moroccan riad or Middle Eastern courtyard", keywords: ["moroccan", "morocco", "riad", "mosaic"] },
  { key: "venice-canal", direction: "canals of a water city", keywords: ["venice", "venetian", "gondola", "canal"] },
  { key: "futuristic-lab", direction: "a futuristic lab or spaceship interior", keywords: ["futuristic", "lab", "laboratory", "sci-fi", "spaceship"] },
  { key: "rooftop", direction: "a rooftop terrace", keywords: ["rooftop", "terrace"] },
  { key: "bedroom-boudoir", direction: "an elegant bedroom or boudoir", keywords: ["bedroom", "boudoir"] },
  { key: "kitchen", direction: "a rustic or chef's kitchen", keywords: ["kitchen", "chef"] },
  { key: "fashion-runway", direction: "a fashion runway or showroom", keywords: ["runway", "catwalk", "showroom", "fashion show"] },
  { key: "circus-carnival", direction: "a vintage circus or carnival", keywords: ["circus", "carnival", "carousel", "fairground"] },
  { key: "casino-lounge", direction: "a casino or jazz lounge", keywords: ["casino", "jazz", "lounge", "speakeasy"] },
  { key: "underwater-aquarium", direction: "an aquarium or underwater-themed space", keywords: ["aquarium", "underwater"] },
  { key: "bookstore-antique", direction: "an antique shop or old bookstore", keywords: ["antique", "bookstore", "curiosity shop"] },
];

export const TIME_WEATHER = [
  "misty sunrise",
  "bright midday sun",
  "golden hour",
  "blue hour dusk",
  "moonlit night",
  "rainy evening",
  "soft overcast light",
  "snowfall",
  "autumn leaves",
  "spring blossoms",
];

export const STYLE_ERA = [
  "1920s art deco glamour",
  "1950s retro",
  "1970s vintage film look",
  "modern minimalist",
  "dark moody film noir",
  "romantic soft pastel",
  "bold high-fashion editorial",
  "futuristic sleek",
];

/** Số bộ gần nhất đưa vào danh sách tránh (cân bằng đa dạng vs token). */
export const RECENT_CONCEPT_LIMIT = 10;
const RECENT_CONCEPT_MAX_CHARS = 60;

export interface RecentConcepts {
  /** key nhóm địa điểm code đã bốc cho các bộ gần đây (né chính xác). */
  keys: string[];
  /** campaignTheme của các bộ gần đây (gửi cho LLM + né theo từ khoá). */
  themes: string[];
}

export interface ConceptSeed {
  key: string;
  text: string;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** true nếu nhóm địa điểm có từ khoá trùng (theo ranh giới từ) với một concept cần tránh. */
export function familyConflicts(family: LocationFamily, avoidThemes: string[]): boolean {
  const haystack = avoidThemes.join(" | ").toLowerCase();
  if (!haystack) return false;
  return family.keywords.some((keyword) =>
    new RegExp(`\\b${escapeRegExp(keyword.toLowerCase())}\\b`).test(haystack),
  );
}

function pick<T>(items: T[], random: () => number): T {
  return items[Math.floor(random() * items.length) % items.length];
}

/**
 * Bốc ngẫu nhiên một hướng concept: nhóm địa điểm KHÔNG nằm trong
 * `recent.keys` và không trùng từ khoá với `recent.themes`, ghép với thời
 * điểm/thời tiết + phong cách bốc tự do. Nếu mọi nhóm đều bị né (hiếm) thì bốc
 * từ toàn bộ danh sách.
 */
export function pickConceptSeed(
  recent: RecentConcepts = { keys: [], themes: [] },
  random: () => number = Math.random,
  families: LocationFamily[] = LOCATION_FAMILIES,
): ConceptSeed {
  const recentKeys = new Set(recent.keys);
  const fresh = families.filter((family) => !recentKeys.has(family.key) && !familyConflicts(family, recent.themes));
  const family = pick(fresh.length > 0 ? fresh : families, random);
  return {
    key: family.key,
    text: `${family.direction}, ${pick(TIME_WEATHER, random)}, ${pick(STYLE_ERA, random)}`,
  };
}

/** Chuẩn hoá danh sách concept gần đây: bỏ rỗng/trùng, cắt ngắn từng dòng. */
export function normalizeRecentConcepts(themes: (string | null | undefined)[], limit = RECENT_CONCEPT_LIMIT): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of themes) {
    const theme = (raw ?? "").replace(/\s+/g, " ").trim().slice(0, RECENT_CONCEPT_MAX_CHARS).trim();
    const key = theme.toLowerCase();
    if (!theme || seen.has(key)) continue;
    seen.add(key);
    result.push(theme);
    if (result.length >= limit) break;
  }
  return result;
}

/** Concept của các bộ gần nhất trong DB (mới nhất trước). */
export async function loadRecentConcepts(limit = RECENT_CONCEPT_LIMIT): Promise<RecentConcepts> {
  const rows = await prisma.generationBatch.findMany({
    where: { OR: [{ conceptTheme: { not: null } }, { conceptSeedKey: { not: null } }] },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { conceptTheme: true, conceptSeedKey: true },
  });
  return {
    keys: [...new Set(rows.map((row) => row.conceptSeedKey).filter((key): key is string => Boolean(key)))],
    themes: normalizeRecentConcepts(
      rows.map((row) => row.conceptTheme),
      limit,
    ),
  };
}
