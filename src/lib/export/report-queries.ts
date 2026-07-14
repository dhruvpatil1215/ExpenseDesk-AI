/**
 * Report Data Queries
 * Path: src/lib/export/report-queries.ts
 *
 * Returns serialisable plain objects (number paise, ISO strings).
 * These are the data shapes the client-side PDF generator consumes
 * after fetching from /api/export/report.
 *
 * All monetary values are in PAISE (integers).
 */

import { prisma } from "@/lib/db"

// ── Monthly Summary ───────────────────────────────────────────

export interface MonthlySummaryCategory {
  name:        string
  icon:        string | null
  type:        "INCOME" | "EXPENSE"
  totalPaise:  number
  count:       number
}

export interface MonthlyBreakdown {
  month:          string   // "YYYY-MM"
  label:          string   // "July 2026"
  incomePaise:    number
  expensePaise:   number
  netPaise:       number
  categories:     MonthlySummaryCategory[]
}

export interface MonthlySummaryReport {
  userId:     string
  userName:   string
  year:       number
  months:     MonthlyBreakdown[]
  totals: {
    incomePaise:  number
    expensePaise: number
    netPaise:     number
  }
  generatedAt: string
}

export async function getMonthlySummaryReport(
  userId: string,
  year:   number
): Promise<MonthlySummaryReport> {
  const from = new Date(`${year}-01-01T00:00:00.000Z`)
  const to   = new Date(`${year}-12-31T23:59:59.999Z`)

  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { name: true, email: true },
  })

  const transactions = await prisma.transaction.findMany({
    where:   { userId, isDeleted: false, transactionDate: { gte: from, lte: to } },
    include: { category: { select: { name: true, icon: true } } },
    orderBy: { transactionDate: "asc" },
  })

  // Group by month → by category
  const monthMap = new Map<string, {
    income: number; expense: number
    cats: Map<string, MonthlySummaryCategory>
  }>()

  for (const t of transactions) {
    if (t.type === "TRANSFER") continue
    const monthKey = t.transactionDate.toISOString().slice(0, 7)
    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, { income: 0, expense: 0, cats: new Map() })
    }
    const m   = monthMap.get(monthKey)!
    const amt = Number(t.amount)

    if (t.type === "INCOME")  m.income  += amt
    if (t.type === "EXPENSE") m.expense += amt

    const catKey = t.category?.name ?? "Uncategorized"
    const existing = m.cats.get(catKey)
    if (existing) {
      existing.totalPaise += amt
      existing.count++
    } else {
      m.cats.set(catKey, {
        name:       catKey,
        icon:       t.category?.icon ?? null,
        type:       t.type as "INCOME" | "EXPENSE",
        totalPaise: amt,
        count:      1,
      })
    }
  }

  const MONTH_LABELS = ["January","February","March","April","May","June",
                        "July","August","September","October","November","December"]

  const months: MonthlyBreakdown[] = []
  for (let m = 1; m <= 12; m++) {
    const key   = `${year}-${String(m).padStart(2, "0")}`
    const data  = monthMap.get(key)
    const label = `${MONTH_LABELS[m - 1]} ${year}`

    months.push({
      month:         key,
      label,
      incomePaise:   data?.income  ?? 0,
      expensePaise:  data?.expense ?? 0,
      netPaise:      (data?.income ?? 0) - (data?.expense ?? 0),
      categories:    data ? [...data.cats.values()] : [],
    })
  }

  const totals = months.reduce(
    (acc, m) => ({
      incomePaise:  acc.incomePaise  + m.incomePaise,
      expensePaise: acc.expensePaise + m.expensePaise,
      netPaise:     acc.netPaise     + m.netPaise,
    }),
    { incomePaise: 0, expensePaise: 0, netPaise: 0 }
  )

  return {
    userId,
    userName:    user?.name ?? user?.email ?? "User",
    year,
    months,
    totals,
    generatedAt: new Date().toISOString(),
  }
}

// ── Budget Report ─────────────────────────────────────────────

export interface BudgetReportItem {
  name:           string
  categoryName:   string
  periodStart:    string
  periodEnd:      string
  limitPaise:     number
  spentPaise:     number
  remainingPaise: number
  utilisationPct: number
  status:         "On Track" | "At Risk" | "Over Budget"
  daysRemaining:  number
}

export interface BudgetReport {
  userId:     string
  userName:   string
  budgets:    BudgetReportItem[]
  summary: {
    total:      number
    onTrack:    number
    atRisk:     number
    overBudget: number
    totalLimitPaise:  number
    totalSpentPaise:  number
  }
  generatedAt: string
}

export async function getBudgetReport(userId: string): Promise<BudgetReport> {
  const now = new Date()

  const [user, budgets] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
    prisma.budget.findMany({
      where:   { userId, isActive: true },
      include: { category: true },
      orderBy: { periodEnd: "asc" },
    }),
  ])

  const items: BudgetReportItem[] = await Promise.all(
    budgets.map(async (b: any) => {
      const agg = await prisma.transaction.aggregate({
        _sum:  { amount: true },
        where: {
          userId, categoryId: b.categoryId, type: "EXPENSE", isDeleted: false,
          transactionDate: { gte: b.periodStart, lte: b.periodEnd },
        },
      })
      const limit  = Number(b.limitAmount)
      const spent  = Number(agg._sum.amount ?? 0)
      const pct    = limit > 0 ? Math.round((spent / limit) * 100) : 0
      const days   = Math.max(0, Math.ceil((b.periodEnd.getTime() - now.getTime()) / 86400000))
      const status: BudgetReportItem["status"] =
        pct > 100 ? "Over Budget" : pct >= 80 ? "At Risk" : "On Track"

      return {
        name:           b.name ?? b.category.name,
        categoryName:   b.category.name,
        periodStart:    b.periodStart.toISOString().split("T")[0],
        periodEnd:      b.periodEnd.toISOString().split("T")[0],
        limitPaise:     limit,
        spentPaise:     spent,
        remainingPaise: limit - spent,
        utilisationPct: pct,
        status,
        daysRemaining:  days,
      }
    })
  )

  const totalLimit = items.reduce((s, b) => s + b.limitPaise,  0)
  const totalSpent = items.reduce((s, b) => s + b.spentPaise,  0)

  return {
    userId,
    userName:    user?.name ?? user?.email ?? "User",
    budgets:     items,
    summary: {
      total:           items.length,
      onTrack:         items.filter(b => b.status === "On Track").length,
      atRisk:          items.filter(b => b.status === "At Risk").length,
      overBudget:      items.filter(b => b.status === "Over Budget").length,
      totalLimitPaise: totalLimit,
      totalSpentPaise: totalSpent,
    },
    generatedAt: now.toISOString(),
  }
}

// ── Transaction report (last N, for PDF) ─────────────────────

export interface TransactionReportRow {
  date:        string
  description: string
  type:        string
  category:    string
  account:     string
  amountPaise: number
  currency:    string
  status:      string
}

export interface TransactionReport {
  userId:       string
  userName:     string
  filters:      Record<string, string>
  transactions: TransactionReportRow[]
  totalRows:    number
  limitApplied: boolean
  generatedAt:  string
}

const PDF_LIMIT = 500   // cap for PDF; use CSV for full export

export async function getTransactionReport(
  userId:  string,
  filters: Record<string, string>
): Promise<TransactionReport> {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { name: true, email: true },
  })

  const where = {
    userId,
    isDeleted: false,
    ...(filters.type       ? { type: filters.type }              : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId }  : {}),
    ...(filters.accountId  ? { accountId:  filters.accountId }   : {}),
    ...(filters.dateFrom || filters.dateTo ? {
      transactionDate: {
        ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
        ...(filters.dateTo   ? { lte: new Date(filters.dateTo)   } : {}),
      },
    } : {}),
    ...(filters.search ? {
      OR: [
        { description: { contains: filters.search, mode: "insensitive" as const } },
        { notes:       { contains: filters.search, mode: "insensitive" as const } },
      ],
    } : {}),
  }

  const [total, rows] = await Promise.all([
    prisma.transaction.count({ where: where as any }),
    prisma.transaction.findMany({
      where: where as any,
      take:    PDF_LIMIT,
      orderBy: { transactionDate: "desc" },
      include: {
        category: { select: { name: true } },
        account:  { select: { name: true } },
      },
    }),
  ])

  return {
    userId,
    userName:    user?.name ?? user?.email ?? "User",
    filters,
    transactions: rows.map((t: any) => ({
      date:        t.transactionDate.toISOString().split("T")[0],
      description: t.description,
      type:        t.type,
      category:    t.category?.name ?? "—",
      account:     t.account.name,
      amountPaise: Number(t.amount),
      currency:    t.currency,
      status:      t.status,
    })),
    totalRows:    total,
    limitApplied: total > PDF_LIMIT,
    generatedAt:  new Date().toISOString(),
  }
}