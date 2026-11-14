import { mergeTags } from "@/lib/prompts/merge-tags";
import type { EtsySuggestion, LlmImageSuggestion } from "@/lib/validations/llm";
import { animeTemplateMode, countCast, type SubjectSpec } from "@/lib/llm/axis-decision";
import {
  SINGLE_SUBJECT_QUALITY_TAGS,
  MULTI_SUBJECT_QUALITY_TAGS,
  CROWD_BACKGROUND_TAGS,
  FRAMING_MARGIN_TAGS,
  FRAMING_HEADROOM_TAGS,
  ANIME_SINGLE_SUBJECT_TAGS,
  ANIME_MULTI_SUBJECT_TAGS,
} from "@/lib/llm/default-system-prompt";

const CALENDAR_YEAR = "2027";
// Ép mọi năm 20xx (vd "2025" LLM tự chọn) về năm lịch cố định. Chỉ bắt dạng
// 20xx để tránh đụng các số không phải năm.
const YEAR_REGEX = /\b20\d{2}\b/g;
function forceYear(text: string): string {
  return text.replace(YEAR_REGEX, CALENDAR_YEAR);
}
// Lịch in vật lý giao tận nơi -> loại mọi cụm ngụ ý giao hàng số khỏi metadata.
const DIGITAL_DELIVERY_SRC =
  "\\b(instant\\s+downloads?|digital\\s+(?:downloads?|files?|cop(?:y|ies)|versions?)|downloadable|downloads?|printables?|print[\\s-]?at[\\s-]?home|pdfs?)\\b";
const DIGITAL_DELIVERY_STRIP = new RegExp(DIGITAL_DELIVERY_SRC, "gi");
function stripDigital(text: string): string {
  return text
    .replace(DIGITAL_DELIVERY_STRIP, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.|])/g, "$1")
    .replace(/[ \t]+$/gm, "")
    .trim();
}
const ETSY_TITLE_MAX = 140;
const ETSY_DETAILS_SECTION =
  "\n\nDetails\n\nSizes:\n   11 x 8.5 in (opens to 11 x 17 in)\n   14 x 11.5 in (opens to 14 x 23 in)\nBinding: wire-bound, with a hanging hole\nPaper: Matte or Glossy\nPrinting: printed on demand and shipped to you";
const ETSY_TAG_MAX = 20;
const ETSY_TAG_COUNT = 13;
const ETSY_FALLBACK_TAGS = [
  `calendar ${CALENDAR_YEAR}`,
  "wall calendar",
  "wall decor",
  "printed calendar",
  "home decor",
  "gift idea",
  "art print",
  "desk calendar",
  "monthly planner",
  "wall art",
  "seasonal gift",
  "photo calendar",
  "unique calendar",
];

// Model đang chạy Turbo (CFG=1, negative bị ZeroOut vô hiệu hoá) nên không có
// negative để loại trừ dị tật -- phải diễn đạt DƯƠNG + làm sạch ở positive.
// Loại các cụm copy space / negative space có thể khiến model vẽ dải banner màu
// đặc cắt ngang người.
const BANNER_TAGS_REGEX =
  /\b(with\s+(plenty|ample)\s+of\s+)?(empty\s+)?(copy\s*space|negative\s*space)(\s+(at\s+the|at|in|on)\s+[a-z]+(\s+of\s+the\s+frame)?)?\b/gi;
const FLOOR_TAGS_REGEX = /\bclean\s+simple\s+floor\b/gi;
// Các cụm khiến model băm khung thành nhiều cảnh/dải tách rời (ảnh bị chia đôi).
const SPLIT_TAGS_REGEX =
  /\b(split\s*(composition|screen|frame)?|collage|diptych|triptych|(two|multiple|split)\s+(scenes|backgrounds|panels)|divided\s+frame|panel\s+layout|(upper|top|bottom|lower)\s+half\s+[a-z ]*?(lower|bottom|top|upper)\s+half)\b/gi;
// CHỈ REAL: các cụm "nhân đôi chủ thể" mà LLM có thể lỡ viết, khiến model vẽ 2
// bản người y hệt cạnh nhau. Negative bị ZeroOut (Turbo) nên phải xoá ở positive.
const DUP_SUBJECT_REGEX =
  /\b((the\s+)?same\s+(consistent\s+)?(faces?(\s+and\s+body)?|bodies|body|woman|women|girl|girls|person|people|model|models|character|characters|subject|subjects)|consistent\s+faces?(\s+and\s+body)?|identical|twins?|side\s+by\s+side|duplicated?|mirror(ed)?(\s+image)?|cloned?)\b/gi;
// "same" cách danh từ chủ thể bởi tính từ ("same seductive Vietnamese woman") lọt
// DUP_SUBJECT_REGEX -> chỉ bỏ chữ "(the) same", giữ lại các tính từ mô tả.
const SAME_BEFORE_SUBJECT_REGEX =
  /\b(the\s+)?same\s+(?=(?:[\w-]+\s+){1,4}?(?:faces?|bodies|body|woman|women|girl|girls|person|people|model|models|character|characters|subject|subjects)\b)/gi;
// Dáng béo chỉ được phép khi người dùng tự yêu cầu (requestWantsHeavyBody) --
// LLM hay tự chèn các tag này dù không ai yêu cầu.
const HEAVY_BODY_TAGS_REGEX =
  /\b(chubby|plump|overweight|obese|fat|chunky|bbw|soft\s+belly|belly\s+rolls|full[\s-]+figured?|fuller\s+cheeks|plus[\s-]+size)\b/gi;
// Biểu cảm/cảm xúc thuộc về TỪNG ảnh (LLM tự suy theo hành động của khoảnh khắc
// đó). anchorTags lặp y hệt ở mọi ảnh -> nếu chứa biểu cảm sẽ "đóng băng" cả bộ
// vào một kiểu (vd cười tươi cả khi đang quan hệ). Chỉ lọc khỏi anchor, KHÔNG
// đụng phần LLM viết cho từng ảnh.
const ANCHOR_EXPRESSION_REGEX =
  /\b(smil(e|es|ed|ing)|grin(s|ning)?|smirk\w*|laugh\w*|dimples?|gap[\s-]?tooth\w*|pout\w*|cheerful|joyful|happy|serene|expressions?|gaze|lustful|aroused|ecstatic|moan\w*)\b/i;
const CALENDAR_LABEL = "CALENDAR";

/**
 * Với anime: nếu LLM đã nhận diện và mở đầu bằng tag cặp đôi/hai người, dùng
 * tag nhiều người (ANIME_MULTI_SUBJECT_TAGS) để không chèn các tag solo/no
 * second person đè lên prompt cặp đôi. Mặc định các trường hợp 1 người (solo)
 * vẫn khoá bằng ANIME_SINGLE_SUBJECT_TAGS như cũ.
 */
const ANIME_COUPLE_REGEX = /^\s*(couple|1boy\s*,\s*1girl|1girl\s*,\s*1boy|2girls|2boys)\b/i;
function resolveAnimeSubjectTags(positive: string): string {
  return ANIME_COUPLE_REGEX.test(positive) ? ANIME_MULTI_SUBJECT_TAGS : ANIME_SINGLE_SUBJECT_TAGS;
}

// "Key visual" = poster quảng bá anime, hay kèm chân dung nhân vật lớn đứng riêng
// cạnh cảnh chính -> ở ảnh tháng khiến nhân vật bị vẽ 2 lần. Bìa giữ nguyên.
const KEY_VISUAL_QUALITY_REGEX = /\bhigh\s+quality\s+anime\s+key\s+visual\b/gi;
const KEY_VISUAL_REGEX = /\b(detailed\s+)?(anime\s+)?key\s+visual\b/gi;

/** Anime, ảnh tháng: bỏ "key visual" (kể cả phần tag của preset Kiểu ảnh). */
export function scrubAnimeKeyVisual(positive: string): string {
  return tidyCommas(
    positive.replace(KEY_VISUAL_QUALITY_REGEX, "high quality anime illustration").replace(KEY_VISUAL_REGEX, ""),
  );
}

/** Nhận diện Kiểu ảnh anime -- cùng quy tắc ở suggest-prompts/regenerate-fresh. */
export function isAnimeMediumPreset(medium: { name: string; description?: string | null } | null | undefined): boolean {
  if (!medium) return false;
  return medium.name.toLowerCase().includes("anime") || (medium.description?.toLowerCase().includes("anime") ?? false);
}

function tidyCommas(text: string): string {
  return text
    .replace(/\s*,(\s*,)+/g, ",")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/^\s*,\s*/g, "")
    .replace(/,\s*$/g, "")
    .trim();
}

// Anime: LLM hay gọi nhân vật bằng đặc điểm ngoại hình ("golden-eyed woman",
// "lavender wavy hair beauty") trong khi anchor đã tả ngoại hình -> model hiểu
// thành 2 người. Đổi các cách gọi đó về danh từ trơn.
const EPITHET_FEMALE_REGEX =
  /\b(?:[a-z]+[\s-])?(?:[a-z]+-(?:eyed|haired)|(?:[a-z]+\s+){1,3}hair)\s+(?:woman|girl|beauty|lady)\b/gi;
const EPITHET_MALE_REGEX = /\b(?:[a-z]+[\s-])?[a-z]+-(?:eyed|haired)\s+(?:man|guy|boy)\b/gi;

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Anime: thay các cụm gọi nhân vật bằng ngoại hình thành "the woman"/"the man". */
export function neutralizeAnimeEpithets(positive: string, anchorTags: string | null | undefined): string {
  let result = positive.replace(EPITHET_FEMALE_REGEX, "the woman").replace(EPITHET_MALE_REGEX, "the man");
  // "woman with long crimson hair ..." khi "long crimson hair ..." chính là tag anchor.
  for (const tag of (anchorTags ?? "").split(",").map((t) => t.trim()).filter((t) => /\bhair\b/i.test(t))) {
    result = result.replace(new RegExp(`\\b(?:woman|girl|lady)\\s+with\\s+${escapeRegex(tag)}`, "gi"), "the woman");
    result = result.replace(new RegExp(`\\b(?:man|guy|boy)\\s+with\\s+${escapeRegex(tag)}`, "gi"), "the man");
  }
  return result;
}

/**
 * Tag chủ thể ép lên ĐẦU positive. Có `subjects` (từ lượt phân tích intent) thì
 * theo đúng số người đó; không có (intent lỗi) thì giữ hành vi cũ: real luôn
 * solo, anime đoán cặp đôi từ positive.
 */
function subjectLeadTags(isAnimeMedium: boolean, positive: string, subjects?: SubjectSpec | null): string {
  if (!subjects || (subjects.kind === "solo" && !subjects.crowd)) {
    return isAnimeMedium ? resolveAnimeSubjectTags(positive) : SINGLE_SUBJECT_QUALITY_TAGS;
  }
  let lead: string;
  if (subjects.kind === "solo") {
    // 1 người chính + người phụ mờ: không dùng tag "no other people".
    lead = isAnimeMedium
      ? `one main character in sharp focus, ${ANIME_MULTI_SUBJECT_TAGS}`
      : `one main subject in sharp focus, ${MULTI_SUBJECT_QUALITY_TAGS}`;
  } else {
    // Anime: tổng số người chỉ được giới thiệu MỘT lần. Câu cảnh của Grok đã mở bằng cặp
    // "a man and a woman" thì bỏ câu đếm người ở đây (không viết lại câu cảnh của Grok).
    lead = isAnimeMedium
      ? sceneIntroducesPair(positive, subjects)
        ? ANIME_MULTI_SUBJECT_TAGS
        : `${ANIME_MULTI_SUBJECT_TAGS}, ${animePeopleCountLine(subjects)}`
      : `${subjects.description}, ${MULTI_SUBJECT_QUALITY_TAGS}`;
  }
  return subjects.crowd ? `${lead}, ${CROWD_BACKGROUND_TAGS}` : lead;
}

// Ảnh toàn thân -> cần đủ khoảng trống quanh người (FRAMING_MARGIN_TAGS).
const FULL_BODY_REGEX = /\b(full[\s-]?body|head[\s-]+to[\s-]+toe|full[\s-]?length)\b/i;

const PEOPLE_NOUN = "(?:man|woman|men|women|boy|girl|boys|girls|guy|lady|ladies|person|people)";
const PEOPLE_COUNT_WORD = "(?:a|an|one|two|three|\\d)";
// Tag anchor CHỈ nói số người ("a young man and a young woman", "1boy", "couple").
const PEOPLE_COUNT_TAG_REGEX = new RegExp(
  `^(?:\\d+(?:boy|girl)s?|couple|${PEOPLE_COUNT_WORD}\\s+(?:[a-z-]+\\s+){0,2}${PEOPLE_NOUN}(?:\\s+and\\s+${PEOPLE_COUNT_WORD}\\s+(?:[a-z-]+\\s+){0,2}${PEOPLE_NOUN})?)$`,
  "i",
);

function isAnimeGroupScene(isAnimeMedium: boolean, subjects?: SubjectSpec | null): subjects is SubjectSpec {
  return isAnimeMedium && subjects != null && subjects.kind !== "solo";
}

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six"];
function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

/** Anime nhiều người: câu duy nhất nói tổng số người, vd "exactly two people: one woman and one man". */
export function animePeopleCountLine(subjects: SubjectSpec): string {
  const { women, men, others } = countCast(subjects);
  const total = women + men + others;
  if (total < 2) {
    return subjects.kind === "couple" ? `exactly two people: ${subjects.description}` : subjects.description;
  }
  const part = (n: number, one: string, many: string) => (n === 0 ? [] : [`${numberWord(n)} ${n === 1 ? one : many}`]);
  const cast = [...part(women, "woman", "women"), ...part(men, "man", "men"), ...part(others, "person", "people")];
  return `exactly ${numberWord(total)} people: ${cast.join(" and ")}`;
}

// Danh sách tính từ đóng: chỉ gỡ các cụm giới thiệu người, hầu như không bắt nhầm.
const CAST_ADJ = "(?:young|adult|mature|tall|slender|handsome|muscular|beautiful|pretty)";
const CAST_PERSON = `an?\\s+(?:${CAST_ADJ}\\s+){0,2}(?:man|woman)`;
const SCENE_PAIR_REGEX = new RegExp(`\\b${CAST_PERSON}\\s+and\\s+${CAST_PERSON}\\b`, "i");
const ANCHOR_LEAD_PERSON_REGEX = new RegExp(`^(?:an?\\s+)?(?:${CAST_ADJ}\\s+){0,2}(man|woman)\\b\\s*`, "i");

const OWNED_TAG_REGEX = /^the\s+(?:woman|man)\b/i;
// Danh sách đóng các món đồ nữ-tính; đồ trung tính (shirt, suit...) không đụng tới.
const FEMALE_GARMENT_REGEX =
  /\b(?:lingerie|bra|bralette|panties|thong|g-string|stockings?|thigh[\s-]highs?|garters?|corset|bustier|babydoll|negligee|nightgown|bikini|dress|gown|skirt|miniskirt|heels)\b/i;

/** Đúng 1 nữ + 1 nam (không ai khác): nhóm khác giữ nguyên để khỏi sửa nhầm. */
function isMixedPair(subjects: SubjectSpec): boolean {
  const { women, men, others } = countCast(subjects);
  return women === 1 && men === 1 && others === 0;
}

/** Câu cảnh của Grok đã tự giới thiệu cả hai người ("a young man and a young woman on ..."). */
function sceneIntroducesPair(scene: string, subjects: SubjectSpec): boolean {
  return isMixedPair(subjects) && SCENE_PAIR_REGEX.test(scene);
}

/**
 * Anime cặp nam-nữ, anchor: tag ngoại hình mở bằng "young man ..." / "young woman ..."
 * lại giới thiệu thêm một người nữa -> đổi thành cách gọi xác định ("the man ...") và bỏ
 * chữ "couple" (hint đã cấm). Giữ nguyên đặc điểm ngoại hình.
 */
export function referAnchorToCast(anchor: string): string {
  return anchor
    .split(",")
    .map((raw) => {
      const tag = raw
        .trim()
        .replace(ANCHOR_LEAD_PERSON_REGEX, (_match, noun: string) => `the ${noun.toLowerCase()} `)
        .replace(/\bcouples?\b\s*/gi, "")
        .trim();
      // Đồ nữ-tính không ghi chủ -> model mặc cho cả hai; gán cho người nữ.
      return tag && !OWNED_TAG_REGEX.test(tag) && FEMALE_GARMENT_REGEX.test(tag) ? `the woman wearing ${tag}` : tag;
    })
    .filter(Boolean)
    .join(", ");
}

// Grok lỡ viết "the woman ..." / "woman, ..." đầu trường woman/man -> bỏ để không thành "the woman the woman ...".
const LEADING_WOMAN_REGEX = /^(?:the\s+)?woman(?![\w'’])[\s,:]*/i;
const LEADING_MAN_REGEX = /^(?:the\s+)?man(?![\w'’])[\s,:]*/i;

function personClause(who: "woman" | "man", text: string | undefined): string {
  const cleaned = (text ?? "").trim().replace(who === "woman" ? LEADING_WOMAN_REGEX : LEADING_MAN_REGEX, "");
  return cleaned ? `the ${who} ${cleaned}` : "";
}

/**
 * Anime template: ghép "scene" + "woman" + "man" + "shot.camera" thành `positive`.
 * Người chỉ xuất hiện qua cụm "the woman ..." / "the man ..." (không giới thiệu "a man/a woman"
 * -- câu đếm người do subjectLeadTags chèn đúng 1 lần). Trả true nếu đã ghép.
 * Thiếu trường của chế độ mà vẫn có `positive` tự do -> giữ positive (trả false).
 */
export function assembleAnimePositive(image: LlmImageSuggestion, subjects?: SubjectSpec | null): boolean {
  const mode = animeTemplateMode(subjects);
  if (!mode) return false;
  const scene = (image.scene ?? "").trim();
  const woman = mode === "solo_m" ? "" : personClause("woman", image.woman);
  const man = mode === "solo_f" ? "" : personClause("man", image.man);
  const complete = Boolean(scene) && (mode === "solo_m" || Boolean(woman)) && (mode === "solo_f" || Boolean(man));
  if (!complete && image.positive.trim()) return false;
  const lead = mode === "solo_f" ? "1girl" : mode === "solo_m" ? "1boy" : "";
  const assembled = mergeTags(lead, scene, woman, man, image.shot?.camera?.trim());
  if (!assembled) return false;
  image.positive = assembled;
  return true;
}

/** Anime nhiều người, anchor: bỏ tag chỉ nói số người (đã có câu đếm người). */
export function dropPeopleCountTags(anchor: string): string {
  return anchor
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag && !PEOPLE_COUNT_TAG_REGEX.test(tag))
    .join(", ");
}

/**
 * Bỏ các cụm (ngăn bởi dấu phẩy) trùng lặp NGUYÊN VĂN, giữ lần xuất hiện đầu.
 * Prompt dài + lặp làm token phong cách bị "nặng ký" -> ảnh bóng bẩy, trông giả;
 * lặp thường đến từ anchorTags tiêm vào + LLM tự viết lại cùng ý.
 */
export function dedupePhrases(positive: string): string {
  const seen = new Set<string>();
  return positive
    .split(",")
    .map((phrase) => phrase.trim())
    .filter((phrase) => {
      const key = phrase.toLowerCase().replace(/\s+/g, " ");
      if (!phrase || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(", ");
}

/**
 * Tag BẤT BIẾN của concept cả bộ (concept.anchorTags) mà positive CHƯA có --
 * tiêm vào mọi ảnh để cả bộ chắc chắn cùng địa điểm/đạo cụ/nhân vật, không phụ
 * thuộc LLM tự lặp lại. Bỏ tag đã có sẵn (không phân biệt hoa thường) để không
 * nhân đôi token.
 */
export function missingAnchorTags(
  anchorTags: string | null | undefined,
  positive: string,
  { fuzzy = false }: { fuzzy?: boolean } = {},
): string {
  const lowerPositive = positive.toLowerCase();
  const positiveWords = new Set(lowerPositive.match(/[a-z0-9]+/g) ?? []);
  const seen = new Set<string>();
  return (anchorTags ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (!tag || seen.has(key) || lowerPositive.includes(key)) return false;
      if (fuzzy && isParaphrased(key, positiveWords)) return false;
      seen.add(key);
      return true;
    })
    .join(", ");
}

const FUZZY_STOPWORDS = new Set(["a", "an", "the", "with", "and", "in", "of", "on", "her", "his", "their", "to"]);

/**
 * Tag đã có trong positive dưới dạng viết lại ("adult man short black hair" vs
 * "adult man with short black hair") -- chèn thêm sẽ thành tả nhân vật 2 lần.
 */
function isParaphrased(tag: string, positiveWords: Set<string>): boolean {
  const words = (tag.match(/[a-z0-9]+/g) ?? []).filter((w) => !FUZZY_STOPWORDS.has(w));
  if (words.length < 2) return false;
  const present = words.filter((w) => positiveWords.has(w)).length;
  return present / words.length >= 2 / 3;
}

/**
 * Chuẩn hoá một ảnh do LLM gợi ý về đúng ràng buộc gen ảnh của app, SỬA TẠI CHỖ
 * `image` và trả lại chính nó. Dùng chung bởi route /suggest (tạo cả bộ) và
 * luồng "Sửa lại" 1 ảnh (regenerate-fresh), nên hành vi phải y hệt nhau.
 *
 * - `isCover`: ảnh bìa trước (ảnh #0) -- ép đủ 3 khối chữ (title / "CALENDAR" /
 *   year) + tag typography; `false` = artwork, xoá title/year + ép single-subject.
 * - `isAnimeMedium`: nhánh anime ép tag Danbooru single-subject lên ĐẦU positive.
 * - `anchorTags`: tag bất biến của concept cả bộ, tiêm phần còn thiếu vào positive.
 * - `allowHeavyBody`: người dùng tự yêu cầu dáng béo; mặc định false -> xoá tag béo.
 */
export function finalizeSuggestedImage(
  image: LlmImageSuggestion,
  {
    isCover,
    isAnimeMedium,
    anchorTags,
    allowHeavyBody = false,
    subjects,
  }: {
    isCover: boolean;
    isAnimeMedium: boolean;
    anchorTags?: string | null;
    allowHeavyBody?: boolean;
    subjects?: SubjectSpec | null;
  },
): LlmImageSuggestion {
  if (isAnimeMedium) assembleAnimePositive(image, subjects);
  // Làm sạch bất kỳ từ khoá copy space / split nào LLM có thể đã sinh ra.
  image.positive = image.positive
    .replace(BANNER_TAGS_REGEX, "")
    .replace(FLOOR_TAGS_REGEX, "")
    .replace(SPLIT_TAGS_REGEX, "")
    .replace(/,\s*,/g, ",")
    .trim();

  // Xoá cụm nhân đôi chủ thể (cả ảnh thực lẫn anime).
  image.positive = image.positive
    .replace(SAME_BEFORE_SUBJECT_REGEX, "")
    .replace(DUP_SUBJECT_REGEX, "")
    .replace(/,(\s*,)+/g, ",")
    .replace(/\s{2,}/g, " ")
    .replace(/^\s*,\s*/g, "")
    .replace(/,\s*$/g, "")
    .trim();

  if (isAnimeMedium) {
    image.positive = neutralizeAnimeEpithets(image.positive, anchorTags);
    if (!isCover) image.positive = scrubAnimeKeyVisual(image.positive);
  }
  const animeGroup = isAnimeGroupScene(isAnimeMedium, subjects);

  if (!allowHeavyBody) {
    image.positive = image.positive
      .replace(HEAVY_BODY_TAGS_REGEX, "")
      .replace(/,(\s*,)+/g, ",")
      .replace(/\s{2,}/g, " ")
      .replace(/^\s*,\s*/g, "")
      .replace(/,\s*$/g, "")
      .trim();
  }
  let anchor = missingAnchorTags(anchorTags, image.positive, { fuzzy: isAnimeMedium });
  if (!allowHeavyBody) {
    anchor = anchor.replace(HEAVY_BODY_TAGS_REGEX, "");
  }
  // anchorTags cũng do LLM viết -> làm sạch y như positive (split/nhân đôi chủ thể).
  anchor = anchor
    .replace(SPLIT_TAGS_REGEX, "")
    .replace(BANNER_TAGS_REGEX, "")
    .replace(SAME_BEFORE_SUBJECT_REGEX, "")
    .replace(DUP_SUBJECT_REGEX, "");
  if (isAnimeMedium && !isCover) anchor = scrubAnimeKeyVisual(anchor);
  if (animeGroup) {
    anchor = dropPeopleCountTags(anchor);
    if (subjects && isMixedPair(subjects)) anchor = referAnchorToCast(anchor);
  }
  anchor = anchor
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag && !ANCHOR_EXPRESSION_REGEX.test(tag))
    .join(", ");

  // Tag khung theo cự ly: chỉ ảnh toàn thân mới cần đủ khoảng trống quanh người;
  // ảnh gần hơn chỉ giữ khoảng thở trên đầu (bản đầy đủ đẩy người ra xa -> mặt
  // nhỏ, trông giả, và chọi với cự ly gần).
  // Anime nhiều người: không chèn tag khung -- cự ly do LLM chốt trong "shot.camera".
  const framing = animeGroup
    ? ""
    : FULL_BODY_REGEX.test(image.positive)
      ? FRAMING_MARGIN_TAGS
      : FRAMING_HEADROOM_TAGS;

  if (!isCover) {
    image.title = undefined;
    image.year = undefined;
    // Cả anime lẫn người đều ép single-subject lên ĐẦU positive (model đánh
    // trọng số token đầu mạnh) để giảm lỗi nhân đôi chủ thể ở Turbo (negative
    // bị ZeroOut nên không có lớp chặn duplicate).
    image.positive = dedupePhrases(
      mergeTags(subjectLeadTags(isAnimeMedium, image.positive, subjects), framing, anchor, image.positive),
    );
    return image;
  }

  // Bìa lịch: model ảnh tự vẽ chữ. App chỉ đảm bảo 3 chuỗi bắt buộc (title /
  // "CALENDAR" / year) thật sự có mặt trong positive, không phụ thuộc việc LLM
  // có tuân thủ đúng chỉ dẫn hay không.
  const title = forceYear(image.title?.trim() || "THE COLLECTION");
  const year = CALENDAR_YEAR;
  // Ép mọi năm LLM tự viết trong positive (vd year text "2025") về 2027 TRƯỚC
  // khi dò khối năm: nhờ đó "2027" đã có sẵn, guard không append khối năm thứ 2
  // -> bìa chỉ còn MỘT năm 2027, bỏ được số năm dư thừa.
  image.positive = forceYear(image.positive);
  image.title = title;
  image.year = year;

  const missingTags: string[] = [];
  const lowerPositive = image.positive.toLowerCase();
  if (!lowerPositive.includes(title.toLowerCase())) {
    missingTags.push(`large bold cinematic title text "${title}"`);
  }
  if (!lowerPositive.includes(CALENDAR_LABEL.toLowerCase())) {
    missingTags.push(`uppercase text "${CALENDAR_LABEL}", exact spelling, clearly legible`);
  }
  // Năm: chỉ MỘT lần nhắc để model vẽ đúng MỘT số năm (nhiều lần nhắc -> model
  // vẽ lặp thành nhiều glyph). forceYear đã chuẩn hoá năm LLM về 2027 nên nếu
  // positive đã có thì khỏi thêm; nhấn mạnh bằng tính từ, KHÔNG lặp lại con số.
  if (!lowerPositive.includes(year.toLowerCase())) {
    missingTags.push(`large bold year text "${year}", clearly legible`);
  }

  image.positive = dedupePhrases(
    mergeTags(
      subjectLeadTags(isAnimeMedium, image.positive, subjects),
      framing,
      anchor,
      image.positive,
      ...missingTags,
      "large clear readable typography, text placed in empty background area away from the subject, single continuous scene",
    ),
  );
  return image;
}

/**
 * Chuẩn hoá metadata Etsy (title/description/tags) do LLM gợi ý về đúng giới
 * hạn ký tự của Etsy, SỬA TẠI CHỖ `etsy` và trả lại chính nó:
 * - title: cắt về tối đa 140 ký tự.
 * - tags: đúng 13 phần tử, mỗi tag tối đa 20 ký tự, loại trùng lặp/rỗng; nếu
 *   thiếu thì bù bằng tag mặc định, nếu dư thì cắt.
 * LLM có thể lỡ sai số lượng/độ dài (schema Zod không ép cứng để không làm
 * hỏng việc gen ảnh), nên hàm này là lớp bảo đảm cuối cùng trước khi lưu DB.
 */
export function finalizeEtsy(etsy: EtsySuggestion): EtsySuggestion {
  // Title: tách theo "|", loại cụm giao hàng số ở từng đoạn, bỏ đoạn rỗng.
  const title = forceYear(etsy.title)
    .split("|")
    .map((segment) => stripDigital(segment.trim()))
    .filter(Boolean)
    .join(" | ")
    .slice(0, ETSY_TITLE_MAX);
  const description = stripDigital(forceYear(etsy.description.trim())) + ETSY_DETAILS_SECTION;

  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of etsy.tags) {
    const cleaned = forceYear(raw.trim());
    // Tag chứa cụm giao hàng số -> bỏ nguyên tag (không giữ phần còn lại vụn).
    if (stripDigital(cleaned) !== cleaned) continue;
    const tag = cleaned.slice(0, ETSY_TAG_MAX);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= ETSY_TAG_COUNT) break;
  }
  for (const fallback of ETSY_FALLBACK_TAGS) {
    if (tags.length >= ETSY_TAG_COUNT) break;
    const key = fallback.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(fallback);
  }

  etsy.title = title;
  etsy.description = description;
  etsy.tags = tags;
  return etsy;
}
