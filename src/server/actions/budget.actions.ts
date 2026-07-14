/**
 * Budget Server Actions
 * Path: src/server/actions/budget.actions.ts
 */

"use server"

import { revalidatePath } from "next/cache"
import { prisma }         from "@/lib/db"
import { requireAuth }    from "@/lib/session"
import { createBudgetSchema, updateBudgetSchema } from "@/lib/validators/budget.schema"
import type { ActionResult } from "./transaction.actions"
import type { SerializedBudget } from "@/lib/queries/budget.queries"

function serialize(b: any, spentAmount = 0): SerializedBudget {
  return {
    id:             b.id,
    userId:         b.userId,
    categoryId:     b.categoryId,
    categoryName:   b.category.name,
    categoryColor:  b.category.color,
    categoryIcon:   b.category.icon,
    name:           b.name,
    limitAmount:    Number(b.limitAmount),
    period:         b.period,
    periodStart:    b.periodStart.toISOString().split("T")[0],
    periodEnd:      b.periodEnd.toISOString().split("T")[0],
    rollover:       b.rollover,
    alertAtPercent: b.alertAtPercent,
    isActive:       b.isActive,
    createdAt:      b.createdAt.toISOString(),
    spentAmount,
  }
}

// ── createBudget ──────────────────────────────────────────────

export async function createBudget(
  rawData: Record<string, unknown>
): Promise<ActionResult<SerializedBudget>> {
  const user = await requireAuth()

  const parsed = createBudgetSchema.safeParse(rawData)
  if (!parsed.success) {
    return {
      success:     false,
      error:       "Please fix the validation errors.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const { categoryId, name, limitAmount, period, periodStart, periodEnd, rollover, alertAtPercent } = parsed.data

  const start = new Date(periodStart)
  const end   = new Date(periodEnd)

  // Verify category belongs to this user (or is system default)
  const category = await prisma.category.findFirst({
    where: {
      id: categoryId,
      OR: [{ userId: user.id }, { userId: null }],
    },
  })
  if (!category) {
    return { success: false, error: "Selected category was not found." }
  }

  // Ensure no active budget exists for same category on this start date
  const duplicate = await prisma.budget.findFirst({
    where: {
      userId:      user.id,
      categoryId,
      periodStart: start,
      isActive:    true,
    },
  })
  if (duplicate) {
    return {
      success: false,
      error:   "An active budget already exists for this category starting on this date.",
      fieldErrors: { categoryId: ["Category has an active budget starting on this date."] },
    }
  }

  try {
    const budget = await prisma.budget.create({
      data: {
        userId:         user.id,
        categoryId,
        name:           name || null,
        limitAmount:    BigInt(limitAmount),
        period,
        periodStart:    start,
        periodEnd:      end,
        rollover,
        alertAtPercent,
        isActive:       true,
      },
      include: { category: true },
    })

    revalidatePath("/budgets")
    revalidatePath("/insights")

    return { success: true, data: serialize(budget) }
  } catch {
    return { success: false, error: "Failed to create budget. Please try again." }
  }
}

// ── updateBudget ──────────────────────────────────────────────

export async function updateBudget(
  id:      string,
  rawData: Record<string, unknown>
): Promise<ActionResult<SerializedBudget>> {
  const user = await requireAuth()

  const existing = await prisma.budget.findFirst({
    where:   { id, userId: user.id },
    include: { category: true },
  })
  if (!existing) {
    return { success: false, error: "Budget not found or you do not have permission to edit it." }
  }

  const parsed = updateBudgetSchema.safeParse(rawData)
  if (!parsed.success) {
    return {
      success:     false,
      error:       "Please fix the validation errors.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const { name, limitAmount, period, periodStart, periodEnd, rollover, alertAtPercent } = parsed.data

  try {
    const budget = await prisma.budget.update({
      where: { id },
      data: {
        ...(name         !== undefined ? { name: name || null } : {}),
        ...(limitAmount  !== undefined ? { limitAmount: BigInt(limitAmount) } : {}),
        ...(period       !== undefined ? { period } : {}),
        ...(periodStart  !== undefined ? { periodStart: new Date(periodStart) } : {}),
        ...(periodEnd    !== undefined ? { periodEnd: new Date(periodEnd) } : {}),
        ...(rollover     !== undefined ? { rollover } : {}),
        ...(alertAtPercent !== undefined ? { alertAtPercent } : {}),
      },
      include: { category: true },
    })

    // Re-fetch spent amount for serialized return
    const spent = await prisma.transaction.aggregate({
      _sum:  { amount: true },
      where: {
        userId:         user.id,
        categoryId:     budget.categoryId,
        type:           "EXPENSE",
        isDeleted:      false,
        transactionDate: { gte: budget.periodStart, lte: budget.periodEnd },
      },
    })

    revalidatePath("/budgets")
    revalidatePath("/insights")

    return { success: true, data: serialize(budget, Number(spent._sum.amount ?? 0)) }
  } catch {
    return { success: false, error: "Failed to update budget." }
  }
}

// ── deleteBudget ──────────────────────────────────────────────

export async function deleteBudget(id: string): Promise<ActionResult> {
  const user = await requireAuth()

  const existing = await prisma.budget.findFirst({
    where: { id, userId: user.id },
  })
  if (!existing) {
    return { success: false, error: "Budget not found or you do not have permission to delete it." }
  }

  try {
    // Hard delete is fine for budgets, no cascading issues
    await prisma.budget.delete({ where: { id } })

    revalidatePath("/budgets")
    revalidatePath("/insights")

    return { success: true }
  } catch {
    return { success: false, error: "Failed to delete budget." }
  }
}