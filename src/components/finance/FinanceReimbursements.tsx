/**
 * Finance & Reimbursements Management (Client Component)
 * Path: src/components/finance/FinanceReimbursements.tsx
 */

"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useToast } from "@/components/ui/Toast"
import { reimburseTransactions } from "@/server/actions/transaction.actions"
import type { SerializedTransaction } from "@/lib/queries/transaction.queries"
import { Modal } from "@/components/ui/Modal"

interface Props {
  approved: SerializedTransaction[]
}

const formatRs = (paise: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(paise / 100)

export function FinanceReimbursements({ approved }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [viewTx, setViewTx] = useState<SerializedTransaction | null>(null)
  const [isPending, startTransition] = useTransition()

  // ── Multi-select Handlers ───────────────────────────────────

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === approved.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(approved.map((t) => t.id)))
    }
  }

  function handleReimburse() {
    if (selectedIds.size === 0 || isPending) return

    startTransition(async () => {
      const idsArray = Array.from(selectedIds)
      const result = await reimburseTransactions(idsArray)
      if (result.success) {
        toast.success(`Successfully reimbursed ${idsArray.length} expenses!`)
        setSelectedIds(new Set())
        router.refresh()
      } else {
        toast.error(result.error ?? "Failed to process reimbursements.")
      }
    })
  }

  return (
    <div className="finance-reimbursements-container">
      {/* Bulk action header */}
      {selectedIds.size > 0 && (
        <div 
          style={{
            background: "rgba(129, 140, 248, 0.08)",
            border: "1px solid rgba(129, 140, 248, 0.3)",
            borderRadius: "12px",
            padding: "1rem",
            marginBottom: "1.5rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            animation: "fadeIn 0.2s ease"
          }}
        >
          <span style={{ fontSize: "0.875rem", color: "var(--color-text)", fontWeight: "600" }}>
            💳 {selectedIds.size} approved expense{selectedIds.size > 1 ? "s" : ""} selected
          </span>
          <button
            onClick={handleReimburse}
            disabled={isPending}
            className="btn btn--primary"
            style={{ background: "#22c55e", color: "#fff", display: "flex", alignItems: "center", gap: "0.5rem" }}
          >
            {isPending && <span className="auth-spinner" style={{ width: "12px", height: "12px", border: "1.5px solid rgba(255,255,255,0.3)", borderTopColor: "#fff" }} />}
            Mark as Reimbursed
          </button>
        </div>
      )}

      {approved.length === 0 ? (
        <div className="empty-panel" style={{ background: "rgba(255,255,255,0.015)", border: "1px dashed var(--color-border)", borderRadius: "12px", padding: "3rem", textAlign: "center", marginTop: "1rem" }}>
          <span style={{ fontSize: "2rem" }}>💼</span>
          <h3 style={{ marginTop: "1rem", fontSize: "1.05rem" }}>No payments pending</h3>
          <p style={{ fontSize: "0.825rem", color: "var(--color-text-muted)" }}>All approved expenses have been reimbursed.</p>
        </div>
      ) : (
        <div className="txn-table-wrap" style={{ overflowX: "auto", border: "1px solid var(--color-border)", borderRadius: "12px", background: "rgba(255,255,255,0.02)" }}>
          <table className="txn-table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid var(--color-border)", textAlign: "left", fontSize: "0.75rem", textTransform: "uppercase" }}>
                <th style={{ padding: "0.75rem 1rem", width: "40px", textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={approved.length > 0 && selectedIds.size === approved.length}
                    onChange={toggleSelectAll}
                    style={{ cursor: "pointer" }}
                  />
                </th>
                <th style={{ padding: "0.75rem 1rem" }}>Employee</th>
                <th style={{ padding: "0.75rem 1rem" }}>Date</th>
                <th style={{ padding: "0.75rem 1rem" }}>Description</th>
                <th style={{ padding: "0.75rem 1rem" }}>Category</th>
                <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>Amount</th>
                <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {approved.map((t) => (
                <tr 
                  key={t.id} 
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: "0.825rem", cursor: "pointer" }}
                  onClick={() => toggleSelect(t.id)}
                  className="finance-row"
                >
                  <td style={{ padding: "0.875rem 1rem", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(t.id)}
                      onChange={() => toggleSelect(t.id)}
                      style={{ cursor: "pointer" }}
                    />
                  </td>
                  <td style={{ padding: "0.875rem 1rem" }}>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <strong style={{ color: "var(--color-text)" }}>{(t as any).user?.name ?? "Employee"}</strong>
                      <span style={{ fontSize: "0.7rem", color: "var(--color-text-muted)" }}>{(t as any).user?.email}</span>
                    </div>
                  </td>
                  <td style={{ padding: "0.875rem 1rem" }}>{t.transactionDate}</td>
                  <td style={{ padding: "0.875rem 1rem", color: "var(--color-text)" }}>{t.description}</td>
                  <td style={{ padding: "0.875rem 1rem" }}>{t.categoryName ?? "📦 Uncategorized"}</td>
                  <td style={{ padding: "0.875rem 1rem", textAlign: "right", color: "#86efac", fontWeight: "700" }}>{formatRs(t.amount)}</td>
                  <td style={{ padding: "0.875rem 1rem", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                    {t.receiptUrl ? (
                      <button
                        onClick={() => setViewTx(t)}
                        className="btn btn--ghost btn--sm"
                        style={{ padding: "0.15rem 0.4rem", fontSize: "0.7rem" }}
                      >
                        View
                      </button>
                    ) : (
                      <span style={{ fontSize: "0.7rem", color: "var(--color-text-muted)" }}>None</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Receipt View Modal ─────────────────────────────────────── */}
      {viewTx && (
        <Modal 
          open={!!viewTx} 
          onClose={() => setViewTx(null)} 
          title="Review Receipt"
          size="sm"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ border: "1px solid var(--color-border)", borderRadius: "8px", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "#000", height: "320px" }}>
              <img 
                src={viewTx.receiptUrl!} 
                alt="Receipt Preview" 
                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
              />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: "0.9rem", fontWeight: "600" }}>{viewTx.description}</p>
              <p style={{ margin: 0, fontSize: "1.1rem", fontWeight: "700", color: "#86efac", marginTop: "0.25rem" }}>{formatRs(viewTx.amount)}</p>
              <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.25rem" }}>Date: {viewTx.transactionDate} | Category: {viewTx.categoryName ?? "Uncategorized"}</p>
            </div>
            <button className="btn btn--primary" onClick={() => setViewTx(null)} style={{ marginTop: "0.5rem" }}>
              Close
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
