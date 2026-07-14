/**
 * Goals Page (Server Component)
 * Path: src/app/(dashboard)/goals/page.tsx
 */

import type { Metadata } from "next"
import { Suspense }       from "react"
import { auth }           from "@/auth"
import { redirect }       from "next/navigation"
import { getGoals }       from "@/lib/queries/goal.queries"
import { GoalList }       from "@/components/goals/GoalList"

export const metadata: Metadata = {
  title:       "Savings Goals",
  description: "Track and visualize your savings goals over time.",
}

export const revalidate = 30

export default async function GoalsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const goals = await getGoals(session.user.id)

  return (
    <Suspense fallback={<GoalsSkeleton />}>
      <GoalList goals={goals} />
    </Suspense>
  )
}

function GoalsSkeleton() {
  return (
    <div className="goal-module" aria-busy="true">
      <div className="txn-header">
        <div className="skeleton skeleton--title" />
        <div className="skeleton skeleton--btn" />
      </div>
      <div className="goal-grid" style={{ marginTop: "1.5rem" }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: "185px", borderRadius: "12px" }} />
        ))}
      </div>
    </div>
  )
}