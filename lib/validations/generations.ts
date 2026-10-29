import { z } from "zod";
import { overlaySpecSchema } from "@/lib/validations/llm";

export const imageRequestSchema = z.object({
  sceneId: z.string().optional().nullable(),
  poseId: z.string().optional().nullable(),
  positiveOverride: z.string().trim().max(2000).optional().nullable(),
  negativeOverride: z.string().trim().max(2000).optional().nullable(),
  overlaySpec: overlaySpecSchema.optional().nullable(),
});

export const createGenerationSchema = z.object({
  styleId: z.string().min(1).optional().nullable(),
  ideaPrompt: z.string().trim().max(2000).optional(),
  images: z.array(imageRequestSchema).min(1).max(20),
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
