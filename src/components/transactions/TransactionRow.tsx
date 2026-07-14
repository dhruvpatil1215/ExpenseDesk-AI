/**
 * Transaction Table Row
 * Path: src/components/transactions/TransactionRow.tsx
 *
 * Receives `optimistic` flag — when true the row is being deleted
 * and shown at 40% opacity while the server action completes.
 */

"use client"

import type { SerializedTransaction } from "@/lib/queries/transaction.queries"
import { formatCurrency, formatDate } from "@/lib/utils/format"

interface Props {
  transaction: SerializedTransaction
  selected:    boolean
  optimistic?: boolean           // true while a delete/update is in-flight
  onSelect:    (id: string, checked: boolean) => void
  onEdit:      (t:  SerializedTransaction) => void
  onDelete:    (id: string) => void
}

const TYPE_META: Record<string, { label: string; color: string; sign: string }> = {
  INCOME:   { label: "Income",   color: "#22c55e", sign: "+" },
  EXPENSE:  { label: "Expense",  color: "#ef4444", sign: "−" },
  TRANSFER: { label: "Transfer", color: "#818cf8", sign: "→" },
}

const STATUS_BADGE: Record<string, string> = {
  DRAFT:      "badge--draft",
  PENDING:    "badge--pending",
  APPROVED:   "badge--approved",
  REJECTED:   "badge--rejected",
  REIMBURSED: "badge--reimbursed",
}

export function TransactionRow({ transaction: t, selected, optimistic, onSelect, onEdit, onDelete }: Props) {
  const meta = TYPE_META[t.type] ?? TYPE_META["EXPENSE"]

  return (
    <tr
      className={`txn-row${selected ? " txn-row--selected" : ""}${optimistic ? " txn-row--optimistic" : ""}`}
      aria-selected={selected}
    >
      {/* Checkbox */}
      <td className="txn-cell txn-cell--check">
        <input
          type="checkbox"
          className="txn-checkbox"
          checked={selected}
          onChange={(e) => onSelect(t.id, e.target.checked)}
          aria-label={`Select ${t.description}`}
        />
      </td>

      {/* Date */}
      <td className="txn-cell txn-cell--date">
        <span>{formatDate(t.transactionDate)}</span>
      </td>

      {/* Description + tags */}
      <td className="txn-cell txn-cell--desc">
        <span className="txn-desc">{t.description}</span>
        {t.tags.length > 0 && (
          <div className="txn-tags">
            {t.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="txn-tag">{tag}</span>
            ))}
            {t.tags.length > 3 && <span className="txn-tag txn-tag--more">+{t.tags.length - 3}</span>}
          </div>
        )}
      </td>

      {/* Category */}
      <td className="txn-cell txn-cell--cat">
        {t.categoryName ? (
          <span className="txn-category">
            {t.categoryIcon && <span>{t.categoryIcon}</span>}
            <span style={{ color: t.categoryColor ?? "inherit" }}>{t.categoryName}</span>
          </span>
        ) : (
          <span className="txn-category txn-category--none">—</span>
        )}
      </td>

      {/* Account */}
      <td className="txn-cell txn-cell--account">
        <span className="txn-account">{t.accountName}</span>
      </td>

      {/* Type badge */}
      <td className="txn-cell txn-cell--type">
        <span className="txn-type-badge" style={{ color: meta.color }}>
          {meta.label}
        </span>
      </td>

      {/* Amount */}
      <td className="txn-cell txn-cell--amount">
        <span
          className="txn-amount"
          style={{ color: meta.color }}
        >
          {meta.sign} {formatCurrency(t.amount, t.currency)}
        </span>
      </td>

      {/* Status (only non-APPROVED) */}
      <td className="txn-cell txn-cell--status">
        {t.status !== "APPROVED" && (
          <span className={`badge ${STATUS_BADGE[t.status] ?? ""}`}>
            {t.status}
          </span>
        )}
      </td>

      {/* Actions */}
      <td className="txn-cell txn-cell--actions">
        {optimistic ? (
          <span className="spinner spinner--sm" aria-label="Processing…" />
        ) : (
          <>
            <button
              type="button"
              className="txn-action-btn txn-action-btn--edit"
              onClick={() => onEdit(t)}
              aria-label={`Edit ${t.description}`}
            >
              ✏️
            </button>
            <button
              type="button"
              className="txn-action-btn txn-action-btn--delete"
              onClick={() => onDelete(t.id)}
              aria-label={`Delete ${t.description}`}
            >
              🗑️
            </button>
          </>
        )}
      </td>
    </tr>
  )
}