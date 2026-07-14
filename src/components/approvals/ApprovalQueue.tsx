/**
 * Manager Approvals Queue (Client Component)
 * Path: src/components/approvals/ApprovalQueue.tsx
 */

"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useToast } from "@/components/ui/Toast"
import { approveTransaction, rejectTransaction } from "@/server/actions/transaction.actions"
import type { SerializedTransaction } from "@/lib/queries/transaction.queries"
import { Modal } from "@/components/ui/Modal"

interface Props {
  pending: SerializedTransaction[]
}

const formatRs = (paise: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(paise / 100)

export function ApprovalQueue({ pending }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [selectedTx, setSelectedTx] = useState<SerializedTransaction | null>(null)
  const [rejectTxId, setRejectTxId] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState("")
  const [isPending, startTransition] = useTransition()

  // ── Handlers ───────────────────────────────────────────────

  function handleApprove(id: string) {
    if (isPending) return
    startTransition(async () => {
      const result = await approveTransaction(id)
      if (result.success) {
        toast.success("Transaction approved successfully!")
        setSelectedTx(null)
        router.refresh()
      } else {
        toast.error(result.error ?? "Failed to approve transaction.")
      }
    })
  }

  function handleRejectSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!rejectTxId || rejectionReason.trim().length < 10) return

    startTransition(async () => {
      const result = await rejectTransaction(rejectTxId, rejectionReason)
      if (result.success) {
        toast.success("Transaction rejected successfully.")
        setRejectTxId(null)
        setSelectedTx(null)
        setRejectionReason("")
        router.refresh()
      } else {
        toast.error(result.error ?? "Failed to reject transaction.")
      }
    })
  }

  return (
    <div className="approvals-queue-container">
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
                <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((t) => (
                <tr 
                  key={t.id} 
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: "0.825rem", cursor: "pointer" }}
                  onClick={() => setSelectedTx(t)}
                  className="approval-row"
                >
                  <td style={{ padding: "0.875rem 1rem" }}>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <strong style={{ color: "var(--color-text)" }}>{(t as any).user?.name ?? "Employee"}</strong>
                      <span style={{ fontSize: "0.7rem", color: "var(--color-text-muted)" }}>{(t as any).user?.email}</span>
                    </div>
                  </td>
                  <td style={{ padding: "0.875rem 1rem" }}>{t.transactionDate}</td>
                  <td style={{ padding: "0.875rem 1rem", color: "var(--color-text)" }}>{t.description}</td>
                  <td style={{ padding: "0.875rem 1rem" }}>{t.categoryName ?? "📦 Uncategorized"}</td>
                  <td style={{ padding: "0.875rem 1rem", textAlign: "right", color: "#fca5a5", fontWeight: "700" }}>{formatRs(t.amount)}</td>
                  <td style={{ padding: "0.875rem 1rem", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center" }}>
                      <button
                        onClick={() => handleApprove(t.id)}
                        disabled={isPending}
                        className="btn btn--sm"
                        style={{ background: "#22c55e", color: "#fff", padding: "0.25rem 0.5rem", borderRadius: "4px" }}
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => setRejectTxId(t.id)}
                        disabled={isPending}
                        className="btn btn--sm"
                        style={{ background: "#ef4444", color: "#fff", padding: "0.25rem 0.5rem", borderRadius: "4px" }}
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Transaction Details & Receipt Modal ──────────────────── */}
      {selectedTx && (
        <Modal 
          open={!!selectedTx} 
          onClose={() => setSelectedTx(null)} 
          title="Review Pending Expense"
          size="lg"
        >
          <div style={{ display: "grid", gridTemplateColumns: selectedTx.receiptUrl ? "1fr 1fr" : "1fr", gap: "1.5rem" }}>
            {/* Left side: Details */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--color-text-muted)" }}>Employee</span>
                <p style={{ margin: 0, fontSize: "0.95rem", fontWeight: "600" }}>{(selectedTx as any).user?.name ?? "Employee"}</p>
                <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--color-text-muted)" }}>{(selectedTx as any).user?.email}</p>
              </div>

              <div>
                <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--color-text-muted)" }}>Description</span>
                <p style={{ margin: 0, fontSize: "0.95rem", color: "var(--color-text)" }}>{selectedTx.description}</p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--color-text-muted)" }}>Amount</span>
                  <p style={{ margin: 0, fontSize: "1.1rem", fontWeight: "700", color: "#fca5a5" }}>{formatRs(selectedTx.amount)}</p>
                </div>
                <div>
                  <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--color-text-muted)" }}>Date</span>
                  <p style={{ margin: 0, fontSize: "0.95rem" }}>{selectedTx.transactionDate}</p>
                </div>
              </div>

              <div>
                <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--color-text-muted)" }}>Category</span>
                <p style={{ margin: 0, fontSize: "0.95rem" }}>{selectedTx.categoryName ?? "📦 Uncategorized"}</p>
              </div>

              {selectedTx.notes && (
                <div>
                  <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--color-text-muted)" }}>Notes</span>
                  <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--color-text-muted)" }}>{selectedTx.notes}</p>
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: "flex", gap: "1rem", marginTop: "1.5rem" }}>
                <button
                  onClick={() => handleApprove(selectedTx.id)}
                  disabled={isPending}
                  className="btn btn--primary"
                  style={{ flex: 1, background: "#22c55e", border: "none" }}
                >
                  Approve Expense
                </button>
                <button
                  onClick={() => setRejectTxId(selectedTx.id)}
                  disabled={isPending}
                  className="btn btn--ghost"
                  style={{ flex: 1, color: "#ef4444", borderColor: "#ef4444" }}
                >
                  Reject Expense
                </button>
              </div>
            </div>

            {/* Right side: Receipt Image */}
            {selectedTx.receiptUrl && (
              <div style={{ border: "1px solid var(--color-border)", borderRadius: "8px", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "#000", height: "300px" }}>
                <img 
                  src={selectedTx.receiptUrl} 
                  alt="Receipt Preview" 
                  style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                />
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ── Rejection Reason Modal ──────────────────────────────── */}
      {rejectTxId && (
        <Modal 
          open={!!rejectTxId} 
          onClose={() => setRejectTxId(null)} 
          title="Provide Rejection Reason"
          size="sm"
        >
          <form onSubmit={handleRejectSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label htmlFor="reason" className="form-label" style={{ fontSize: "0.8rem", textTransform: "none", color: "var(--color-text-muted)" }}>
                Why is this expense being rejected? (minimum 10 characters)
              </label>
              <textarea
                id="reason"
                required
                className="form-textarea"
                rows={4}
                placeholder="e.g. Invalid receipt, missing details, or amount doesn't match description."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                style={{ width: "100%", marginTop: "0.5rem" }}
              />
            </div>

            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button 
                type="button" 
                className="btn btn--ghost" 
                onClick={() => setRejectTxId(null)}
                disabled={isPending}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="btn" 
                style={{ background: "#ef4444", color: "#fff" }}
                disabled={isPending || rejectionReason.trim().length < 10}
              >
                {isPending ? <span className="auth-spinner" style={{ width: "12px", height: "12px", border: "1.5px solid rgba(255,255,255,0.3)", borderTopColor: "#fff" }} /> : "Confirm Reject"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
