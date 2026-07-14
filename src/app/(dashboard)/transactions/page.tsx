/**
 * Transactions Page (Server Component)
 * Path: src/app/(dashboard)/transactions/page.tsx
 *
 * Data-fetching strategy:
 *   - Runs entirely on the server — no useEffect, no client fetch
 *   - Reads searchParams (page, search, type, categoryId, dateFrom, dateTo, sortBy, sortOrder)
 *   - Calls getTransactions() and supporting queries in parallel
 *   - Passes serialisable data to <TransactionList> (Client Component)
 *   - Suspense boundary shows skeleton while streaming
 *
 * When a server action calls revalidatePath("/transactions"), Next.js
 * re-runs this function and the Client Component receives fresh props.
 */

import type { Metadata }          from "next"
import { Suspense }                from "react"
import { auth }                    from "@/auth"
import { redirect }                from "next/navigation"
import { getTransactions, getAccountOptions, getCategoryOptions }
  from "@/lib/queries/transaction.queries"
import { TransactionList }         from "@/components/transactions/TransactionList"

export const metadata: Metadata = {
  title:       "Transactions",
  description: "View, create and manage all your financial transactions.",
}

// Revalidate at most every 30 s; server actions call revalidatePath anyway
export const revalidate = 30

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function str(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

export default async function TransactionsPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const sp = await searchParams

  // Parse filter values from URL
  const filters = {
    page:       str(sp.page),
    pageSize:   "20",
    search:     str(sp.search),
    type:       str(sp.type)       as "INCOME" | "EXPENSE" | "TRANSFER" | undefined,
    categoryId: str(sp.categoryId),
    accountId:  str(sp.accountId),
    dateFrom:   str(sp.dateFrom),
    dateTo:     str(sp.dateTo),
    sortBy:     (str(sp.sortBy)    ?? "transactionDate") as "transactionDate" | "amount" | "description" | "createdAt",
    sortOrder:  (str(sp.sortOrder) ?? "desc")            as "asc" | "desc",
  }

  // Fetch all data in parallel
  const [data, accounts, categories] = await Promise.all([
    getTransactions(session.user.id, filters as any),
    getAccountOptions(session.user.id),
    getCategoryOptions(session.user.id),
  ])

  return (
    <Suspense fallback={<TransactionsSkeleton />}>
      <TransactionList
        data={data}
        accounts={accounts}
        categories={categories}
        sortBy={filters.sortBy}
        sortOrder={filters.sortOrder}
      />
    </Suspense>
  )
}

// ── Loading skeleton ──────────────────────────────────────────

function TransactionsSkeleton() {
  return (
    <div className="txn-module" aria-busy="true">
      <div className="txn-header">
        <div className="skeleton skeleton--title" />
        <div className="skeleton skeleton--btn"  />
      </div>
      <div className="skeleton skeleton--filters" />
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="skeleton skeleton--row" />
      ))}
    </div>
  )
}