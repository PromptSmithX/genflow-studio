import { z } from "zod";

export const seedModeSchema = z.enum(["random", "fixed"]);

export const settingsUpdateSchema = z.object({
  comfyBaseUrl: z.string().trim().optional().nullable(),
  gatewayToken: z.string().trim().optional().nullable(),
  defaultWidth: z.number().int().min(64).max(4096).optional(),
  defaultHeight: z.number().int().min(64).max(4096).optional(),
  defaultSteps: z.number().int().min(1).max(200).optional(),
  defaultCfg: z.number().min(0).max(30).optional(),
  defaultSeedMode: seedModeSchema.optional(),
  defaultFixedSeed: z.number().int().min(0).optional().nullable(),
  maxImagesPerBatch: z.number().int().min(1).max(8).optional(),
  outputDirectory: z.string().trim().min(1).optional(),
});

export const connectionTestSchema = z.object({
  baseUrl: z.string().trim().min(1, "URL không được để trống"),
});

export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;
