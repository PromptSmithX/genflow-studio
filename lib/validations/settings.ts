import { z } from "zod";

export const seedModeSchema = z.enum(["random", "fixed"]);

export const settingsUpdateSchema = z.object({
  comfyBaseUrl: z.string().trim().optional().nullable(),
  gatewayToken: z.string().trim().optional().nullable(),
  runpodEndpointId: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]*$/i, "Endpoint ID không hợp lệ")
    .optional()
    .nullable(),
  runpodApiKey: z.string().trim().optional().nullable(),
  defaultWidth: z.number().int().min(64).max(4096).optional(),
  defaultHeight: z.number().int().min(64).max(4096).optional(),
  defaultSteps: z.number().int().min(1).max(200).optional(),
  defaultCfg: z.number().min(0).max(30).optional(),
  defaultSeedMode: seedModeSchema.optional(),
  defaultFixedSeed: z.number().int().min(0).optional().nullable(),
  maxImagesPerBatch: z.number().int().min(1).max(15).optional(),
  outputDirectory: z.string().trim().min(1).optional(),
  autoPublish: z.boolean().optional(),
  autoFormatId: z.string().trim().min(1).optional(),
  advancedMode: z.boolean().optional(),
  // Trợ lý AI đi qua cùng gateway Colab với ComfyUI (route "/llm") -- không
  // còn base URL/API key riêng để nhập ở app. llmModel vẫn tuỳ chọn override
  // nếu model mặc định phía Colab (Cell 7.6) khác. Xem lib/llm/resolve-config.ts.
  llmModel: z.string().trim().optional().nullable(),
  llmSystemPrompt: z.string().trim().max(8000).optional().nullable(),
});

export const connectionTestSchema = z.object({
  endpointId: z.string().trim().optional(),
  apiKey: z.string().trim().optional(),
});

export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;
