/**
 * Transaction Table
 * Path: src/components/transactions/TransactionTable.tsx
 *
 * Sortable columns: clicking a header toggles asc/desc and pushes
 * the new sortBy/sortOrder to the URL, triggering a Server Component refetch.
 *
 * Renders an empty state when there are no results.
 */

"use client"

import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { TransactionRow } from "./TransactionRow"
import type { SerializedTransaction } from "@/lib/queries/transaction.queries"

interface Props {
  transactions:        SerializedTransaction[]
  optimisticIds:       Set<string>   // IDs currently being mutated
  selectedIds:         Set<string>
  onSelectOne:         (id: string, checked: boolean) => void
  onSelectAll:         (checked: boolean) => void
  onEdit:              (t: SerializedTransaction) => void
  onDelete:            (id: string) => void
  sortBy:              string
  sortOrder:           string
}

interface Column {
  key:      string
  label:    string
  sortable: boolean
  width?:   string
}

const COLUMNS: Column[] = [
  { key: "check",           label: "",            sortable: false, width: "40px" },
  { key: "transactionDate", label: "Date",        sortable: true,  width: "110px" },
  { key: "description",     label: "Description", sortable: true  },
  { key: "category",        label: "Category",    sortable: false, width: "140px" },
  { key: "account",         label: "Account",     sortable: false, width: "130px" },
  { key: "type",            label: "Type",        sortable: false, width: "90px" },
  { key: "amount",          label: "Amount",      sortable: true,  width: "120px" },
  { key: "status",          label: "Status",      sortable: false, width: "100px" },
  { key: "actions",         label: "",            sortable: false, width: "72px" },
]

export function TransactionTable({
  transactions, optimisticIds, selectedIds,
  onSelectOne, onSelectAll, onEdit, onDelete,
  sortBy, sortOrder,
}: Props) {
  const router   = useRouter()
  const params   = useSearchParams()
  const pathname = usePathname()

  function handleSort(colKey: string) {
    const next = new URLSearchParams(params.toString())
    if (sortBy === colKey) {
      next.set("sortOrder", sortOrder === "asc" ? "desc" : "asc")
    } else {
      next.set("sortBy",    colKey)
      next.set("sortOrder", "desc")
    }
    next.set("page", "1")
    router.push(`${pathname}?${next.toString()}`)
  }

  const allSelected =
    transactions.length > 0 &&
    transactions.every((t) => selectedIds.has(t.id))

  const someSelected =
    !allSelected && transactions.some((t) => selectedIds.has(t.id))

  function sortIcon(col: Column) {
    if (!col.sortable) return null
    if (sortBy !== col.key) return <span className="sort-icon sort-icon--none">↕</span>
    return <span className="sort-icon sort-icon--active">{sortOrder === "asc" ? "↑" : "↓"}</span>
  }

  if (transactions.length === 0) {
    return (
      <div className="txn-empty">
        <div className="txn-empty__icon">📄</div>
        <h3 className="txn-empty__title">No transactions found</h3>
        <p className="txn-empty__subtitle">
          Try adjusting your filters or add a new transaction.
        </p>
      </div>
    )
  }

  return (
    <div className="txn-table-wrap">
      <table className="txn-table" aria-label="Transactions">
        <thead>
          <tr>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                className={`txn-th${col.sortable ? " txn-th--sortable" : ""}`}
                style={col.width ? { width: col.width } : undefined}
                onClick={() => col.sortable && handleSort(col.key)}
                aria-sort={
                  col.sortable && sortBy === col.key
                    ? sortOrder === "asc" ? "ascending" : "descending"
                    : undefined
                }
              >
                {col.key === "check" ? (
                  <input
                    type="checkbox"
                    className="txn-checkbox"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected }}
                    onChange={(e) => onSelectAll(e.target.checked)}
                    aria-label="Select all"
                  />
                ) : (
                  <span className="txn-th__inner">
                    {col.label}
                    {sortIcon(col)}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
            <TransactionRow
              key={t.id}
              transaction={t}
              selected={selectedIds.has(t.id)}
              optimistic={optimisticIds.has(t.id)}
              onSelect={onSelectOne}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}