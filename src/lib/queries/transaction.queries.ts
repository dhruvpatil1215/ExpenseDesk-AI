/**
 * Transaction DB Queries
 * Path: src/lib/queries/transaction.queries.ts
 *
 * These are plain async functions (NOT server actions).
 * Import them only inside Server Components or server actions.
 *
 * BigInt → number serialisation:
 *   Prisma returns amount/aiRawAmount as BigInt.
 *   We convert to Number before returning so the data can cross
 *   the Server→Client boundary as JSON.
 *   Amounts are kept in PAISE — formatCurrency() divides by 100.
 */

import { prisma } from "@/lib/db"
import { transactionFilterSchema, type TransactionFilters } from "@/lib/validators/transaction.schema"
import { ensureDefaultCategoriesAndAccounts } from "@/lib/db-seed"

// ── Serialised shape (client-safe) ───────────────────────────

export interface SerializedTransaction {
  id:            string
  userId:        string
  accountId:     string
  accountName:   string
  categoryId:    string | null
  categoryName:  string | null
  categoryColor: string | null
  categoryIcon:  string | null
  type:          "INCOME" | "EXPENSE" | "TRANSFER"
  amount:        number          // PAISE — use formatCurrency() for display
  currency:      string
  description:   string
  notes:         string | null
  transactionDate: string        // "YYYY-MM-DD"
  tags:          string[]
  status:        string
  receiptUrl:    string | null
  isRecurring:   boolean
  transferToAccountId: string | null
  createdAt:     string          // ISO string
  updatedAt:     string
}

export interface PaginatedTransactions {
  transactions: SerializedTransaction[]
  total:        number
  page:         number
  pageSize:     number
  totalPages:   number
}

// ── Main query ────────────────────────────────────────────────

export async function getTransactions(
  userId:  string,
  rawFilters: Partial<TransactionFilters>
): Promise<PaginatedTransactions> {
  await ensureDefaultCategoriesAndAccounts(userId)
  const filters = transactionFilterSchema.parse(rawFilters)
  const { page, pageSize, search, type, categoryId, accountId,
          dateFrom, dateTo, sortBy, sortOrder } = filters

  const skip = (page - 1) * pageSize

  const where = {
    userId,
    isDeleted: false,
    ...(type        ? { type }        : {}),
    ...(categoryId  ? { categoryId }  : {}),
    ...(accountId   ? { accountId }   : {}),
    ...(dateFrom || dateTo ? {
      transactionDate: {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo   ? { lte: new Date(dateTo)   } : {}),
      },
    } : {}),
    ...(search ? {
      OR: [
        { description: { contains: search, mode: "insensitive" as const } },
        { notes:       { contains: search, mode: "insensitive" as const } },
      ],
    } : {}),
  }

  const [rows, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { [sortBy]: sortOrder },
      include: {
        account:  { select: { name: true } },
        category: { select: { name: true, color: true, icon: true } },
      },
    }),
    prisma.transaction.count({ where }),
  ])

  const transactions: SerializedTransaction[] = rows.map((t: any) => ({
    id:                  t.id,
    userId:              t.userId,
    accountId:           t.accountId,
    accountName:         t.account.name,
    categoryId:          t.categoryId,
    categoryName:        t.category?.name  ?? null,
    categoryColor:       t.category?.color ?? null,
    categoryIcon:        t.category?.icon  ?? null,
    type:                t.type as SerializedTransaction["type"],
    amount:              Number(t.amount),   // BigInt → number (paise)
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
  }))

  return {
    transactions,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

// ── Supporting data for forms ─────────────────────────────────

export interface AccountOption  { id: string; name: string; type: string }
export interface CategoryOption { id: string; name: string; type: string; color: string | null; icon: string | null }

export async function getAccountOptions(userId: string): Promise<AccountOption[]> {
  await ensureDefaultCategoriesAndAccounts(userId)
  const rows = await prisma.account.findMany({
    where:   { userId, isActive: true },
    select:  { id: true, name: true, type: true },
    orderBy: { name: "asc" },
  })
  return rows
}

export async function getCategoryOptions(userId: string): Promise<CategoryOption[]> {
  await ensureDefaultCategoriesAndAccounts(userId)
  const rows = await prisma.category.findMany({
    where: {
      OR: [{ userId }, { userId: null }],   // user custom + system defaults
    },
    select: { id: true, name: true, type: true, color: true, icon: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  })
  return rows
}