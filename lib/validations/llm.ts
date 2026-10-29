import { z } from "zod";

export const suggestPromptsSchema = z.object({
  request: z.string().trim().min(1, "Vui lòng nhập mô tả ý tưởng").max(2000),
  count: z.number().int().min(1).max(20),
  styleId: z.string().trim().optional().nullable(),
  mediumId: z.string().trim().optional().nullable(),
});

export type SuggestPromptsInput = z.infer<typeof suggestPromptsSchema>;

// --- Khung chữ (overlay lịch/poster) ---
// App vẽ chữ lên ảnh sau khi gen (canvas), model chỉ gen ảnh sạch. LLM chọn
// layout + viết tem/quote + quyết vị trí/màu/size; app ép lại title/year.
export const OVERLAY_LAYOUTS = ["V1", "V2", "V3", "V4", "V5"] as const;
export const TEXT_LAYER_ROLES = ["title", "year", "badge", "quote"] as const;
export const TEXT_LAYER_POSITIONS = [
  "top-left",
  "top-center",
  "top-right",
  "center",
  "bottom-left",
  "bottom-center",
  "bottom-right",
] as const;
export const TEXT_LAYER_SIZES = ["xl", "l", "m", "s"] as const;
export const TEXT_LAYER_STYLES = ["serif", "bold-caps", "tall-caps", "script", "sans"] as const;

export const textLayerSchema = z.object({
  role: z.enum(TEXT_LAYER_ROLES),
  text: z.string().trim().min(1).max(200),
  pos: z.enum(TEXT_LAYER_POSITIONS),
  color: z.string().trim().max(32).default("white"),
  size: z.enum(TEXT_LAYER_SIZES).default("l"),
  style: z.enum(TEXT_LAYER_STYLES).default("bold-caps"),
});

export type TextLayer = z.infer<typeof textLayerSchema>;

export const overlaySpecSchema = z.object({
  layout: z.enum(OVERLAY_LAYOUTS),
  textLayers: z.array(textLayerSchema).min(1).max(8),
});

export type OverlaySpec = z.infer<typeof overlaySpecSchema>;

export const llmImageSuggestionSchema = z.object({
  positive: z.string().trim().min(1),
  caption: z.string().trim().min(1),
  layout: z.enum(OVERLAY_LAYOUTS).optional(),
  textLayers: z.array(textLayerSchema).optional(),
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
