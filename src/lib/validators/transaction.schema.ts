/**
 * Transaction Zod Schemas
 * Path: src/lib/validators/transaction.schema.ts
 *
 * Amount handling (plan assumption A4):
 *   Client submits rupees (e.g. "1250.50" or 1250.50).
 *   Schema transforms → paise integer (125050) before hitting the DB.
 *   `amountRupees` field is the raw client value; `amount` is paise.
 *
 * These schemas are imported by:
 *   - src/server/actions/transaction.actions.ts  (server enforcement)
 *   - TransactionForm.tsx via react-hook-form zodResolver (client UX)
 */

import { z } from "zod"

// ── Shared field definitions ──────────────────────────────────

/** Client submits rupees; we validate and convert to paise. */
const amountRupeesField = z
  .string({ required_error: "Amount is required" })
  .or(z.number())
  .transform((v) => (typeof v === "number" ? v.toString() : v))
  .pipe(
    z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, "Enter a valid amount (e.g. 1250.50)")
      .transform((v) => Math.round(parseFloat(v) * 100))   // → paise
      .pipe(z.number().int().positive("Amount must be greater than 0"))
  )

const transactionTypeField = z.enum(["INCOME", "EXPENSE", "TRANSFER"], {
  required_error: "Transaction type is required",
})

const dateField = z
  .string({ required_error: "Date is required" })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
  .refine((v) => {
    const d = new Date(v)
    return !isNaN(d.getTime()) && d <= new Date()
  }, "Date cannot be in the future")

// ── Create ────────────────────────────────────────────────────

export const createTransactionBaseSchema = z.object({
  accountId:          z.string().min(1, "Account is required"),
  categoryId:         z.string().nullable().optional(),
  type:               transactionTypeField,
  amount:             amountRupeesField,          // paise after transform
  currency:           z.string().default("INR"),
  description:        z
                        .string({ required_error: "Description is required" })
                        .min(1, "Description is required")
                        .max(255, "Max 255 characters"),
  notes:              z.string().max(1000, "Max 1000 characters").optional().nullable(),
  transactionDate:    dateField,
  tags:               z.array(z.string().max(30)).max(10).default([]),
  transferToAccountId: z.string().nullable().optional(),

  // Receipt and Workflow status
  receiptUrl:          z.string().nullable().optional(),
  receiptMimeType:     z.string().nullable().optional(),
  status:              z.enum(["DRAFT", "PENDING", "APPROVED", "REJECTED", "REIMBURSED"]).optional(),
  submitForApproval:   z.boolean().optional(),

  // AI Audit fields
  aiRawVendor:         z.string().nullable().optional(),
  aiRawAmount:         z.coerce.number().nullable().optional(),
  aiRawDate:           z.string().nullable().optional(),
  aiRawCategory:       z.string().nullable().optional(),
  aiConfidence:        z.number().nullable().optional(),
  aiExtractionRaw:     z.any().optional().nullable(),
})

export const createTransactionSchema = createTransactionBaseSchema
  .refine(
    (d) => d.type !== "TRANSFER" || !!d.transferToAccountId,
    { message: "Destination account is required for transfers", path: ["transferToAccountId"] }
  )
  .refine(
    (d) => !(d.type === "TRANSFER" && d.accountId === d.transferToAccountId),
    { message: "Cannot transfer to the same account", path: ["transferToAccountId"] }
  )

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>

// ── Update ────────────────────────────────────────────────────

export const updateTransactionSchema = createTransactionBaseSchema.partial().refine(
  (d: Record<string, unknown>) => Object.keys(d).length > 0,
  "At least one field must be updated"
)

export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>

// ── Filter / search params ────────────────────────────────────

export const transactionFilterSchema = z.object({
  page:        z.coerce.number().int().min(1).default(1),
  pageSize:    z.coerce.number().int().min(1).max(100).default(20),
  search:      z.string().optional(),
  type:        z.enum(["INCOME", "EXPENSE", "TRANSFER"]).optional().nullable(),
  categoryId:  z.string().optional(),
  accountId:   z.string().optional(),
  dateFrom:    z.string().optional(),
  dateTo:      z.string().optional(),
  sortBy:      z
    .enum(["transactionDate", "amount", "description", "createdAt"])
    .default("transactionDate"),
  sortOrder:   z.enum(["asc", "desc"]).default("desc"),
})

export type TransactionFilters = z.infer<typeof transactionFilterSchema>