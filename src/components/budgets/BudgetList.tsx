/**
 * BudgetList Component
 * Path: src/components/budgets/BudgetList.tsx
 */

"use client"

import { useOptimistic, useTransition, useState } from "react"
import { useRouter } from "next/navigation"
import { useToast } from "@/components/ui/Toast"
import { BudgetForm, type BudgetFormValues } from "./BudgetForm"
import { createBudget, updateBudget, deleteBudget } from "@/server/actions/budget.actions"
import type { SerializedBudget } from "@/lib/queries/budget.queries"
import type { CategoryOption } from "@/lib/queries/transaction.queries"
import "@/styles/dashboard.css"
import "@/styles/budgets.css"

interface Props {
  budgets:    SerializedBudget[]
  categories: CategoryOption[]
}

type OptimisticAction =
  | { type: "add";    budget: SerializedBudget }
  | { type: "update"; id: string; patch: Partial<SerializedBudget> }
  | { type: "delete"; id: string }

export function BudgetList({ budgets, categories }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()

  // ── Optimistic state ────────────────────────────────────────
  const [optimisticBudgets, addOptimistic] = useOptimistic(
    budgets,
    (state: SerializedBudget[], action: OptimisticAction) => {
      switch (action.type) {
        case "add":
          return [...state, action.budget]
        case "update":
          return state.map((b) => b.id === action.id ? { ...b, ...action.patch } : b)
        case "delete":
          return state.filter((b) => b.id !== action.id)
        default:
          return state
      }
    }
  )

  const [optimisticIds, setOptimisticIds] = useState<Set<string>>(new Set())

  // ── Modal state ────────────────────────────────────────────
  const [modalOpen,   setModalOpen]   = useState(false)
  const [editTarget,  setEditTarget]  = useState<SerializedBudget | null>(null)
  const [formLoading, setFormLoading] = useState(false)

  function openCreate() { setEditTarget(null); setModalOpen(true) }
  function openEdit(b: SerializedBudget) { setEditTarget(b); setModalOpen(true) }
  function closeModal() { setModalOpen(false); setEditTarget(null) }

  function markInFlight(id: string) { setOptimisticIds((prev) => new Set([...prev, id])) }
  function clearInFlight(id: string) { setOptimisticIds((prev) => { const n = new Set(prev); n.delete(id); return n }) }

  // ── Form helpers ────────────────────────────────────────────
  const formatRs = (paise: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(paise / 100)

  function buildOptimisticBudget(values: BudgetFormValues): SerializedBudget {
    const cat = categories.find(c => c.id === values.categoryId)
    return {
      id:             `optimistic-${Date.now()}`,
      userId:         "user-id",
      categoryId:     values.categoryId,
      categoryName:   cat?.name ?? "Category",
      categoryColor:  cat?.color ?? null,
      categoryIcon:   cat?.icon ?? null,
      name:           values.name || null,
      limitAmount:    Math.round(parseFloat(values.limitAmount || "0") * 100),
      period:         values.period,
      periodStart:    values.periodStart,
      periodEnd:      values.periodEnd,
      rollover:       values.rollover,
      alertAtPercent: values.alertAtPercent,
      isActive:       true,
      createdAt:      new Date().toISOString(),
      spentAmount:    0,
    }
  }

  // ── Create ─────────────────────────────────────────────────
  async function handleCreate(values: BudgetFormValues) {
    setFormLoading(true)
    const optimistic = buildOptimisticBudget(values)

    addOptimistic({ type: "add", budget: optimistic })

    const result = await createBudget({
      categoryId:     values.categoryId,
      name:           values.name,
      limitAmount:    values.limitAmount,
      period:         values.period,
      periodStart:    values.periodStart,
      periodEnd:      values.periodEnd,
      rollover:       values.rollover,
      alertAtPercent: values.alertAtPercent,
    })

    setFormLoading(false)

    if (!result.success) {
      toast.error(result.error ?? "Failed to create budget.")
      startTransition(() => { router.refresh() })
      return { error: result.error, fieldErrors: result.fieldErrors }
    }

    toast.success("Budget set successfully!")
    closeModal()
    startTransition(() => { router.refresh() })
  }

  // ── Update ─────────────────────────────────────────────────
  async function handleUpdate(values: BudgetFormValues) {
    if (!editTarget) return
    setFormLoading(true)

    markInFlight(editTarget.id)
    const newLimit = Math.round(parseFloat(values.limitAmount || "0") * 100)
    addOptimistic({
      type:  "update",
      id:    editTarget.id,
      patch: {
        name:           values.name || null,
        limitAmount:    newLimit,
        period:         values.period,
        periodStart:    values.periodStart,
        periodEnd:      values.periodEnd,
        rollover:       values.rollover,
        alertAtPercent: values.alertAtPercent,
      },
    })

    const result = await updateBudget(editTarget.id, {
      name:           values.name,
      limitAmount:    values.limitAmount,
      period:         values.period,
      periodStart:    values.periodStart,
      periodEnd:      values.periodEnd,
      rollover:       values.rollover,
      alertAtPercent: values.alertAtPercent,
    })

    clearInFlight(editTarget.id)
    setFormLoading(false)

    if (!result.success) {
      toast.error(result.error ?? "Failed to update budget.")
      startTransition(() => { router.refresh() })
      return { error: result.error, fieldErrors: result.fieldErrors }
    }

    toast.success("Budget updated!")
    closeModal()
    startTransition(() => { router.refresh() })
  }

  // ── Delete ─────────────────────────────────────────────────
  function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this budget limit?")) return

    startTransition(async () => {
      markInFlight(id)
      addOptimistic({ type: "delete", id })

      const result = await deleteBudget(id)
      clearInFlight(id)

      if (!result.success) {
        toast.error(result.error ?? "Failed to delete budget.")
        router.refresh()
        return
      }

      toast.success("Budget deleted.")
      router.refresh()
    })
  }

  return (
    <div className="budget-module">
      {/* Header */}
      <div className="txn-header">
        <div className="txn-header__left">
          <h1 className="txn-header__title">Budgets</h1>
          <span className="txn-header__count">
            {optimisticBudgets.length} active budget limit{optimisticBudgets.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="txn-header__actions">
          <button type="button" className="btn btn--primary" onClick={openCreate} disabled={isPending}>
            + Add Budget
          </button>
        </div>
      </div>

      {isPending && <div className="txn-loading-bar" />}

      {/* Grid List */}
      {optimisticBudgets.length === 0 ? (
        <div className="empty-panel" style={{ marginTop: "1rem" }}>
          <span style={{ fontSize: "2rem" }}>📋</span>
          <h3>No active budgets set</h3>
          <p>Set category limits to track and control your monthly expenses.</p>
          <button type="button" className="btn btn--primary btn--sm" onClick={openCreate} style={{ marginTop: "0.5rem" }}>
            Create first budget
          </button>
        </div>
      ) : (
        <div className="budget-grid">
          {optimisticBudgets.map((b) => {
            const isPendingItem = optimisticIds.has(b.id)
            const pct           = b.limitAmount > 0 ? Math.round((b.spentAmount / b.limitAmount) * 100) : 0
            const remAmount     = b.limitAmount - b.spentAmount
            const overLimit     = pct > 100
            const atRisk        = pct >= b.alertAtPercent && !overLimit

            const barColor = overLimit ? "#ef4444" : atRisk ? "#f59e0b" : "#22c55e"

            return (
              <div
                key={b.id}
                className={`budget-card${isPendingItem ? " budget-card--pending" : ""}${overLimit ? " budget-card--over" : ""}`}
              >
                <div className="budget-card__header">
                  <span className="budget-card__icon" style={{ background: `${b.categoryColor}15`, color: b.categoryColor ?? "#fff" }}>
                    {b.categoryIcon ?? "🏷️"}
                  </span>
                  <div className="budget-card__title">
                    <h3 className="budget-card__name">{b.name ?? b.categoryName}</h3>
                    <span className="budget-card__period">{b.periodStart} to {b.periodEnd}</span>
                  </div>
                  <div className="budget-card__actions-menu">
                    {!isPendingItem && (
                      <>
                        <button type="button" className="budget-card__menu-btn" onClick={() => openEdit(b)}>✏️</button>
                        <button type="button" className="budget-card__menu-btn budget-card__menu-btn--del" onClick={() => handleDelete(b.id)}>🗑️</button>
                      </>
                    )}
                  </div>
                </div>

                <div className="budget-card__progress-wrap">
                  <div className="budget-card__progress-header">
                    <span>Spent: {formatRs(b.spentAmount)}</span>
                    <span>Limit: {formatRs(b.limitAmount)}</span>
                  </div>
                  <div className="budget-card__progress-bar-bg">
                    <div
                      className="budget-card__progress-bar-fill"
                      style={{ width: `${Math.min(100, pct)}%`, backgroundColor: barColor }}
                    />
                  </div>
                  <div className="budget-card__progress-footer">
                    <span style={{ color: barColor }}>{pct}% Utilised</span>
                    <span>
                      {overLimit
                        ? `Over by ${formatRs(Math.abs(remAmount))}`
                        : `${formatRs(remAmount)} remaining`
                      }
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <BudgetForm
        open={modalOpen}
        onClose={closeModal}
        onSubmit={editTarget ? handleUpdate : handleCreate}
        categories={categories}
        initial={editTarget}
        loading={formLoading}
      />
    </div>
  )
}