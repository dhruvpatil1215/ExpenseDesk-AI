/**
 * Budget DB Queries
 * Path: src/lib/queries/budget.queries.ts
 */

import { prisma } from "@/lib/db"

export interface SerializedBudget {
  id:             string
  userId:         string
  categoryId:     string
  categoryName:   string
  categoryColor:  string | null
  categoryIcon:   string | null
  name:           string | null
  limitAmount:    number  // paise
  period:         "WEEKLY" | "MONTHLY" | "YEARLY" | "CUSTOM"
  periodStart:    string  // YYYY-MM-DD
  periodEnd:      string  // YYYY-MM-DD
  rollover:       boolean
  alertAtPercent: number
  isActive:       boolean
  createdAt:      string
  spentAmount:    number  // computed in query (paise)
}

export async function getBudgets(userId: string): Promise<SerializedBudget[]> {
  const budgets = await prisma.budget.findMany({
    where:   { userId, isActive: true },
    include: { category: true },
    orderBy: { periodEnd: "asc" },
  })

  const results: SerializedBudget[] = []

  for (const b of budgets) {
    // Aggregate all EXPENSE type transactions under this category within the budget period
    const spent = await prisma.transaction.aggregate({
      _sum: { amount: true },
      where: {
        userId,
        categoryId:      b.categoryId,
        type:            "EXPENSE",
        isDeleted:       false,
        transactionDate: { gte: b.periodStart, lte: b.periodEnd },
      },
    })

    results.push({
      id:             b.id,
      userId:         b.userId,
      categoryId:     b.categoryId,
      categoryName:   b.category.name,
      categoryColor:  b.category.color,
      categoryIcon:   b.category.icon,
      name:           b.name,
      limitAmount:    Number(b.limitAmount),
      period:         b.period as any,
      periodStart:    b.periodStart.toISOString().split("T")[0],
      periodEnd:      b.periodEnd.toISOString().split("T")[0],
      rollover:       b.rollover,
      alertAtPercent: b.alertAtPercent,
      isActive:       b.isActive,
      createdAt:      b.createdAt.toISOString(),
      spentAmount:    Number(spent._sum.amount ?? 0),
    })
  }

  return results;
}