import { z } from "zod";

export const imageRequestSchema = z.object({
  styleId: z.string().min(1, "Vui lòng chọn một style"),
  positiveOverride: z.string().trim().max(2000).optional().nullable(),
  negativeOverride: z.string().trim().max(2000).optional().nullable(),
});

export const createGenerationSchema = z.object({
  idea: z.string().trim().min(1, "Vui lòng nhập ý tưởng").max(4000),
  images: z.array(imageRequestSchema).min(1).max(8),
  width: z.number().int().min(64).max(4096).optional(),
  height: z.number().int().min(64).max(4096).optional(),
  steps: z.number().int().min(1).max(200).optional(),
  cfg: z.number().min(0).max(30).optional(),
  sampler: z.string().trim().optional(),
  scheduler: z.string().trim().optional(),
  seedMode: z.enum(["random", "fixed"]).default("random"),
  fixedSeed: z.number().int().min(0).optional().nullable(),
  incrementFixedSeed: z.boolean().optional(),
});

export type CreateGenerationInput = z.infer<typeof createGenerationSchema>;

export const nodeMappingEntrySchema = z.object({
  nodeId: z.string().min(1),
  inputKey: z.string().min(1),
  enabled: z.boolean(),
});

export const nodeMappingSchema = z.object({
  positivePrompt: nodeMappingEntrySchema.optional(),
  negativePrompt: nodeMappingEntrySchema.optional(),
  seed: nodeMappingEntrySchema.optional(),
  width: nodeMappingEntrySchema.optional(),
  height: nodeMappingEntrySchema.optional(),
  steps: nodeMappingEntrySchema.optional(),
  cfg: nodeMappingEntrySchema.optional(),
  sampler: nodeMappingEntrySchema.optional(),
  scheduler: nodeMappingEntrySchema.optional(),
  batchSize: nodeMappingEntrySchema.optional(),
});

export type NodeMappingInput = z.infer<typeof nodeMappingSchema>;
