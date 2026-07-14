/**
 * Goal Zod Validation Schemas
 * Path: src/lib/validators/goal.schema.ts
 */

import { z } from "zod"

const amountRupeesField = (name: string) => z
  .string({ required_error: `${name} amount is required` })
  .refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) >= 0, `${name} must be a positive number`)
  .transform((v) => Math.round(parseFloat(v) * 100)) // to paise (integer)

const dateField = z
  .string({ required_error: "Target date is required" })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
  .refine((v) => !isNaN(new Date(v).getTime()), "Invalid date format")

export const createGoalSchema = z.object({
  name:          z.string().min(1, "Goal name is required").max(100, "Max 100 characters"),
  description:   z.string().max(500, "Max 500 characters").optional().nullable(),
  targetAmount:  amountRupeesField("Target"),
  currentAmount: amountRupeesField("Current").default("0"),
  targetDate:    dateField.optional().nullable(),
  icon:          z.string().max(50).optional().nullable(),
  color:         z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a hex color").optional().nullable(),
})

export type CreateGoalInput = z.infer<typeof createGoalSchema>

export const updateGoalSchema = z.object({
  name:          z.string().min(1, "Goal name is required").max(100, "Max 100 characters").optional(),
  description:   z.string().max(500, "Max 500 characters").optional().nullable(),
  targetAmount:  amountRupeesField("Target").optional(),
  currentAmount: amountRupeesField("Current").optional(),
  targetDate:    dateField.optional().nullable(),
  icon:          z.string().max(50).optional().nullable(),
  color:         z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a hex color").optional().nullable(),
  status:        z.enum(["ACTIVE", "COMPLETED", "ARCHIVED"]).optional(),
})

export type UpdateGoalInput = z.infer<typeof updateGoalSchema>