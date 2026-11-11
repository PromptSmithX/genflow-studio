import { z } from "zod";

export const suggestPromptsSchema = z.object({
  request: z.string().trim().min(1, "Vui lòng nhập mô tả ý tưởng").max(2000),
  count: z.number().int().min(1).max(15),
  styleId: z.string().trim().optional().nullable(),
  mediumId: z.string().trim().optional().nullable(),
});

export type SuggestPromptsInput = z.infer<typeof suggestPromptsSchema>;

// --- Chữ bìa lịch ---
// Model gen ảnh TỰ VẼ chữ lên ảnh bìa (#1) -- không còn overlay canvas. "title"
// (tên, chữ lớn nhất) + "year" chỉ áp dụng cho ảnh #1; app đảm bảo cả 2 chuỗi
// (cùng nhãn "CALENDAR") có mặt trong "positive" khi gửi gen.
export const llmImageSuggestionSchema = z.object({
  positive: z.string().trim().min(1),
  caption: z.string().trim().min(1),
  title: z.string().trim().max(60).optional(),
  year: z.string().trim().max(20).optional(),
});

// --- Metadata Etsy (per bộ lịch / per batch) ---
// LLM trả thêm 1 object "etsy" ở top-level mô tả CẢ bộ lịch như một listing Etsy
// (title/description/tags SEO). Giữ schema LỎNG (không ép độ dài) để Etsy lỡ sai
// shape không làm hỏng việc gen ảnh; độ dài chuẩn Etsy được clamp ở finalizeEtsy
// (title ≤140, đúng 13 tags, mỗi tag ≤20 ký tự).
export const etsySuggestionSchema = z.object({
  title: z.string().trim().default(""),
  description: z.string().trim().default(""),
  tags: z.array(z.string().trim()).default([]),
});

// --- Concept chiến dịch (per bộ lịch / per batch) ---
// LLM chốt MỘT concept chung cho cả bộ và trả về ở top-level. "anchorTags" là
// chuỗi tag tiếng Anh CHỈ chứa phần BẤT BIẾN của cả bộ (ngoại hình nhân vật,
// nhóm trang phục, bảng màu, không gian/mood) -- KHÔNG kèm cảnh/tư thế/góc máy
// theo từng tháng. App tiêm phần "anchorTags" còn thiếu vào MỌI positive
// (finalizeSuggestedImage) để cả bộ cùng concept, không phụ thuộc LLM tuân thủ;
// concept được lưu vào GenerationBatch (conceptTheme/conceptAnchorTags).
// Giữ schema LỎNG (default rỗng) để LLM lỡ bỏ field không làm hỏng việc gen.
export const conceptSuggestionSchema = z.object({
  campaignTheme: z.string().trim().default(""),
  anchorTags: z.string().trim().default(""),
});

export const llmSuggestionResultSchema = z.object({
  images: z.array(llmImageSuggestionSchema),
  negative: z.string().trim().default(""),
  concept: conceptSuggestionSchema.optional(),
  etsy: etsySuggestionSchema.optional(),
});

export type LlmSuggestionResult = z.infer<typeof llmSuggestionResultSchema>;
export type LlmImageSuggestion = z.infer<typeof llmImageSuggestionSchema>;
export type EtsySuggestion = z.infer<typeof etsySuggestionSchema>;
export type ConceptSuggestion = z.infer<typeof conceptSuggestionSchema>;

export interface TokenUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}

export type SuggestPromptsResponse = LlmSuggestionResult & {
  usage: TokenUsage | null;
  /** key nhóm địa điểm /suggest đã bốc làm hướng concept -- client gửi lại khi create. */
  conceptSeedKey?: string;
  /** Ngoại hình /suggest đã bốc ("quốc tịch|tóc|dáng") -- client gửi lại khi create. */
  appearanceKey?: string;
};
