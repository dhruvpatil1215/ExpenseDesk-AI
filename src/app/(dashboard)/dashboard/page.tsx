/**
 * Dashboard Overview Page (Server Component)
 * Path: src/app/(dashboard)/dashboard/page.tsx
 */

import type { Metadata } from "next"
import { Suspense }       from "react"
import { auth }           from "@/auth"
import { redirect }       from "next/navigation"
import { prisma }         from "@/lib/db"
import Link               from "next/link"

export const metadata: Metadata = {
  title:       "Overview Dashboard",
  description: "A summary of your transactions, active budgets, and savings goals.",
}

export const revalidate = 30

const formatRs = (paise: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(paise / 100)

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const userId = session.user.id

  // 1. Fetch totals in parallel
  const [
    accounts,
    txCount,
    budgetCount,
    goalCount,
    expensesSum,
    incomeSum
  ] = await Promise.all([
    prisma.account.findMany({ where: { userId, isActive: true } }),
    prisma.transaction.count({ where: { userId, isDeleted: false } }),
    prisma.budget.count({ where: { userId, isActive: true } }),
    prisma.goal.count({ where: { userId, status: "ACTIVE" } }),
    prisma.transaction.aggregate({
      _sum: { amount: true },
      where: { userId, type: "EXPENSE", isDeleted: false },
    }),
    prisma.transaction.aggregate({
      _sum: { amount: true },
      where: { userId, type: "INCOME", isDeleted: false },
    }),
  ])

  const totalBalance = accounts.reduce((sum, acc) => sum + Number(acc.balance), 0)
  const totalExpenses = Number(expensesSum._sum.amount ?? 0)
  const totalIncome = Number(incomeSum._sum.amount ?? 0)
  const netSavings = totalIncome - totalExpenses

  return (
    <div className="dash-overview">
      <div className="txn-header" style={{ marginBottom: "1.5rem" }}>
        <div className="txn-header__left">
          <h1 className="txn-header__title">Dashboard</h1>
          <span className="txn-header__count">Welcome back, {session.user.name}!</span>
        </div>
      </div>

      {/* Summary grid */}
      <div className="summary-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
        {/* Net Worth */}
        <div className="stat-card" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--color-border)", borderRadius: "12px", padding: "1.25rem" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", fontWeight: "500", textTransform: "uppercase" }}>Total Account Balance</span>
          <h2 style={{ fontSize: "1.75rem", fontWeight: "800", color: "#6366f1", margin: "0.25rem 0" }}>{formatRs(totalBalance)}</h2>
          <span style={{ fontSize: "0.7rem", color: "var(--color-text-muted)" }}>Across {accounts.length} active account{accounts.length !== 1 ? "s" : ""}</span>
        </div>

        {/* Total Income */}
        <div className="stat-card" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--color-border)", borderRadius: "12px", padding: "1.25rem" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", fontWeight: "500", textTransform: "uppercase" }}>Total Income</span>
          <h2 style={{ fontSize: "1.75rem", fontWeight: "800", color: "#22c55e", margin: "0.25rem 0" }}>{formatRs(totalIncome)}</h2>
          <span style={{ fontSize: "0.7rem", color: "var(--color-text-muted)" }}>Deposits and earnings</span>
        </div>

        {/* Total Expenses */}
        <div className="stat-card" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--color-border)", borderRadius: "12px", padding: "1.25rem" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", fontWeight: "500", textTransform: "uppercase" }}>Total Expenses</span>
          <h2 style={{ fontSize: "1.75rem", fontWeight: "800", color: "#ef4444", margin: "0.25rem 0" }}>{formatRs(totalExpenses)}</h2>
          <span style={{ fontSize: "0.7rem", color: "var(--color-text-muted)" }}>Spending history</span>
        </div>

        {/* Net Savings */}
        <div className="stat-card" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--color-border)", borderRadius: "12px", padding: "1.25rem" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", fontWeight: "500", textTransform: "uppercase" }}>Net Savings</span>
          <h2 style={{ fontSize: "1.75rem", fontWeight: "800", color: netSavings >= 0 ? "#22c55e" : "#ef4444", margin: "0.25rem 0" }}>{formatRs(netSavings)}</h2>
          <span style={{ fontSize: "0.7rem", color: "var(--color-text-muted)" }}>Income minus expenses</span>
        </div>
      </div>

      {/* Navigation shortcuts */}
      <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "1rem" }}>Quick Operations</h3>
      <div className="shortcuts-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
        {/* Transactions */}
        <Link href="/transactions" className="shortcut-card" style={{ display: "flex", flexDirection: "column", gap: "0.25rem", padding: "1.25rem", background: "rgba(99,102,241,0.03)", border: "1px solid rgba(99,102,241,0.12)", borderRadius: "12px", color: "inherit", textDecoration: "none", transition: "transform 0.15s" }}>
          <span style={{ fontSize: "1.5rem" }}>💸</span>
          <strong style={{ fontSize: "0.95rem" }}>Transactions</strong>
          <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>Tracked: {txCount} records</span>
        </Link>

        {/* Budgets */}
        <Link href="/budgets" className="shortcut-card" style={{ display: "flex", flexDirection: "column", gap: "0.25rem", padding: "1.25rem", background: "rgba(34,197,94,0.03)", border: "1px solid rgba(34,197,94,0.12)", borderRadius: "12px", color: "inherit", textDecoration: "none", transition: "transform 0.15s" }}>
          <span style={{ fontSize: "1.5rem" }}>📋</span>
          <strong style={{ fontSize: "0.95rem" }}>Budgets</strong>
          <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>Active: {budgetCount} categories</span>
        </Link>

        {/* Goals */}
        <Link href="/goals" className="shortcut-card" style={{ display: "flex", flexDirection: "column", gap: "0.25rem", padding: "1.25rem", background: "rgba(245,158,11,0.03)", border: "1px solid rgba(245,158,11,0.12)", borderRadius: "12px", color: "inherit", textDecoration: "none", transition: "transform 0.15s" }}>
          <span style={{ fontSize: "1.5rem" }}>🎯</span>
          <strong style={{ fontSize: "0.95rem" }}>Savings Goals</strong>
          <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>Active: {goalCount} targets</span>
        </Link>

        {/* AI Insights */}
        <Link href="/insights" className="shortcut-card" style={{ display: "flex", flexDirection: "column", gap: "0.25rem", padding: "1.25rem", background: "rgba(139,92,246,0.03)", border: "1px solid rgba(139,92,246,0.12)", borderRadius: "12px", color: "inherit", textDecoration: "none", transition: "transform 0.15s" }}>
          <span style={{ fontSize: "1.5rem" }}>🤖</span>
          <strong style={{ fontSize: "0.95rem" }}>AI Financial Insights</strong>
          <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>Personalized analysis</span>
        </Link>
      </div>
    </div>
  )
}