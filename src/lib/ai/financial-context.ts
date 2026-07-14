/**
 * Financial Context Builder
 * Path: src/lib/ai/financial-context.ts
 *
 * Builds the structured data object that gets serialised into the
 * Gemini prompt. All amounts are in PAISE (integers — plan A4).
 *
 * Query strategy: a single pass over transactions to compute:
 *   - Income / Expense totals for current and previous period
 *   - Category breakdown with MoM trend
 *   - Budget utilisation (spent vs limit)
 *   - Goal progress snapshots
 *   - Unusual large transactions (> 2× category average)
 *
 * This function is called server-side only.
 */

import { prisma } from "@/lib/db"

// ── Output types (serialisable to JSON for the prompt) ────────

export interface MonthlyTotal {
  month:         string   // "2026-06"
  incomePaise:   number
  expensePaise:  number
}

export interface CategoryBreakdown {
  name:          string
  icon:          string | null
  type:          "INCOME" | "EXPENSE"
  currentPaise:  number   // current period
  previousPaise: number   // previous period (same length)
  transactionCount: number
  percentOfTotal: number  // current period expense %
  trend:         "up" | "down" | "stable"
  trendPct:      number   // absolute percentage change
}

export interface BudgetUtilisation {
  name:           string
  categoryName:   string
  limitPaise:     number
  spentPaise:     number
  utilisationPct: number
  isOverBudget:   boolean
  daysRemaining:  number
}

export interface GoalProgress {
  name:           string
  targetPaise:    number
  currentPaise:   number
  progressPct:    number
  targetDate:     string | null
  daysRemaining:  number | null
}

export interface UnusualTransaction {
  description:    string
  amountPaise:    number
  category:       string | null
  date:           string
  reasonFlag:     string  // e.g. "3.2× above category average"
}

export interface FinancialContext {
  generatedAt:          string
  periodDays:           number
  periodFrom:           string   // ISO date
  periodTo:             string
  currency:             string

  // Totals
  totalIncomePaise:     number
  totalExpensePaise:    number
  netPaise:             number
  savingsRatePct:       number

  // Previous period for trend comparison
  prevTotalIncomePaise:  number
  prevTotalExpensePaise: number

  // Monthly breakdown
  monthlyTotals:        MonthlyTotal[]

  // Category breakdown (top 10 expense, top 5 income)
  expenseCategories:    CategoryBreakdown[]
  incomeCategories:     CategoryBreakdown[]

  // Budget status
  budgets:              BudgetUtilisation[]
  budgetsOverLimit:     number
  budgetsAtRisk:        number   // > 80% utilised

  // Goals
  goals:                GoalProgress[]

  // Unusual transactions
  unusualTransactions:  UnusualTransaction[]

  // Aggregate stats
  avgDailySpendPaise:   number
  transactionCount:     number
  uniqueCategories:     number
}

// ── Main builder function ─────────────────────────────────────

export async function buildFinancialContext(
  userId:     string,
  periodDays: number = 90,
  currency:   string = "INR"
): Promise<FinancialContext> {
  const now    = new Date()
  const from   = new Date(now); from.setDate(now.getDate() - periodDays)
  const prevFrom = new Date(from); prevFrom.setDate(from.getDate() - periodDays)

  // ── 1. Fetch current-period transactions ─────────────────
  const [currentTxns, previousTxns, budgets, goals] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        userId,
        isDeleted: false,
        transactionDate: { gte: from, lte: now },
      },
      include: { category: true },
      orderBy: { transactionDate: "asc" },
    }),
    prisma.transaction.findMany({
      where: {
        userId,
        isDeleted: false,
        transactionDate: { gte: prevFrom, lt: from },
      },
      include: { category: true },
    }),
    prisma.budget.findMany({
      where: {
        userId,
        isActive:    true,
        periodStart: { lte: now },
        periodEnd:   { gte: now },
      },
      include: { category: true },
    }),
    prisma.goal.findMany({
      where: { userId, status: "ACTIVE" },
    }),
  ])

  // ── 2. Aggregate current period ───────────────────────────

  let totalIncome = 0, totalExpense = 0
  const catMapCurrent  = new Map<string, { name: string; icon: string | null; type: string; paise: number; count: number }>()
  const catMapPrevious = new Map<string, number>()

  for (const t of currentTxns) {
    const amt = Number(t.amount)
    if (t.type === "INCOME")  totalIncome  += amt
    if (t.type === "EXPENSE") totalExpense += amt

    if (t.type !== "TRANSFER" && t.category) {
      const key = t.category.id
      const existing = catMapCurrent.get(key)
      if (existing) {
        existing.paise += amt
        existing.count += 1
      } else {
        catMapCurrent.set(key, {
          name: t.category.name,
          icon: t.category.icon,
          type: t.type,
          paise: amt,
          count: 1,
        })
      }
    }
  }

  for (const t of previousTxns) {
    if (t.type !== "TRANSFER" && t.category) {
      const key = t.category.id
      catMapPrevious.set(key, (catMapPrevious.get(key) ?? 0) + Number(t.amount))
    }
  }

  // ── 3. Previous period totals ─────────────────────────────

  let prevTotalIncome = 0, prevTotalExpense = 0
  for (const t of previousTxns) {
    const amt = Number(t.amount)
    if (t.type === "INCOME")  prevTotalIncome  += amt
    if (t.type === "EXPENSE") prevTotalExpense += amt
  }

  // ── 4. Category breakdown ─────────────────────────────────

  const allCats: CategoryBreakdown[] = []
  for (const [id, cur] of catMapCurrent.entries()) {
    const prev        = catMapPrevious.get(id) ?? 0
    const trendPct    = prev === 0
      ? 100
      : Math.round(((cur.paise - prev) / prev) * 100)
    const trend       = Math.abs(trendPct) < 5 ? "stable" : trendPct > 0 ? "up" : "down"
    const percentOf   = cur.type === "EXPENSE" && totalExpense > 0
      ? Math.round((cur.paise / totalExpense) * 100)
      : 0

    allCats.push({
      name:             cur.name,
      icon:             cur.icon,
      type:             cur.type as "INCOME" | "EXPENSE",
      currentPaise:     cur.paise,
      previousPaise:    prev,
      transactionCount: cur.count,
      percentOfTotal:   percentOf,
      trend,
      trendPct:         Math.abs(trendPct),
    })
  }

  const expenseCats = allCats
    .filter((c) => c.type === "EXPENSE")
    .sort((a, b) => b.currentPaise - a.currentPaise)
    .slice(0, 10)

  const incomeCats = allCats
    .filter((c) => c.type === "INCOME")
    .sort((a, b) => b.currentPaise - a.currentPaise)
    .slice(0, 5)

  // ── 5. Monthly totals ──────────────────────────────────────

  const monthMap = new Map<string, MonthlyTotal>()
  for (const t of currentTxns) {
    const key = t.transactionDate.toISOString().slice(0, 7)
    const m   = monthMap.get(key) ?? { month: key, incomePaise: 0, expensePaise: 0 }
    if (t.type === "INCOME")  m.incomePaise  += Number(t.amount)
    if (t.type === "EXPENSE") m.expensePaise += Number(t.amount)
    monthMap.set(key, m)
  }
  const monthlyTotals = [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month))

  // ── 6. Budget utilisation ─────────────────────────────────

  // Get spend per category within each budget period
  const budgetData: BudgetUtilisation[] = await Promise.all(
    budgets.map(async (b: any) => {
      const spent = await prisma.transaction.aggregate({
        _sum:  { amount: true },
        where: {
          userId,
          categoryId:      b.categoryId,
          type:            "EXPENSE",
          isDeleted:       false,
          transactionDate: { gte: b.periodStart, lte: b.periodEnd },
        },
      })

      const spentPaise  = Number(spent._sum.amount ?? 0)
      const limitPaise  = Number(b.limitAmount)
      const utilisPct   = limitPaise > 0 ? Math.round((spentPaise / limitPaise) * 100) : 0
      const today       = new Date()
      const daysRem     = Math.max(0, Math.ceil((b.periodEnd.getTime() - today.getTime()) / 86400000))

      return {
        name:           b.name ?? b.category.name,
        categoryName:   b.category.name,
        limitPaise,
        spentPaise,
        utilisationPct: utilisPct,
        isOverBudget:   utilisPct > 100,
        daysRemaining:  daysRem,
      }
    })
  )

  // ── 7. Goal progress ──────────────────────────────────────

  const goalData: GoalProgress[] = goals.map((g: any) => {
    const target  = Number(g.targetAmount)
    const current = Number(g.currentAmount)
    const pct     = target > 0 ? Math.round((current / target) * 100) : 0
    let daysRem: number | null = null
    if (g.targetDate) {
      daysRem = Math.ceil((g.targetDate.getTime() - now.getTime()) / 86400000)
    }
    return {
      name:          g.name,
      targetPaise:   target,
      currentPaise:  current,
      progressPct:   pct,
      targetDate:    g.targetDate ? g.targetDate.toISOString().split("T")[0] : null,
      daysRemaining: daysRem,
    }
  })

  // ── 8. Unusual transactions ───────────────────────────────

  const unusual: UnusualTransaction[] = []
  for (const cat of expenseCats) {
    const avg = cat.transactionCount > 0 ? cat.currentPaise / cat.transactionCount : 0
    const catTxns = currentTxns.filter(
      (t: any) => t.type === "EXPENSE" && t.category?.name === cat.name
    )
    for (const t of catTxns) {
      const amt = Number(t.amount)
      if (avg > 0 && amt > avg * 2.5) {
        unusual.push({
          description: t.description,
          amountPaise: amt,
          category:    cat.name,
          date:        t.transactionDate.toISOString().split("T")[0],
          reasonFlag:  `${(amt / avg).toFixed(1)}× above your ${cat.name} average`,
        })
      }
    }
  }

  // ── 9. Assemble ───────────────────────────────────────────

  const netPaise      = totalIncome - totalExpense
  const savingsRate   = totalIncome > 0 ? Math.round((netPaise / totalIncome) * 100) : 0
  const avgDaily      = periodDays > 0 ? Math.round(totalExpense / periodDays) : 0

  return {
    generatedAt:           now.toISOString(),
    periodDays,
    periodFrom:            from.toISOString().split("T")[0],
    periodTo:              now.toISOString().split("T")[0],
    currency,
    totalIncomePaise:      totalIncome,
    totalExpensePaise:     totalExpense,
    netPaise,
    savingsRatePct:        savingsRate,
    prevTotalIncomePaise:  prevTotalIncome,
    prevTotalExpensePaise: prevTotalExpense,
    monthlyTotals,
    expenseCategories:     expenseCats,
    incomeCategories:      incomeCats,
    budgets:               budgetData,
    budgetsOverLimit:      budgetData.filter((b) => b.isOverBudget).length,
    budgetsAtRisk:         budgetData.filter((b) => b.utilisationPct >= 80 && !b.isOverBudget).length,
    goals:                 goalData,
    unusualTransactions:   unusual.slice(0, 5),
    avgDailySpendPaise:    avgDaily,
    transactionCount:      currentTxns.filter((t: any) => t.type !== "TRANSFER").length,
    uniqueCategories:      catMapCurrent.size,
  }
}