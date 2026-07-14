/**
 * Approvals Page (Server Component)
 * Path: src/app/(dashboard)/approvals/page.tsx
 *
 * MANAGER only route.
 */

import type { Metadata } from "next"
import { auth }           from "@/auth"
import { redirect }       from "next/navigation"
import { prisma }         from "@/lib/db"

export const metadata: Metadata = {
  title:       "Approvals",
  description: "Manager reviews pending expense submissions.",
}

const formatRs = (paise: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(paise / 100)

export default async function ApprovalsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")
  if (session.user.role !== "MANAGER") {
    redirect("/transactions")
  }

  // Fetch PENDING transactions requiring manager review
  const pending = await prisma.transaction.findMany({
    where: {
      status:    "PENDING",
      isDeleted: false,
    },
    include: {
      user:     { select: { name: true, email: true } },
      category: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return (
    <div className="approvals-page">
      <div className="txn-header" style={{ marginBottom: "1.5rem" }}>
        <div className="txn-header__left">
          <h1 className="txn-header__title">Pending Approvals</h1>
          <span className="txn-header__count">{pending.length} pending review</span>
        </div>
      </div>

      {pending.length === 0 ? (
        <div className="empty-panel" style={{ background: "rgba(255,255,255,0.015)", border: "1px dashed var(--color-border)", borderRadius: "12px", padding: "3rem", textAlign: "center", marginTop: "1rem" }}>
          <span style={{ fontSize: "2rem" }}>✅</span>
          <h3 style={{ marginTop: "1rem", fontSize: "1.05rem" }}>All caught up!</h3>
          <p style={{ fontSize: "0.825rem", color: "var(--color-text-muted)" }}>No expense reports are currently pending review.</p>
        </div>
      ) : (
        <div className="txn-table-wrap" style={{ overflowX: "auto", border: "1px solid var(--color-border)", borderRadius: "12px", background: "rgba(255,255,255,0.02)" }}>
          <table className="txn-table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid var(--color-border)", textAlign: "left", fontSize: "0.75rem", textTransform: "uppercase" }}>
                <th style={{ padding: "0.75rem 1rem" }}>Employee</th>
                <th style={{ padding: "0.75rem 1rem" }}>Date</th>
                <th style={{ padding: "0.75rem 1rem" }}>Description</th>
                <th style={{ padding: "0.75rem 1rem" }}>Category</th>
                <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>Amount</th>
                <th style={{ padding: "0.75rem 1rem" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((t) => (
                <tr key={t.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: "0.825rem" }}>
                  <td style={{ padding: "0.875rem 1rem" }}>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <strong style={{ color: "var(--color-text)" }}>{t.user.name}</strong>
                      <span style={{ fontSize: "0.7rem", color: "var(--color-text-muted)" }}>{t.user.email}</span>
                    </div>
                  </td>
                  <td style={{ padding: "0.875rem 1rem" }}>{t.transactionDate.toISOString().split("T")[0]}</td>
                  <td style={{ padding: "0.875rem 1rem", color: "var(--color-text)" }}>{t.description}</td>
                  <td style={{ padding: "0.875rem 1rem" }}>{t.category?.name ?? "📦 Uncategorized"}</td>
                  <td style={{ padding: "0.875rem 1rem", textAlign: "right", color: "#fca5a5", fontWeight: "700" }}>{formatRs(Number(t.amount))}</td>
                  <td style={{ padding: "0.875rem 1rem" }}>
                    <span style={{ background: "rgba(245,158,11,0.12)", color: "#f59e0b", padding: "0.15rem 0.4rem", borderRadius: "4px", fontSize: "0.65rem", fontWeight: "700" }}>
                      {t.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}