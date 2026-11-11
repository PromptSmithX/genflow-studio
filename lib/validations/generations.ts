import { z } from "zod";

export const imageRequestSchema = z.object({
  sceneId: z.string().optional().nullable(),
  poseId: z.string().optional().nullable(),
  positiveOverride: z.string().trim().max(4000).optional().nullable(),
  negativeOverride: z.string().trim().max(4000).optional().nullable(),
});

// Metadata Etsy cho CẢ bộ lịch (per batch), do Trợ lý AI gợi ý ở /api/generations/suggest
// và được form tạo ảnh forward thẳng vào request create này -- xem lib/generations/create-batch.ts.
export const etsyMetadataSchema = z.object({
  title: z.string().trim().max(140).optional(),
  description: z.string().trim().optional(),
  tags: z.array(z.string().trim().max(20)).max(13).optional(),
});

// Concept chiến dịch LLM chốt cho cả bộ (Trợ lý AI) -- lưu vào batch để các bộ
// sau né concept này và "Sửa lại" 1 ảnh giữ đúng concept của bộ.
export const batchConceptSchema = z.object({
  theme: z.string().trim().max(300).optional(),
  anchorTags: z.string().trim().max(2000).optional(),
  seedKey: z.string().trim().max(100).optional(),
  appearanceKey: z.string().trim().max(200).optional(),
});

export const createGenerationSchema = z.object({
  styleId: z.string().min(1).optional().nullable(),
  mediumId: z.string().min(1).optional().nullable(),
  ideaPrompt: z.string().trim().max(2000).optional(),
  images: z.array(imageRequestSchema).min(1).max(15),
  etsy: etsyMetadataSchema.optional().nullable(),
  concept: batchConceptSchema.optional().nullable(),
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
