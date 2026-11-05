import { mergeTags } from "@/lib/prompts/merge-tags";
import type { EtsySuggestion, LlmImageSuggestion } from "@/lib/validations/llm";
import {
  SINGLE_SUBJECT_QUALITY_TAGS,
  FRAMING_MARGIN_TAGS,
  ANIME_SINGLE_SUBJECT_TAGS,
  ANIME_COUPLE_QUALITY_TAGS,
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
const CALENDAR_LABEL = "CALENDAR";

/**
 * Với anime: nếu LLM đã nhận diện và mở đầu bằng tag cặp đôi/hai người, dùng
 * tag giải phẫu tỉ lệ (ANIME_COUPLE_QUALITY_TAGS) để không chèn các tag solo/no
 * second person đè lên prompt cặp đôi. Mặc định các trường hợp 1 người (solo)
 * vẫn khoá bằng ANIME_SINGLE_SUBJECT_TAGS như cũ.
 */
const ANIME_COUPLE_REGEX = /^\s*(couple|1boy\s*,\s*1girl|1girl\s*,\s*1boy|2girls|2boys)\b/i;
function resolveAnimeSubjectTags(positive: string): string {
  return ANIME_COUPLE_REGEX.test(positive) ? ANIME_COUPLE_QUALITY_TAGS : ANIME_SINGLE_SUBJECT_TAGS;
}

/**
 * Chuẩn hoá một ảnh do LLM gợi ý về đúng ràng buộc gen ảnh của app, SỬA TẠI CHỖ
 * `image` và trả lại chính nó. Dùng chung bởi route /suggest (tạo cả bộ) và
 * luồng "Sửa lại" 1 ảnh (regenerate-fresh), nên hành vi phải y hệt nhau.
 *
 * - `isCover`: ảnh bìa trước (ảnh #0) -- ép đủ 3 khối chữ (title / "CALENDAR" /
 *   year) + tag typography; `false` = artwork, xoá title/year + ép single-subject.
 * - `isAnimeMedium`: nhánh anime ép tag Danbooru single-subject lên ĐẦU positive.
 */
export function finalizeSuggestedImage(
  image: LlmImageSuggestion,
  { isCover, isAnimeMedium }: { isCover: boolean; isAnimeMedium: boolean },
): LlmImageSuggestion {
  // Làm sạch bất kỳ từ khoá copy space / split nào LLM có thể đã sinh ra.
  image.positive = image.positive
    .replace(BANNER_TAGS_REGEX, "")
    .replace(FLOOR_TAGS_REGEX, "")
    .replace(SPLIT_TAGS_REGEX, "")
    .replace(/,\s*,/g, ",")
    .trim();

  // Real-only: xoá cụm nhân đôi chủ thể (anime giữ nguyên hành vi cũ).
  if (!isAnimeMedium) {
    image.positive = image.positive
      .replace(DUP_SUBJECT_REGEX, "")
      .replace(/,(\s*,)+/g, ",")
      .replace(/\s{2,}/g, " ")
      .replace(/^\s*,\s*/g, "")
      .replace(/,\s*$/g, "")
      .trim();
  }

  if (!isCover) {
    image.title = undefined;
    image.year = undefined;
    // Cả anime lẫn người đều ép single-subject lên ĐẦU positive (model đánh
    // trọng số token đầu mạnh) để giảm lỗi nhân đôi chủ thể ở Turbo (negative
    // bị ZeroOut nên không có lớp chặn duplicate).
    image.positive = isAnimeMedium
      ? mergeTags(resolveAnimeSubjectTags(image.positive), FRAMING_MARGIN_TAGS, image.positive)
      : mergeTags(SINGLE_SUBJECT_QUALITY_TAGS, FRAMING_MARGIN_TAGS, image.positive);
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

  image.positive = isAnimeMedium
    ? mergeTags(
        resolveAnimeSubjectTags(image.positive),
        FRAMING_MARGIN_TAGS,
        image.positive,
        ...missingTags,
        "large clear readable typography, text placed in empty background area away from the subject, single continuous scene",
      )
    : mergeTags(
        SINGLE_SUBJECT_QUALITY_TAGS,
        FRAMING_MARGIN_TAGS,
        image.positive,
        ...missingTags,
        "large clear readable typography, text placed in empty background area away from the subject, single continuous scene",
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
