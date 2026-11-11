import { prisma } from "@/lib/db";

/**
 * Đa dạng concept giữa các bộ lịch BẰNG CODE (không trông vào LLM tự nhớ):
 * - Mỗi lần /suggest bốc ngẫu nhiên 1 seed concept, né các seed trùng từ khoá
 *   với concept của vài bộ gần nhất -> LLM nhận MỘT gợi ý cụ thể (~20 token)
 *   thay vì cả ma trận concept (vốn mồi LLM chọn lặp lại cùng nhóm).
 * - Concept vài bộ gần nhất (lưu ở GenerationBatch.conceptTheme) gửi kèm làm
 *   danh sách tránh, cắt ngắn để không phình context.
 * Gợi ý chỉ áp dụng khi người dùng KHÔNG tự nêu bối cảnh -- ý người dùng luôn
 * ưu tiên (SHARED_BIAS_PROMPT mục 1).
 *
 * Mỗi seed = MỘT địa điểm + tối đa MỘT loại đạo cụ chính, để cả bộ đồng nhất.
 * `keywords` (tiếng Anh, khớp theo ranh giới từ) dùng để so với campaignTheme
 * (LLM được yêu cầu viết tiếng Anh) của các bộ gần đây.
 */
export interface ConceptSeed {
  theme: string;
  keywords: string[];
}

export const CONCEPT_SEEDS: ConceptSeed[] = [
  { theme: "vintage red convertible roadster on a winding coastal cliff road", keywords: ["car", "cars", "roadster", "convertible", "supercar", "hypercar", "automobile", "automotive"] },
  { theme: "matte black cafe racer motorcycle in an industrial brick loft", keywords: ["motorcycle", "motorbike", "cafe racer", "biker"] },
  { theme: "teak deck of a private sailing yacht off the Amalfi coast", keywords: ["yacht", "boat", "sailing", "marina", "amalfi"] },
  { theme: "private jet cabin and runway at golden hour", keywords: ["jet", "plane", "airplane", "aircraft", "aviation", "runway"] },
  { theme: "marble sculpture atelier with plaster busts and dust in sunbeams", keywords: ["sculpture", "sculptor", "atelier", "marble"] },
  { theme: "sunlit oil painter's studio with easels and canvases", keywords: ["painter", "painting", "easel", "canvas"] },
  { theme: "black grand piano on the stage of an empty concert hall", keywords: ["piano", "concert", "orchestra"] },
  { theme: "old library with dark wood shelves and rolling ladders", keywords: ["library", "books", "bookshelf"] },
  { theme: "snowy mountain onsen resort with steaming outdoor baths", keywords: ["onsen", "hot spring", "snow", "snowy", "ski"] },
  { theme: "tropical botanical greenhouse with giant palms and orchids", keywords: ["greenhouse", "botanical", "orchid", "jungle"] },
  { theme: "luxury desert camp among sand dunes at dusk", keywords: ["desert", "dune", "dunes", "oasis", "sahara"] },
  { theme: "retro country tennis club with a red clay court", keywords: ["tennis", "court"] },
  { theme: "equestrian ranch with a white Andalusian horse", keywords: ["horse", "equestrian", "ranch", "polo"] },
  { theme: "glass penthouse overlooking a night city skyline", keywords: ["penthouse", "skyline", "skyscraper"] },
  { theme: "baroque palace suite with velvet drapes and gilded mirrors", keywords: ["palace", "royal", "baroque", "castle"] },
  { theme: "candle-lit wine cellar with oak barrels", keywords: ["wine", "cellar", "vineyard", "winery"] },
  { theme: "lavender fields and an old stone farmhouse in Provence", keywords: ["lavender", "provence", "farmhouse"] },
  { theme: "cherry blossom garden with a red wooden bridge", keywords: ["cherry blossom", "sakura", "japanese garden"] },
  { theme: "whitewashed cliffside terraces of Santorini", keywords: ["santorini", "greek", "greece", "aegean"] },
  { theme: "rain-soaked neon cyberpunk alley", keywords: ["cyberpunk", "neon"] },
  { theme: "minimalist futuristic research lab with white light panels", keywords: ["futuristic", "lab", "laboratory", "sci-fi", "spaceship"] },
  { theme: "1950s chrome roadside diner", keywords: ["diner", "1950s", "jukebox"] },
  { theme: "Parisian sidewalk cafe on a cobblestone street", keywords: ["paris", "parisian", "cafe", "eiffel"] },
  { theme: "art deco grand hotel lobby with brass and marble", keywords: ["art deco", "hotel", "lobby"] },
  { theme: "Bali villa with an infinity pool above the jungle", keywords: ["pool", "villa", "bali", "infinity pool"] },
  { theme: "autumn maple forest with a log cabin", keywords: ["autumn", "maple", "cabin", "forest"] },
  { theme: "ballet rehearsal studio with tall mirrors and a barre", keywords: ["ballet", "ballerina", "dance", "dancer"] },
  { theme: "Moroccan riad courtyard with mosaic tiles and a fountain", keywords: ["moroccan", "morocco", "riad", "mosaic"] },
  { theme: "lighthouse on a wild rocky northern coastline", keywords: ["lighthouse", "coastline"] },
  { theme: "Venetian canal with a black gondola", keywords: ["venice", "venetian", "gondola", "canal"] },
  { theme: "vintage film photography studio with a darkroom glow", keywords: ["photography", "darkroom", "camera"] },
  { theme: "tropical white-sand beach with a wooden pier", keywords: ["beach", "pier", "seaside", "ocean", "sea"] },
];

/** Số bộ gần nhất đưa vào danh sách tránh (cân bằng đa dạng vs token). */
export const RECENT_CONCEPT_LIMIT = 5;
const RECENT_CONCEPT_MAX_CHARS = 60;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** true nếu seed có từ khoá trùng (theo ranh giới từ) với một concept cần tránh. */
export function seedConflicts(seed: ConceptSeed, avoidConcepts: string[]): boolean {
  const haystack = avoidConcepts.join(" | ").toLowerCase();
  if (!haystack) return false;
  return seed.keywords.some((keyword) => new RegExp(`\\b${escapeRegExp(keyword.toLowerCase())}\\b`).test(haystack));
}

/**
 * Bốc ngẫu nhiên 1 seed, ưu tiên seed không trùng từ khoá với concept gần đây.
 * Nếu mọi seed đều trùng (hiếm) thì bốc từ toàn bộ danh sách.
 */
export function pickConceptSeed(
  avoidConcepts: string[],
  random: () => number = Math.random,
  seeds: ConceptSeed[] = CONCEPT_SEEDS,
): string {
  const fresh = seeds.filter((seed) => !seedConflicts(seed, avoidConcepts));
  const pool = fresh.length > 0 ? fresh : seeds;
  return pool[Math.floor(random() * pool.length) % pool.length].theme;
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
export async function loadRecentConcepts(limit = RECENT_CONCEPT_LIMIT): Promise<string[]> {
  const rows = await prisma.generationBatch.findMany({
    where: { conceptTheme: { not: null } },
    orderBy: { createdAt: "desc" },
    // Lấy dư để còn đủ sau khi bỏ trùng.
    take: limit * 3,
    select: { conceptTheme: true },
  });
  return normalizeRecentConcepts(
    rows.map((row) => row.conceptTheme),
    limit,
  );
}
