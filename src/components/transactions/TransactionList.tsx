/**
 * TransactionList — Main Client Component
 * Path: src/components/transactions/TransactionList.tsx
 *
 * Architecture:
 *   - Receives server-fetched data as props (no client-side fetch)
 *   - useOptimistic: shows changes instantly before server confirms
 *   - useTransition: keeps UI responsive while server action runs
 *   - On server action failure: optimistic state auto-reverts + toast.error
 *   - On success: toast.success + router.refresh() re-syncs server data
 *
 * Data flow for delete:
 *   1. User clicks 🗑️
 *   2. addOptimistic({ type:"delete", id })  → row disappears instantly
 *   3. startTransition(() => deleteTransaction(id))
 *   4a. Success → toast.success, router.refresh() → server data replaces optimistic
 *   4b. Failure → toast.error  → useOptimistic reverts because server data unchanged
 */

"use client"

import "@/styles/dashboard.css"
import "@/styles/transactions.css"
import { useOptimistic, useTransition, useState, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useToast } from "@/components/ui/Toast"
import { TransactionFilters } from "./TransactionFilters"
import { TransactionTable }   from "./TransactionTable"
import { TransactionForm, type TransactionFormValues } from "./TransactionForm"
import { Pagination }         from "@/components/ui/Pagination"
import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
  bulkDeleteTransactions,
} from "@/server/actions/transaction.actions"
import type { SerializedTransaction, AccountOption, CategoryOption } from "@/lib/queries/transaction.queries"
import { ExportMenu } from "@/components/export/ExportMenu"

// ── Types ─────────────────────────────────────────────────────

interface ServerData {
  transactions: SerializedTransaction[]
  total:        number
  page:         number
  pageSize:     number
  totalPages:   number
}

interface Props {
  data:       ServerData
  accounts:   AccountOption[]
  categories: CategoryOption[]
  sortBy:     string
  sortOrder:  string
}

type OptimisticAction =
  | { type: "add";    transaction: SerializedTransaction }
  | { type: "update"; id: string; patch: Partial<SerializedTransaction> }
  | { type: "delete"; id: string }
  | { type: "bulk-delete"; ids: string[] }

// ── Component ─────────────────────────────────────────────────

export function TransactionList({ data, accounts, categories, sortBy, sortOrder }: Props) {
  const router          = useRouter()
  const { toast }       = useToast()
  const [isPending, startTransition] = useTransition()
  const params          = useSearchParams()

  // ── Optimistic state ───────────────────────────────────────
  const [optimisticTransactions, addOptimistic] = useOptimistic(
    data.transactions,
    (state: SerializedTransaction[], action: OptimisticAction) => {
      switch (action.type) {
        case "add":
          return [action.transaction, ...state]
        case "update":
          return state.map((t) => t.id === action.id ? { ...t, ...action.patch } : t)
        case "delete":
          return state.filter((t) => t.id !== action.id)
        case "bulk-delete":
          return state.filter((t) => !action.ids.includes(t.id))
        default:
          return state
      }
    }
  )

  // IDs that have an in-flight optimistic mutation (show spinner overlay)
  const [optimisticIds, setOptimisticIds] = useState<Set<string>>(new Set())

  // ── Modal state ────────────────────────────────────────────
  const [modalOpen,   setModalOpen]   = useState(false)
  const [editTarget,  setEditTarget]  = useState<SerializedTransaction | null>(null)
  const [formLoading, setFormLoading] = useState(false)

  // ── Bulk selection state ───────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // ── Helpers ────────────────────────────────────────────────

  function openCreate() { setEditTarget(null); setModalOpen(true) }
  function openEdit(t: SerializedTransaction) { setEditTarget(t); setModalOpen(true) }
  function closeModal() { setModalOpen(false); setEditTarget(null) }

  function selectOne(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      checked ? next.add(id) : next.delete(id)
      return next
    })
  }

  function selectAll(checked: boolean) {
    setSelectedIds(checked
      ? new Set(optimisticTransactions.map((t) => t.id))
      : new Set()
    )
  }

  function markInFlight(ids: string[]) {
    setOptimisticIds((prev) => new Set([...prev, ...ids]))
  }

  function clearInFlight(ids: string[]) {
    setOptimisticIds((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => next.delete(id))
      return next
    })
  }

  // ── Synthesise a temporary SerializedTransaction for optimistic add ──

  function buildOptimisticTx(values: TransactionFormValues): SerializedTransaction {
    const account  = accounts.find((a) => a.id === values.accountId)
    const category = categories.find((c) => c.id === values.categoryId)
    const paise    = Math.round(parseFloat(values.amount || "0") * 100)
    return {
      id:                  `optimistic-${Date.now()}`,
      userId:              "",
      accountId:           values.accountId,
      accountName:         account?.name ?? "",
      categoryId:          values.categoryId || null,
      categoryName:        category?.name  ?? null,
      categoryColor:       category?.color ?? null,
      categoryIcon:        category?.icon  ?? null,
      type:                values.type,
      amount:              paise,
      currency:            "INR",
      description:         values.description,
      notes:               values.notes || null,
      transactionDate:     values.transactionDate,
      tags:                values.tags,
      status:              "APPROVED",
      receiptUrl:          null,
      isRecurring:         false,
      transferToAccountId: values.transferToAccountId || null,
      createdAt:           new Date().toISOString(),
      updatedAt:           new Date().toISOString(),
    }
  }

  // ── Create ─────────────────────────────────────────────────

  async function handleCreate(values: TransactionFormValues) {
    setFormLoading(true)
    const optimistic = buildOptimisticTx(values)

    addOptimistic({ type: "add", transaction: optimistic })

    const result = await createTransaction({
      accountId:           values.accountId,
      categoryId:          values.categoryId || null,
      type:                values.type,
      amount:              values.amount,
      description:         values.description,
      notes:               values.notes || null,
      transactionDate:     values.transactionDate,
      tags:                values.tags,
      transferToAccountId: values.transferToAccountId || null,
    })

    setFormLoading(false)

    if (!result.success) {
      toast.error(result.error ?? "Failed to create transaction.")
      startTransition(() => {
        router.refresh()
      })
      return { error: result.error, fieldErrors: result.fieldErrors }
    }

    toast.success("Transaction added successfully!")
    closeModal()
    startTransition(() => {
      router.refresh()
    })
  }

  // ── Update ─────────────────────────────────────────────────

  async function handleUpdate(values: TransactionFormValues) {
    if (!editTarget) return
    setFormLoading(true)

    const paise = Math.round(parseFloat(values.amount || "0") * 100)
    const account  = accounts.find((a) => a.id === values.accountId)
    const category = categories.find((c) => c.id === values.categoryId)

    markInFlight([editTarget.id])
    addOptimistic({
      type:  "update",
      id:    editTarget.id,
      patch: {
        description:   values.description,
        amount:        paise,
        accountId:     values.accountId,
        accountName:   account?.name  ?? editTarget.accountName,
        categoryId:    values.categoryId || null,
        categoryName:  category?.name  ?? null,
        categoryColor: category?.color ?? null,
        categoryIcon:  category?.icon  ?? null,
        type:          values.type,
        notes:         values.notes || null,
        transactionDate: values.transactionDate,
        tags:          values.tags,
      },
    })

    const result = await updateTransaction(editTarget.id, {
      accountId:       values.accountId,
      categoryId:      values.categoryId || null,
      type:            values.type,
      amount:          values.amount,
      description:     values.description,
      notes:           values.notes || null,
      transactionDate: values.transactionDate,
      tags:            values.tags,
    })

    clearInFlight([editTarget.id])
    setFormLoading(false)

    if (!result.success) {
      toast.error(result.error ?? "Failed to update transaction.")
      startTransition(() => {
        router.refresh()
      })
      return { error: result.error, fieldErrors: result.fieldErrors }
    }

    toast.success("Transaction updated!")
    closeModal()
    startTransition(() => {
      router.refresh()
    })
  }

  // ── Delete ─────────────────────────────────────────────────

  const handleDelete = useCallback((id: string) => {
    if (!confirm("Delete this transaction? This cannot be undone.")) return

    startTransition(async () => {
      markInFlight([id])
      addOptimistic({ type: "delete", id })

      const result = await deleteTransaction(id)
      clearInFlight([id])

      if (!result.success) {
        toast.error(result.error ?? "Failed to delete transaction.")
        router.refresh() // revert optimistic state
        return
      }

      toast.success("Transaction deleted.")
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n })
      router.refresh()
    })
  }, [addOptimistic, router, toast, startTransition])

  // ── Bulk delete ────────────────────────────────────────────

  function handleBulkDelete() {
    const ids = [...selectedIds]
    if (!ids.length) return
    if (!confirm(`Delete ${ids.length} transaction(s)? This cannot be undone.`)) return

    startTransition(async () => {
      markInFlight(ids)
      addOptimistic({ type: "bulk-delete", ids })

      const result = await bulkDeleteTransactions(ids)
      clearInFlight(ids)

      if (!result.success) {
        toast.error(result.error ?? "Bulk delete failed.")
        router.refresh()
        return
      }

      toast.success(`${result.data?.deletedCount ?? ids.length} transaction(s) deleted.`)
      setSelectedIds(new Set())
      router.refresh()
    })
  }

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="txn-module">
      {/* Header */}
      <div className="txn-header">
        <div className="txn-header__left">
          <h1 className="txn-header__title">Transactions</h1>
          <span className="txn-header__count">
            {data.total.toLocaleString()} record{data.total !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="txn-header__actions">
          {selectedIds.size > 0 && (
            <button
              type="button"
              className="btn btn--danger"
              onClick={handleBulkDelete}
              disabled={isPending}
            >
              🗑 Delete {selectedIds.size} selected
            </button>
          )}
          <ExportMenu filters={{
            type:       params.get("type")       ?? undefined,
            categoryId: params.get("categoryId") ?? undefined,
            accountId:  params.get("accountId")  ?? undefined,
            dateFrom:   params.get("dateFrom")   ?? undefined,
            dateTo:     params.get("dateTo")     ?? undefined,
            search:     params.get("search")     ?? undefined,
          }} />
          <button
            type="button"
            className="btn btn--primary"
            onClick={openCreate}
            disabled={isPending}
          >
            + Add Transaction
          </button>
        </div>
      </div>

      {/* Filters */}
      <TransactionFilters categories={categories} />

      {/* Loading bar */}
      {isPending && <div className="txn-loading-bar" role="status" aria-label="Loading…" />}

      {/* Table */}
      <TransactionTable
        transactions={optimisticTransactions}
        optimisticIds={optimisticIds}
        selectedIds={selectedIds}
        onSelectOne={selectOne}
        onSelectAll={selectAll}
        onEdit={openEdit}
        onDelete={handleDelete}
        sortBy={sortBy}
        sortOrder={sortOrder}
      />

      {/* Pagination */}
      <Pagination
        page={data.page}
        totalPages={data.totalPages}
        total={data.total}
        pageSize={data.pageSize}
      />

      {/* Create / Edit modal */}
      <TransactionForm
        open={modalOpen}
        onClose={closeModal}
        onSubmit={editTarget ? handleUpdate : handleCreate}
        initial={editTarget}
        accounts={accounts}
        categories={categories}
        loading={formLoading}
      />
    </div>
  )
}