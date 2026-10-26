import { z } from "zod";

export const styleCreateSchema = z.object({
  name: z.string().trim().min(1, "Tên style không được để trống").max(100),
  description: z.string().trim().max(500).optional().nullable(),
  positivePrompt: z.string().trim().max(4000).default(""),
  negativePrompt: z.string().trim().max(4000).default(""),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export const styleUpdateSchema = styleCreateSchema.partial();

export const globalPromptUpdateSchema = z.object({
  positivePrompt: z.string().trim().max(4000),
  negativePrompt: z.string().trim().max(4000),
});

export type StyleCreateInput = z.infer<typeof styleCreateSchema>;
export type StyleUpdateInput = z.infer<typeof styleUpdateSchema>;
