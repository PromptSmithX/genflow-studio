import { z } from "zod";

export const mediumCreateSchema = z.object({
  name: z.string().trim().min(1, "Tên kiểu ảnh không được để trống").max(100),
  description: z.string().trim().max(500).optional().nullable(),
  positivePrompt: z.string().trim().max(4000).default(""),
  negativePrompt: z.string().trim().max(4000).default(""),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export const mediumUpdateSchema = mediumCreateSchema.partial();

export type MediumCreateInput = z.input<typeof mediumCreateSchema>;
export type MediumUpdateInput = z.input<typeof mediumUpdateSchema>;
