/**
 * Budgets Page (Server Component)
 * Path: src/app/(dashboard)/budgets/page.tsx
 */

import type { Metadata } from "next"
import { Suspense }       from "react"
import { auth }           from "@/auth"
import { redirect }       from "next/navigation"
import { getBudgets }     from "@/lib/queries/budget.queries"
import { getCategoryOptions } from "@/lib/queries/transaction.queries"
import { BudgetList }     from "@/components/budgets/BudgetList"

export const metadata: Metadata = {
  title:       "Budgets",
  description: "Track and control category limits with real-time progress bars.",
}

export const revalidate = 30

export default async function BudgetsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const [budgets, categories] = await Promise.all([
    getBudgets(session.user.id),
    getCategoryOptions(session.user.id),
  ])

  return (
    <Suspense fallback={<BudgetsSkeleton />}>
      <BudgetList budgets={budgets} categories={categories} />
    </Suspense>
  )
}

function BudgetsSkeleton() {
  return (
    <div className="budget-module" aria-busy="true">
      <div className="txn-header">
        <div className="skeleton skeleton--title" />
        <div className="skeleton skeleton--btn" />
      </div>
      <div className="budget-grid" style={{ marginTop: "1.5rem" }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: "180px", borderRadius: "12px" }} />
        ))}
      </div>
    </div>
  )
}