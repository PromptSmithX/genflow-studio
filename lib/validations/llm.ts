import { z } from "zod";

export const suggestPromptsSchema = z.object({
  request: z.string().trim().min(1, "Vui lòng nhập mô tả ý tưởng").max(2000),
  count: z.number().int().min(1).max(20),
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

export const llmSuggestionResultSchema = z.object({
  images: z.array(llmImageSuggestionSchema),
  negative: z.string().trim().default(""),
});

export type LlmSuggestionResult = z.infer<typeof llmSuggestionResultSchema>;
export type LlmImageSuggestion = z.infer<typeof llmImageSuggestionSchema>;

export interface TokenUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}

export type SuggestPromptsResponse = LlmSuggestionResult & { usage: TokenUsage | null };
