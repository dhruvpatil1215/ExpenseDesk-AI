/**
 * Category Zod Schemas
 * Path: src/lib/validators/category.schema.ts
 */

import { z } from "zod"

export const createCategorySchema = z.object({
  name: z
    .string({ required_error: "Name is required" })
    .min(1, "Name is required")
    .max(80, "Max 80 characters")
    .refine((v) => v.trim().length > 0, "Name cannot be empty"),
  type: z.enum(["INCOME", "EXPENSE"], {
    required_error: "Category type is required",
  }),
  icon: z
    .string()
    .max(50, "Icon descriptor is too long")
    .optional()
    .nullable()
    .transform((val) => val || null),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color (e.g. #FF0000)")
    .optional()
    .nullable()
    .transform((val) => val || null),
})

export type CreateCategoryInput = z.infer<typeof createCategorySchema>

export const updateCategorySchema = createCategorySchema.partial().refine(
  (d: Record<string, unknown>) => Object.keys(d).length > 0,
  "At least one field must be updated"
)

export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>