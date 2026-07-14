/**
 * Budget Zod Validation Schemas
 * Path: src/lib/validators/budget.schema.ts
 */

import { z } from "zod"

const amountRupeesField = z
  .string({ required_error: "Limit amount is required" })
  .refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, "Limit must be a positive number")
  .transform((v) => Math.round(parseFloat(v) * 100)) // to paise (integer)

const dateField = z
  .string({ required_error: "Date is required" })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
  .refine((v) => !isNaN(new Date(v).getTime()), "Invalid date format")

export const createBudgetSchema = z
  .object({
    categoryId:     z.string().min(1, "Category is required"),
    name:           z.string().max(100, "Max 100 characters").optional().nullable(),
    limitAmount:    amountRupeesField,
    period:         z.enum(["WEEKLY", "MONTHLY", "YEARLY", "CUSTOM"], {
                      required_error: "Period is required",
                    }),
    periodStart:    dateField,
    periodEnd:      dateField,
    rollover:       z.boolean().default(false),
    alertAtPercent: z.coerce.number().int().min(1).max(100).default(80),
  })
  .refine((d) => new Date(d.periodEnd) > new Date(d.periodStart), {
    message: "End date must be after start date",
    path: ["periodEnd"],
  })

export type CreateBudgetInput = z.infer<typeof createBudgetSchema>

export const updateBudgetSchema = z.object({
  name:           z.string().max(100, "Max 100 characters").optional().nullable(),
  limitAmount:    amountRupeesField.optional(),
  period:         z.enum(["WEEKLY", "MONTHLY", "YEARLY", "CUSTOM"]).optional(),
  periodStart:    dateField.optional(),
  periodEnd:      dateField.optional(),
  rollover:       z.boolean().optional(),
  alertAtPercent: z.coerce.number().int().min(1).max(100).optional(),
}).refine(
  (d: any) => {
    if (d.periodStart && d.periodEnd) {
      return new Date(d.periodEnd) > new Date(d.periodStart)
    }
    return true
  },
  { message: "End date must be after start date", path: ["periodEnd"] }
)

export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>