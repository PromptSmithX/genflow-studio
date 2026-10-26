import { z } from "zod";

export const sceneCreateSchema = z.object({
  name: z.string().trim().min(1, "Tên bối cảnh không được để trống").max(100),
  description: z.string().trim().max(500).optional().nullable(),
  positivePrompt: z.string().trim().max(4000).default(""),
  negativePrompt: z.string().trim().max(4000).default(""),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export const sceneUpdateSchema = sceneCreateSchema.partial();

export const poseCreateSchema = z.object({
  name: z.string().trim().min(1, "Tên tư thế không được để trống").max(100),
  description: z.string().trim().max(500).optional().nullable(),
  positivePrompt: z.string().trim().max(4000).default(""),
  negativePrompt: z.string().trim().max(4000).default(""),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export const poseUpdateSchema = poseCreateSchema.partial();

export type SceneCreateInput = z.input<typeof sceneCreateSchema>;
export type SceneUpdateInput = z.input<typeof sceneUpdateSchema>;
export type PoseCreateInput = z.input<typeof poseCreateSchema>;
export type PoseUpdateInput = z.input<typeof poseUpdateSchema>;
