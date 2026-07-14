/**
 * Transaction Server Actions
 * Path: src/server/actions/transaction.actions.ts
 *
 * Every action follows this pattern:
 *   1. requireAuth()         → throws 401 if unauthenticated
 *   2. Zod.safeParse()       → returns fieldErrors on invalid input
 *   3. Ownership check       → throws 403 if user doesn't own the record
 *   4. Prisma mutation       → in a transaction where applicable
 *   5. ActivityLog insert    → audit trail (fire-and-forget, non-blocking)
 *   6. revalidatePath()      → invalidates the Server Component cache
 *   7. Return ActionResult   → { success, data?, error?, fieldErrors? }
 *
 * Return type is always a plain serialisable object (no BigInt, no Date).
 */

"use server"

import { revalidatePath } from "next/cache"
import { prisma }         from "@/lib/db"
import { requireAuth }    from "@/lib/session"
import { genAI, GEMINI_MODEL } from "@/lib/ai/gemini"
import {
  createTransactionSchema,
  updateTransactionSchema,
  type CreateTransactionInput,
} from "@/lib/validators/transaction.schema"
import type { SerializedTransaction } from "@/lib/queries/transaction.queries"

// ── Return type ───────────────────────────────────────────────

export interface ActionResult<T = undefined> {
  success:      boolean
  data?:        T
  error?:       string
  fieldErrors?: Record<string, string[]>
}

// ── Helper: audit log (non-blocking) ─────────────────────────

async function audit(
  userId:       string,
  action:       string,
  resourceId:   string,
  resourceType: string,
  oldValues?:   object,
  newValues?:   object
) {
  prisma.activityLog
    .create({ data: { userId, action, resourceType, resourceId,
                      oldValues:  oldValues  ? (oldValues  as never) : undefined,
                      newValues:  newValues  ? (newValues  as never) : undefined } })
    .catch(console.error)
}

// ── Helper: serialise a Prisma row ────────────────────────────

function serialize(t: {
  id: string; userId: string; accountId: string; categoryId: string | null
  type: string; amount: bigint; currency: string; description: string
  notes: string | null; transactionDate: Date; tags: string[]; status: string
  receiptUrl: string | null; isRecurring: boolean; transferToAccountId: string | null
  createdAt: Date; updatedAt: Date
  rejectionReason: string | null
  reimbursedAt: Date | null
  account: { name: string }
  category: { name: string; color: string | null; icon: string | null } | null
}): SerializedTransaction {
  return {
    id:                  t.id,
    userId:              t.userId,
    accountId:           t.accountId,
    accountName:         t.account.name,
    categoryId:          t.categoryId,
    categoryName:        t.category?.name  ?? null,
    categoryColor:       t.category?.color ?? null,
    categoryIcon:        t.category?.icon  ?? null,
    type:                t.type as SerializedTransaction["type"],
    amount:              Number(t.amount),
    currency:            t.currency,
    description:         t.description,
    notes:               t.notes,
    transactionDate:     t.transactionDate.toISOString().split("T")[0],
    tags:                t.tags,
    status:              t.status,
    receiptUrl:          t.receiptUrl,
    isRecurring:         t.isRecurring,
    transferToAccountId: t.transferToAccountId,
    createdAt:           t.createdAt.toISOString(),
    updatedAt:           t.updatedAt.toISOString(),
    rejectionReason:     t.rejectionReason ?? null,
    reimbursedAt:        t.reimbursedAt ? t.reimbursedAt.toISOString() : null,
  }
}

const INCLUDE = {
  account:  { select: { name: true } },
  category: { select: { name: true, color: true, icon: true } },
} as const

// ── createTransaction ─────────────────────────────────────────

export async function createTransaction(
  rawData: Record<string, unknown>
): Promise<ActionResult<SerializedTransaction>> {
  const user = await requireAuth()

  const parsed = createTransactionSchema.safeParse(rawData)
  if (!parsed.success) {
    return {
      success:     false,
      error:       "Please fix the validation errors.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const {
    accountId, categoryId, type, amount, currency,
    description, notes, transactionDate, tags, transferToAccountId,
    receiptUrl, receiptMimeType, submitForApproval,
    aiRawVendor, aiRawAmount, aiRawDate, aiRawCategory,
    aiConfidence, aiExtractionRaw
  } = parsed.data

  // Verify account belongs to this user
  const account = await prisma.account.findFirst({
    where: { id: accountId, userId: user.id, isActive: true },
  })
  if (!account) {
    return { success: false, error: "Account not found or inactive." }
  }

  try {
    const tx = await prisma.transaction.create({
      data: {
        userId:              user.id,
        accountId,
        categoryId:          categoryId  ?? null,
        type,
        amount:              BigInt(amount),
        currency,
        description,
        notes:               notes ?? null,
        transactionDate:     new Date(transactionDate),
        tags,
        transferToAccountId: transferToAccountId ?? null,
        status:              submitForApproval ? "PENDING" : "APPROVED",
        submittedAt:         submitForApproval ? new Date() : null,
        receiptUrl:          receiptUrl ?? null,
        receiptMimeType:     receiptMimeType ?? null,
        aiRawVendor:         aiRawVendor ?? null,
        aiRawAmount:         aiRawAmount ? BigInt(aiRawAmount) : null,
        aiRawDate:           aiRawDate ? new Date(aiRawDate) : null,
        aiRawCategory:       aiRawCategory ?? null,
        aiConfidence:        aiConfidence ?? null,
        aiExtractionRaw:     aiExtractionRaw ?? null,
      },
      include: INCLUDE,
    })

    audit(user.id, "transaction.created", tx.id, "transaction", undefined, { amount, type, description })

    revalidatePath("/transactions")
    revalidatePath("/dashboard")
    revalidatePath("/approvals")

    return { success: true, data: serialize(tx) }
  } catch (error) {
    console.error("[createTransaction] error:", error)
    return { success: false, error: "Failed to create transaction. Please try again." }
  }
}

// ── updateTransaction ─────────────────────────────────────────

export async function updateTransaction(
  id:      string,
  rawData: Record<string, unknown>
): Promise<ActionResult<SerializedTransaction>> {
  const user = await requireAuth()

  // Ownership
  const existing = await prisma.transaction.findFirst({
    where: { id, userId: user.id, isDeleted: false },
  })
  if (!existing) return { success: false, error: "Transaction not found." }

  // Cannot edit approved/reimbursed
  if (["APPROVED", "REIMBURSED"].includes(existing.status) &&
      user.role !== "MANAGER" && user.role !== "FINANCE") {
    return { success: false, error: "Approved transactions cannot be edited." }
  }

  const parsed = updateTransactionSchema.safeParse(rawData)
  if (!parsed.success) {
    return {
      success:     false,
      error:       "Please fix the validation errors.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const { amount, transactionDate, categoryId, transferToAccountId, submitForApproval, ...rest } = parsed.data

  try {
    const tx = await prisma.transaction.update({
      where: { id },
      data: {
        ...rest,
        ...(amount          !== undefined ? { amount: BigInt(amount) }           : {}),
        ...(transactionDate !== undefined ? { transactionDate: new Date(transactionDate) } : {}),
        ...(categoryId      !== undefined ? { categoryId }                         : {}),
        ...(transferToAccountId !== undefined ? { transferToAccountId }            : {}),
        ...(submitForApproval ? { status: "PENDING", submittedAt: new Date() } : {}),
      },
      include: INCLUDE,
    })

    audit(user.id, "transaction.updated", id, "transaction",
          { amount: Number(existing.amount), description: existing.description },
          { amount, description: rest.description })

    revalidatePath("/transactions")
    revalidatePath("/dashboard")
    revalidatePath("/approvals")

    return { success: true, data: serialize(tx) }
  } catch (error) {
    console.error("[updateTransaction] error:", error)
    return { success: false, error: "Failed to update transaction. Please try again." }
  }
}

// ── deleteTransaction (soft) ──────────────────────────────────

export async function deleteTransaction(
  id: string
): Promise<ActionResult> {
  const user = await requireAuth()

  const existing = await prisma.transaction.findFirst({
    where: { id, userId: user.id, isDeleted: false },
  })
  if (!existing) return { success: false, error: "Transaction not found." }

  if (["APPROVED", "REIMBURSED"].includes(existing.status) &&
      user.role !== "MANAGER" && user.role !== "FINANCE") {
    return { success: false, error: "Approved transactions cannot be deleted." }
  }

  try {
    await prisma.transaction.update({
      where: { id },
      data:  { isDeleted: true, deletedAt: new Date() },
    })

    audit(user.id, "transaction.deleted", id, "transaction",
          { description: existing.description, amount: Number(existing.amount) })

    revalidatePath("/transactions")
    revalidatePath("/dashboard")

    return { success: true }
  } catch {
    return { success: false, error: "Failed to delete transaction." }
  }
}

// ── bulkDeleteTransactions ────────────────────────────────────

export async function bulkDeleteTransactions(
  ids: string[]
): Promise<ActionResult<{ deletedCount: number }>> {
  if (!ids.length) return { success: false, error: "No transactions selected." }
  if (ids.length > 100) return { success: false, error: "Select at most 100 at a time." }

  const user = await requireAuth()

  const { count } = await prisma.transaction.updateMany({
    where: {
      id:        { in: ids },
      userId:    user.id,
      isDeleted: false,
      status:    { notIn: ["REIMBURSED"] },
    },
    data: { isDeleted: true, deletedAt: new Date() },
  })

  audit(user.id, "transaction.bulk_deleted", "bulk", "transaction",
        undefined, { ids, count })

  revalidatePath("/transactions")
  revalidatePath("/dashboard")

  return { success: true, data: { deletedCount: count } }
}

// ── parseReceiptWithAI ────────────────────────────────────────

const RECEIPT_SYSTEM_PROMPT = `
You are an expert receipt parsing AI. Your job is to extract financial transaction information from the provided receipt image.
You must return your response as a valid JSON object ONLY. Do not wrap the JSON in markdown code blocks or add any other text.
The JSON must follow this exact schema:
{
  "vendor": string | null,      // Name of the store, merchant, or service provider
  "amount": number | null,      // Total amount in rupees (floating number, e.g. 1250.50)
  "date": string | null,        // Date of transaction in YYYY-MM-DD format
  "category": string | null     // Choose the category name that best matches this receipt from: "Food & Dining", "Shopping", "Housing & Rent", "Transportation", "Utilities", "Uncategorized"
  "confidence": number          // Overall confidence score from 0.0 to 1.0
}
`

export async function parseReceiptWithAI(
  base64Data: string,
  mimeType: string
): Promise<ActionResult<{
  vendor: string | null
  amount: number | null
  date: string | null
  categoryId: string | null
  confidence: number
}>> {
  try {
    const user = await requireAuth()

    if (!base64Data) {
      return { success: false, error: "No receipt file provided." }
    }

    // Call Gemini Model
    const response = await genAI.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType,
              },
            },
            {
              text: "Extract vendor, amount, date, category and confidence from this receipt.",
            },
          ],
        },
      ],
      config: {
        systemInstruction: RECEIPT_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    })

    const text = response.text ?? ""
    if (!text) {
      return { success: false, error: "AI returned empty response." }
    }

    const cleaned = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/, "")
      .trim()

    const data = JSON.parse(cleaned)

    // Lookup matched category ID
    const categories = await prisma.category.findMany({
      where: {
        OR: [{ userId: user.id }, { userId: null }]
      }
    })

    const matchedCategory = categories.find(
      (c) => c.name.toLowerCase() === data.category?.toLowerCase()
    ) || categories.find((c) => c.name === "Uncategorized") || categories[0]

    return {
      success: true,
      data: {
        vendor: data.vendor ?? null,
        amount: data.amount ?? null,
        date: data.date ?? null,
        categoryId: matchedCategory?.id ?? null,
        confidence: data.confidence ?? 0.5,
      },
    }
  } catch (error) {
    console.error("[parseReceiptWithAI] error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to parse receipt with AI.",
    }
  }
}

// ── approveTransaction ────────────────────────────────────────

export async function approveTransaction(id: string): Promise<ActionResult> {
  try {
    const user = await requireAuth()

    if (user.role !== "MANAGER") {
      return { success: false, error: "Forbidden: Only managers can approve expenses." }
    }

    const existing = await prisma.transaction.findFirst({
      where: { id, isDeleted: false, status: "PENDING" }
    })
    if (!existing) {
      return { success: false, error: "Transaction not found or not pending." }
    }

    await prisma.transaction.update({
      where: { id },
      data: {
        status: "APPROVED",
        rejectionReason: null
      }
    })

    audit(user.id, "transaction.approved", id, "transaction")

    revalidatePath("/transactions")
    revalidatePath("/approvals")
    revalidatePath("/finance")

    return { success: true }
  } catch (error) {
    console.error("[approveTransaction] error:", error)
    return { success: false, error: "Failed to approve transaction." }
  }
}

// ── rejectTransaction ─────────────────────────────────────────

export async function rejectTransaction(id: string, reason: string): Promise<ActionResult> {
  try {
    const user = await requireAuth()

    if (user.role !== "MANAGER") {
      return { success: false, error: "Forbidden: Only managers can reject expenses." }
    }

    if (!reason || reason.trim().length < 10) {
      return { success: false, error: "A rejection reason of at least 10 characters is required." }
    }

    const existing = await prisma.transaction.findFirst({
      where: { id, isDeleted: false, status: "PENDING" }
    })
    if (!existing) {
      return { success: false, error: "Transaction not found or not pending." }
    }

    await prisma.transaction.update({
      where: { id },
      data: {
        status: "REJECTED",
        rejectionReason: reason
      }
    })

    audit(user.id, "transaction.rejected", id, "transaction", undefined, { reason })

    revalidatePath("/transactions")
    revalidatePath("/approvals")

    return { success: true }
  } catch (error) {
    console.error("[rejectTransaction] error:", error)
    return { success: false, error: "Failed to reject transaction." }
  }
}

// ── reimburseTransactions ─────────────────────────────────────

export async function reimburseTransactions(ids: string[]): Promise<ActionResult> {
  try {
    const user = await requireAuth()

    if (user.role !== "FINANCE") {
      return { success: false, error: "Forbidden: Only finance users can mark reimbursements." }
    }

    if (!ids.length) {
      return { success: false, error: "No transactions selected." }
    }

    await prisma.transaction.updateMany({
      where: {
        id: { in: ids },
        status: "APPROVED",
        isDeleted: false
      },
      data: {
        status: "REIMBURSED",
        reimbursedAt: new Date()
      }
    })

    audit(user.id, "transaction.bulk_reimbursed", "bulk", "transaction", undefined, { ids })

    revalidatePath("/transactions")
    revalidatePath("/finance")

    return { success: true }
  } catch (error) {
    console.error("[reimburseTransactions] error:", error)
    return { success: false, error: "Failed to process reimbursements." }
  }
}