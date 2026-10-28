import { z } from "zod";

export const suggestPromptsSchema = z.object({
  request: z.string().trim().min(1, "Vui lòng nhập mô tả ý tưởng").max(2000),
  count: z.number().int().min(1).max(20),
  styleId: z.string().trim().optional().nullable(),
});

export type SuggestPromptsInput = z.infer<typeof suggestPromptsSchema>;

export const llmImageSuggestionSchema = z.object({
  positive: z.string().trim().min(1),
  caption: z.string().trim().min(1),
});

export const llmSuggestionResultSchema = z.object({
  images: z.array(llmImageSuggestionSchema),
  negative: z.string().trim().default(""),
});

export type LlmSuggestionResult = z.infer<typeof llmSuggestionResultSchema>;

export interface TokenUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}

export type SuggestPromptsResponse = LlmSuggestionResult & { usage: TokenUsage | null };
