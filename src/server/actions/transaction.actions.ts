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
        status:              "APPROVED",          // personal finance bypass
      },
      include: INCLUDE,
    })

    audit(user.id, "transaction.created", tx.id, "transaction", undefined, { amount, type, description })

    revalidatePath("/transactions")
    revalidatePath("/dashboard")

    return { success: true, data: serialize(tx) }
  } catch {
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

  const { amount, transactionDate, categoryId, transferToAccountId, ...rest } = parsed.data

  try {
    const tx = await prisma.transaction.update({
      where: { id },
      data: {
        ...rest,
        ...(amount          !== undefined ? { amount: BigInt(amount) }           : {}),
        ...(transactionDate !== undefined ? { transactionDate: new Date(transactionDate) } : {}),
        ...(categoryId      !== undefined ? { categoryId }                         : {}),
        ...(transferToAccountId !== undefined ? { transferToAccountId }            : {}),
      },
      include: INCLUDE,
    })

    audit(user.id, "transaction.updated", id, "transaction",
          { amount: Number(existing.amount), description: existing.description },
          { amount, description: rest.description })

    revalidatePath("/transactions")
    revalidatePath("/dashboard")

    return { success: true, data: serialize(tx) }
  } catch {
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