/**
 * CategoryList Component
 * Path: src/components/categories/CategoryList.tsx
 */

"use client"

import { useOptimistic, useTransition, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useToast } from "@/components/ui/Toast"
import { CategoryForm, type CategoryFormValues } from "./CategoryForm"
import {
  createCategory,
  updateCategory,
  deleteCategory,
} from "@/server/actions/category.actions"
import type { SerializedCategory } from "@/lib/queries/category.queries"
import "@/styles/dashboard.css"
import "@/styles/categories.css"

interface Props {
  categories: SerializedCategory[]
}

type OptimisticAction =
  | { type: "add";    category: SerializedCategory }
  | { type: "update"; id: string; patch: Partial<SerializedCategory> }
  | { type: "delete"; id: string }

export function CategoryList({ categories }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()

  // ── Tab filter state ────────────────────────────────────────
  const [typeFilter, setTypeFilter] = useState<"ALL" | "EXPENSE" | "INCOME">("ALL")

  // ── Optimistic state ────────────────────────────────────────
  const [optimisticCategories, addOptimistic] = useOptimistic(
    categories,
    (state: SerializedCategory[], action: OptimisticAction) => {
      switch (action.type) {
        case "add":
          return [...state, action.category]
        case "update":
          return state.map((c) => c.id === action.id ? { ...c, ...action.patch } : c)
        case "delete":
          return state.filter((c) => c.id !== action.id)
        default:
          return state
      }
    }
  )

  const [optimisticIds, setOptimisticIds] = useState<Set<string>>(new Set())

  // ── Modal state ────────────────────────────────────────────
  const [modalOpen,   setModalOpen]   = useState(false)
  const [editTarget,  setEditTarget]  = useState<SerializedCategory | null>(null)
  const [formLoading, setFormLoading] = useState(false)

  // ── Modal trigger helpers ──────────────────────────────────
  function openCreate() { setEditTarget(null); setModalOpen(true) }
  function openEdit(c: SerializedCategory) { setEditTarget(c); setModalOpen(true) }
  function closeModal() { setModalOpen(false); setEditTarget(null) }

  function markInFlight(id: string) { setOptimisticIds((prev) => new Set([...prev, id])) }
  function clearInFlight(id: string) { setOptimisticIds((prev) => { const n = new Set(prev); n.delete(id); return n }) }

  // ── Synthesise optimistic Category row ──────────────────────
  function buildOptimisticCat(values: CategoryFormValues): SerializedCategory {
    return {
      id:        `optimistic-${Date.now()}`,
      userId:    "user-id",
      name:      values.name,
      type:      values.type,
      icon:      values.icon || null,
      color:     values.color || null,
      isDefault: false,
      createdAt: new Date().toISOString(),
      _count:    { transactions: 0 },
    }
  }

  // ── Create ─────────────────────────────────────────────────
  async function handleCreate(values: CategoryFormValues) {
    setFormLoading(true)
    const optimistic = buildOptimisticCat(values)

    addOptimistic({ type: "add", category: optimistic })

    const result = await createCategory({
      name:  values.name,
      type:  values.type,
      icon:  values.icon,
      color: values.color,
    })

    setFormLoading(false)

    if (!result.success) {
      toast.error(result.error ?? "Failed to create category.")
      startTransition(() => { router.refresh() })
      return { error: result.error, fieldErrors: result.fieldErrors }
    }

    toast.success("Category added successfully!")
    closeModal()
    startTransition(() => { router.refresh() })
  }

  // ── Update ─────────────────────────────────────────────────
  async function handleUpdate(values: CategoryFormValues) {
    if (!editTarget) return
    setFormLoading(true)

    markInFlight(editTarget.id)
    addOptimistic({
      type:  "update",
      id:    editTarget.id,
      patch: {
        name:  values.name,
        type:  values.type,
        icon:  values.icon || null,
        color: values.color || null,
      },
    })

    const result = await updateCategory(editTarget.id, {
      name:  values.name,
      type:  values.type,
      icon:  values.icon,
      color: values.color,
    })

    clearInFlight(editTarget.id)
    setFormLoading(false)

    if (!result.success) {
      toast.error(result.error ?? "Failed to update category.")
      startTransition(() => { router.refresh() })
      return { error: result.error, fieldErrors: result.fieldErrors }
    }

    toast.success("Category updated!")
    closeModal()
    startTransition(() => { router.refresh() })
  }

  // ── Delete ─────────────────────────────────────────────────
  const handleDelete = useCallback((c: SerializedCategory) => {
    const confirmMsg = c._count && c._count.transactions > 0
      ? `This category is currently linked to ${c._count.transactions} transaction(s).\n\nDeleting it will move those transactions to "Uncategorized". Proceed?`
      : "Are you sure you want to delete this custom category?";

    if (!confirm(confirmMsg)) return

    startTransition(async () => {
      markInFlight(c.id)
      addOptimistic({ type: "delete", id: c.id })

      const result = await deleteCategory(c.id)
      clearInFlight(c.id)

      if (!result.success) {
        toast.error(result.error ?? "Failed to delete category.")
        router.refresh()
        return
      }

      toast.success("Category deleted.")
      router.refresh()
    })
  }, [addOptimistic, router, toast, startTransition])

  // ── Filtered items ──────────────────────────────────────────
  const filtered = optimisticCategories.filter((c) => {
    if (typeFilter === "ALL") return true
    return c.type === typeFilter
  })

  return (
    <div className="cat-module">
      {/* Header */}
      <div className="txn-header">
        <div className="txn-header__left">
          <h1 className="txn-header__title">Categories</h1>
          <span className="txn-header__count">
            {filtered.length} categories shown
          </span>
        </div>
        <div className="txn-header__actions">
          <button type="button" className="btn btn--primary" onClick={openCreate} disabled={isPending}>
            + Add Category
          </button>
        </div>
      </div>

      {/* Type Filter Tabs */}
      <div className="txn-filters__row" style={{ marginTop: "0.5rem" }}>
        <div className="txn-filters__types" role="group" aria-label="Filter category types">
          {(["ALL", "EXPENSE", "INCOME"] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`txn-filter-chip${typeFilter === t ? " txn-filter-chip--active" : ""}`}
              onClick={() => setTypeFilter(t)}
            >
              {t === "ALL" ? "📂 All" : t === "EXPENSE" ? "📤 Expenses" : "📥 Income"}
            </button>
          ))}
        </div>
      </div>

      {isPending && <div className="txn-loading-bar" />}

      {/* Grid of categories */}
      <div className="cat-grid">
        {filtered.map((c) => {
          const isPendingItem = optimisticIds.has(c.id)
          const txCount       = c._count?.transactions ?? 0

          return (
            <div
              key={c.id}
              className={`cat-card${isPendingItem ? " cat-card--pending" : ""}${c.isDefault ? " cat-card--default" : ""}`}
            >
              {/* Top border color strip */}
              <div className="cat-card__color" style={{ backgroundColor: c.color ?? "#64748b" }} />

              <div className="cat-card__body">
                <div className="cat-card__header">
                  <span className="cat-card__icon">{c.icon ?? "📦"}</span>
                  <div className="cat-card__title-wrap">
                    <h3 className="cat-card__name">{c.name}</h3>
                    <span className="cat-card__type-tag" data-type={c.type}>
                      {c.type}
                    </span>
                  </div>
                </div>

                <div className="cat-card__stats">
                  <span className="cat-card__stat-label">Transactions</span>
                  <span className="cat-card__stat-value">{txCount.toLocaleString()}</span>
                </div>

                {/* Actions */}
                <div className="cat-card__actions">
                  {c.isDefault ? (
                    <span className="cat-card__system-badge">System Default</span>
                  ) : isPendingItem ? (
                    <span className="spinner spinner--sm" />
                  ) : (
                    <>
                      <button
                        type="button"
                        className="cat-card__action-btn"
                        onClick={() => openEdit(c)}
                        aria-label={`Edit ${c.name}`}
                      >
                        ✏️ Edit
                      </button>
                      <button
                        type="button"
                        className="cat-card__action-btn cat-card__action-btn--delete"
                        onClick={() => handleDelete(c)}
                        aria-label={`Delete ${c.name}`}
                      >
                        🗑️ Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal form */}
      <CategoryForm
        open={modalOpen}
        onClose={closeModal}
        onSubmit={editTarget ? handleUpdate : handleCreate}
        initial={editTarget}
        loading={formLoading}
      />
    </div>
  )
}