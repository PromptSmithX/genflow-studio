import { mergeTags } from "@/lib/prompts/merge-tags";
import type { LlmImageSuggestion } from "@/lib/validations/llm";
import {
  SINGLE_SUBJECT_QUALITY_TAGS,
  FRAMING_MARGIN_TAGS,
  ANIME_SINGLE_SUBJECT_TAGS,
} from "@/lib/llm/default-system-prompt";

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
    // Anime: ép single-subject lên ĐẦU positive (model đánh trọng số token đầu
    // mạnh); nhánh người giữ tag chung ở cuối.
    image.positive = isAnimeMedium
      ? mergeTags(ANIME_SINGLE_SUBJECT_TAGS, FRAMING_MARGIN_TAGS, image.positive)
      : mergeTags(image.positive, FRAMING_MARGIN_TAGS, SINGLE_SUBJECT_QUALITY_TAGS);
    return image;
  }

  // Bìa lịch: model ảnh tự vẽ chữ. App chỉ đảm bảo 3 chuỗi bắt buộc (title /
  // "CALENDAR" / year) thật sự có mặt trong positive, không phụ thuộc việc LLM
  // có tuân thủ đúng chỉ dẫn hay không.
  const title = image.title?.trim() || "THE COLLECTION";
  const year = image.year?.trim() || String(new Date().getFullYear() + 1);
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
  if (!lowerPositive.includes(year.toLowerCase())) {
    missingTags.push(`year text "${year}"`);
  }

  image.positive = isAnimeMedium
    ? mergeTags(
        ANIME_SINGLE_SUBJECT_TAGS,
        FRAMING_MARGIN_TAGS,
        image.positive,
        ...missingTags,
        "large clear readable typography, text placed in empty background area away from the subject, single continuous scene",
      )
    : mergeTags(
        image.positive,
        FRAMING_MARGIN_TAGS,
        ...missingTags,
        "large clear readable typography, text placed in empty background area away from the subject, single continuous scene",
        SINGLE_SUBJECT_QUALITY_TAGS,
      );
  return image;
}
