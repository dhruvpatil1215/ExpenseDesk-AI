/**
 * CSV Builder Utility
 * Path: src/lib/export/csv.ts
 *
 * Zero external dependencies — no "csv" or "papaparse" package.
 * Implements RFC 4180 compliant CSV generation.
 *
 * Large dataset strategy:
 *   Uses Prisma cursor-based pagination (batches of BATCH_SIZE rows).
 *   Each batch is yielded as a Uint8Array chunk so the caller can
 *   pipe directly into a ReadableStream without ever holding all
 *   rows in memory simultaneously.
 *
 *   Example: 100,000 transactions → ~200 batches of 500 → peak RAM ≈ 1 batch
 */

import { prisma }       from "@/lib/db"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import type { TransactionFilters } from "@/lib/validators/transaction.schema"

const BATCH_SIZE = 500

// ── Escaping ──────────────────────────────────────────────────

/**
 * Escapes a value for safe embedding inside a CSV field.
 * Rules (RFC 4180):
 *   - Wrap in double-quotes if value contains comma, quote, or newline
 *   - Escape internal double-quotes by doubling them (" → "")
 */
function escapeField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ""
  const str = String(value)
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function row(...fields: (string | number | null | undefined)[]): string {
  return fields.map(escapeField).join(",") + "\r\n"
}

// ── Column definitions ────────────────────────────────────────

const TRANSACTION_HEADERS = [
  "Date",
  "Description",
  "Type",
  "Category",
  "Account",
  "Amount (INR)",
  "Amount (Paise)",
  "Currency",
  "Status",
  "Tags",
  "Notes",
  "Transaction ID",
] as const

// ── Transaction row serialiser ─────────────────────────────────

type TxnWithRelations = {
  id:              string
  transactionDate: Date
  description:     string
  type:            string
  amount:          bigint
  currency:        string
  status:          string
  notes:           string | null
  tags:            string[]
  account:         { name: string }
  category:        { name: string } | null
}

function txnToRow(t: TxnWithRelations): string {
  const paise   = Number(t.amount)
  const rupees  = (paise / 100).toFixed(2)

  return row(
    formatDate(t.transactionDate.toISOString()),
    t.description,
    t.type,
    t.category?.name ?? "",
    t.account.name,
    rupees,
    paise,
    t.currency,
    t.status,
    t.tags.join("; "),
    t.notes ?? "",
    t.id,
  )
}

// ── Streaming generator ───────────────────────────────────────

/**
 * Async generator that yields Uint8Array CSV chunks.
 * First chunk: UTF-8 BOM + header row.
 * Subsequent chunks: one batch of BATCH_SIZE data rows each.
 *
 * Usage in an API route:
 *   const encoder = new TextEncoder()
 *   const stream = new ReadableStream({
 *     async start(controller) {
 *       for await (const chunk of generateTransactionsCsv(userId, filters)) {
 *         controller.enqueue(chunk)
 *       }
 *       controller.close()
 *     }
 *   })
 */
export async function* generateTransactionsCsvStream(
  userId:  string,
  filters: Partial<TransactionFilters>
): AsyncGenerator<Uint8Array> {
  const encoder = new TextEncoder()

  // 1. Emit BOM + headers
  yield encoder.encode("\uFEFF" + row(...TRANSACTION_HEADERS))

  // 2. Build WHERE clause from filters
  const where = {
    userId,
    isDeleted: false,
    ...(filters.type       ? { type: filters.type }            : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId }: {}),
    ...(filters.accountId  ? { accountId:  filters.accountId } : {}),
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

  // 3. Cursor-paginate through all matching rows
  let cursor: string | undefined
  let fetched = 0

  while (true) {
    const batch: TxnWithRelations[] = await prisma.transaction.findMany({
      where,
      take:     BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy:  { transactionDate: "desc" },
      include:  {
        account:  { select: { name: true } },
        category: { select: { name: true } },
      },
    })

    if (batch.length === 0) break

    // Build one string for the whole batch then encode once
    let batchCsv = ""
    for (const t of batch) batchCsv += txnToRow(t)
    yield encoder.encode(batchCsv)

    fetched += batch.length
    cursor   = batch[batch.length - 1].id

    if (batch.length < BATCH_SIZE) break   // last page
  }
}

// ── Monthly summary CSV ────────────────────────────────────────

type MonthSummaryRow = {
  month:         string
  category:      string
  type:          string
  totalPaise:    number
  transactionCount: number
}

export async function generateMonthlySummaryCsvBuffer(
  userId: string,
  year:   number
): Promise<Uint8Array> {
  const from = new Date(`${year}-01-01`)
  const to   = new Date(`${year}-12-31T23:59:59`)

  // Raw aggregation via Prisma groupBy
  const rows = await prisma.transaction.groupBy({
    by:    ["type", "categoryId"],
    where: { userId, isDeleted: false, transactionDate: { gte: from, lte: to } },
    _sum:  { amount: true },
    _count:{ id: true },
  })

  // Fetch category names separately
  const catIds = [...new Set(rows.map((r: any) => r.categoryId).filter(Boolean))] as string[]
  const cats   = await prisma.category.findMany({ where: { id: { in: catIds } }, select: { id: true, name: true } })
  const catMap = new Map<string, string>(cats.map((c: any) => [c.id, c.name]))

  const HEADERS = ["Type", "Category", "Total (INR)", "Transaction Count"]
  const encoder  = new TextEncoder()
  let csv = "\uFEFF" + row(...HEADERS)

  for (const r of rows) {
    const paise = Number(r._sum.amount ?? 0)
    csv += row(
      r.type,
      catMap.get(r.categoryId ?? "") ?? "Uncategorized",
      (paise / 100).toFixed(2),
      r._count.id,
    )
  }

  return encoder.encode(csv)
}

// ── Budget report CSV ──────────────────────────────────────────

export async function generateBudgetReportCsvBuffer(userId: string): Promise<Uint8Array> {
  const now     = new Date()
  const budgets = await prisma.budget.findMany({
    where:   { userId, isActive: true },
    include: { category: true },
  })

  const HEADERS = [
    "Budget Name", "Category", "Period Start", "Period End",
    "Limit (INR)", "Spent (INR)", "Remaining (INR)", "Utilisation %", "Status",
  ]
  const encoder = new TextEncoder()
  let csv = "\uFEFF" + row(...HEADERS)

  for (const b of budgets) {
    const spent = await prisma.transaction.aggregate({
      _sum:  { amount: true },
      where: {
        userId, categoryId: b.categoryId, type: "EXPENSE", isDeleted: false,
        transactionDate: { gte: b.periodStart, lte: b.periodEnd },
      },
    })

    const limitPaise = Number(b.limitAmount)
    const spentPaise = Number(spent._sum.amount ?? 0)
    const remPaise   = limitPaise - spentPaise
    const pct        = limitPaise > 0 ? Math.round((spentPaise / limitPaise) * 100) : 0
    const status     = pct > 100 ? "Over Budget" : pct >= 80 ? "At Risk" : "On Track"

    csv += row(
      b.name ?? b.category.name,
      b.category.name,
      b.periodStart.toISOString().split("T")[0],
      b.periodEnd.toISOString().split("T")[0],
      (limitPaise / 100).toFixed(2),
      (spentPaise / 100).toFixed(2),
      (remPaise   / 100).toFixed(2),
      pct + "%",
      status,
    )
  }

  return encoder.encode(csv)
}