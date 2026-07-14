/**
 * GoalList Component
 * Path: src/components/goals/GoalList.tsx
 */

"use client"

import { useOptimistic, useTransition, useState } from "react"
import { useRouter } from "next/navigation"
import { useToast } from "@/components/ui/Toast"
import { GoalForm, type GoalFormValues } from "./GoalForm"
import { createGoal, updateGoal, deleteGoal } from "@/server/actions/goal.actions"
import type { SerializedGoal } from "@/lib/queries/goal.queries"
import "@/styles/dashboard.css"
import "@/styles/goals.css"

interface Props {
  goals: SerializedGoal[]
}

type OptimisticAction =
  | { type: "add";    goal: SerializedGoal }
  | { type: "update"; id: string; patch: Partial<SerializedGoal> }
  | { type: "delete"; id: string }

export function GoalList({ goals }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()

  // ── Optimistic state ────────────────────────────────────────
  const [optimisticGoals, addOptimistic] = useOptimistic(
    goals,
    (state: SerializedGoal[], action: OptimisticAction) => {
      switch (action.type) {
        case "add":
          return [...state, action.goal]
        case "update":
          return state.map((g) => g.id === action.id ? { ...g, ...action.patch } : g)
        case "delete":
          return state.filter((g) => g.id !== action.id)
        default:
          return state
      }
    }
  )

  const [optimisticIds, setOptimisticIds] = useState<Set<string>>(new Set())

  // ── Modal state ────────────────────────────────────────────
  const [modalOpen,   setModalOpen]   = useState(false)
  const [editTarget,  setEditTarget]  = useState<SerializedGoal | null>(null)
  const [formLoading, setFormLoading] = useState(false)

  function openCreate() { setEditTarget(null); setModalOpen(true) }
  function openEdit(g: SerializedGoal) { setEditTarget(g); setModalOpen(true) }
  function closeModal() { setModalOpen(false); setEditTarget(null) }

  function markInFlight(id: string) { setOptimisticIds((prev) => new Set([...prev, id])) }
  function clearInFlight(id: string) { setOptimisticIds((prev) => { const n = new Set(prev); n.delete(id); return n }) }

  const formatRs = (paise: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(paise / 100)

  function buildOptimisticGoal(values: GoalFormValues): SerializedGoal {
    const target = Math.round(parseFloat(values.targetAmount || "0") * 100)
    const current = Math.round(parseFloat(values.currentAmount || "0") * 100)
    return {
      id:            `optimistic-${Date.now()}`,
      userId:        "user-id",
      name:          values.name,
      description:   values.description || null,
      targetAmount:  target,
      currentAmount: current,
      targetDate:    values.targetDate || null,
      icon:          values.icon || null,
      color:         values.color || null,
      status:        current >= target ? "COMPLETED" : "ACTIVE",
      completedAt:   current >= target ? new Date().toISOString() : null,
      createdAt:     new Date().toISOString(),
    }
  }

  // ── Create ─────────────────────────────────────────────────
  async function handleCreate(values: GoalFormValues) {
    setFormLoading(true)
    const optimistic = buildOptimisticGoal(values)

    addOptimistic({ type: "add", goal: optimistic })

    const result = await createGoal({
      name:          values.name,
      description:   values.description,
      targetAmount:  values.targetAmount,
      currentAmount: values.currentAmount,
      targetDate:    values.targetDate,
      icon:          values.icon,
      color:         values.color,
    })

    setFormLoading(false)

    if (!result.success) {
      toast.error(result.error ?? "Failed to create goal.")
      startTransition(() => { router.refresh() })
      return { error: result.error, fieldErrors: result.fieldErrors }
    }

    toast.success("Goal set successfully!")
    closeModal()
    startTransition(() => { router.refresh() })
  }

  // ── Update ─────────────────────────────────────────────────
  async function handleUpdate(values: GoalFormValues) {
    if (!editTarget) return
    setFormLoading(true)

    markInFlight(editTarget.id)
    const target = Math.round(parseFloat(values.targetAmount || "0") * 100)
    const current = Math.round(parseFloat(values.currentAmount || "0") * 100)

    addOptimistic({
      type:  "update",
      id:    editTarget.id,
      patch: {
        name:          values.name,
        description:   values.description || null,
        targetAmount:  target,
        currentAmount: current,
        targetDate:    values.targetDate || null,
        icon:          values.icon || null,
        color:         values.color || null,
        status:        current >= target ? "COMPLETED" : "ACTIVE",
      },
    })

    const result = await updateGoal(editTarget.id, {
      name:          values.name,
      description:   values.description,
      targetAmount:  values.targetAmount,
      currentAmount: values.currentAmount,
      targetDate:    values.targetDate,
      icon:          values.icon,
      color:         values.color,
    })

    clearInFlight(editTarget.id)
    setFormLoading(false)

    if (!result.success) {
      toast.error(result.error ?? "Failed to update goal.")
      startTransition(() => { router.refresh() })
      return { error: result.error, fieldErrors: result.fieldErrors }
    }

    toast.success("Goal updated!")
    closeModal()
    startTransition(() => { router.refresh() })
  }

  // ── Delete ─────────────────────────────────────────────────
  function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this savings goal?")) return

    startTransition(async () => {
      markInFlight(id)
      addOptimistic({ type: "delete", id })

      const result = await deleteGoal(id)
      clearInFlight(id)

      if (!result.success) {
        toast.error(result.error ?? "Failed to delete goal.")
        router.refresh()
        return
      }

      toast.success("Goal deleted.")
      router.refresh()
    })
  }

  return (
    <div className="goal-module">
      {/* Header */}
      <div className="txn-header">
        <div className="txn-header__left">
          <h1 className="txn-header__title">Savings Goals</h1>
          <span className="txn-header__count">
            {optimisticGoals.length} active goal{optimisticGoals.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="txn-header__actions">
          <button type="button" className="btn btn--primary" onClick={openCreate} disabled={isPending}>
            + Add Savings Goal
          </button>
        </div>
      </div>

      {isPending && <div className="txn-loading-bar" />}

      {/* Grid */}
      {optimisticGoals.length === 0 ? (
        <div className="empty-panel" style={{ marginTop: "1rem" }}>
          <span style={{ fontSize: "2rem" }}>🎯</span>
          <h3>No goals created yet</h3>
          <p>Set a target date and save money for a vacation, car, or downpayment.</p>
          <button type="button" className="btn btn--primary btn--sm" onClick={openCreate} style={{ marginTop: "0.5rem" }}>
            Set a savings goal
          </button>
        </div>
      ) : (
        <div className="goal-grid">
          {optimisticGoals.map((g) => {
            const isPendingItem = optimisticIds.has(g.id)
            const pct           = g.targetAmount > 0 ? Math.round((g.currentAmount / g.targetAmount) * 100) : 0
            const remAmount     = Math.max(0, g.targetAmount - g.currentAmount)
            const completed     = g.status === "COMPLETED"

            const themeColor = g.color ?? "#10b981"

            return (
              <div
                key={g.id}
                className={`goal-card${isPendingItem ? " goal-card--pending" : ""}${completed ? " goal-card--completed" : ""}`}
              >
                <div className="goal-card__header">
                  <span className="goal-card__icon" style={{ background: `${themeColor}15`, color: themeColor }}>
                    {g.icon ?? "🎯"}
                  </span>
                  <div className="goal-card__title">
                    <h3 className="goal-card__name">{g.name}</h3>
                    {g.targetDate && <span className="goal-card__date">Target: {g.targetDate}</span>}
                  </div>
                  <div className="goal-card__actions-menu">
                    {!isPendingItem && (
                      <>
                        <button type="button" className="goal-card__menu-btn" onClick={() => openEdit(g)}>✏️</button>
                        <button type="button" className="goal-card__menu-btn goal-card__menu-btn--del" onClick={() => handleDelete(g.id)}>🗑️</button>
                      </>
                    )}
                  </div>
                </div>

                {g.description && <p className="goal-card__desc">{g.description}</p>}

                <div className="goal-card__progress-wrap">
                  <div className="goal-card__progress-header">
                    <span>Saved: {formatRs(g.currentAmount)}</span>
                    <span>Target: {formatRs(g.targetAmount)}</span>
                  </div>
                  <div className="goal-card__progress-bar-bg">
                    <div
                      className="goal-card__progress-bar-fill"
                      style={{ width: `${Math.min(100, pct)}%`, backgroundColor: themeColor }}
                    />
                  </div>
                  <div className="goal-card__progress-footer">
                    <span style={{ color: themeColor, fontWeight: 700 }}>{pct}% Saved</span>
                    <span>
                      {completed
                        ? "🎉 Target Achieved!"
                        : `${formatRs(remAmount)} left`
                      }
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <GoalForm
        open={modalOpen}
        onClose={closeModal}
        onSubmit={editTarget ? handleUpdate : handleCreate}
        initial={editTarget}
        loading={formLoading}
      />
    </div>
  )
}