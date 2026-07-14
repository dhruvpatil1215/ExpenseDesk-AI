/**
 * Category Form — Create & Edit Modal
 * Path: src/components/categories/CategoryForm.tsx
 */

"use client"

import { useState, useEffect } from "react"
import { Modal } from "@/components/ui/Modal"
import type { SerializedCategory } from "@/lib/queries/category.queries"

export interface CategoryFormValues {
  name:  string
  type:  "INCOME" | "EXPENSE"
  icon:  string
  color: string
}

interface Props {
  open:    boolean
  onClose: () => void
  onSubmit: (values: CategoryFormValues) => Promise<{ error?: string; fieldErrors?: Record<string, string[]> } | void>
  initial?: SerializedCategory | null
  loading?: boolean
}

const PRESET_COLORS = [
  "#EF4444", "#F97316", "#F59E0B", "#84CC16", "#22C55E", 
  "#06B6D4", "#3B82F6", "#6366F1", "#A855F7", "#EC4899", 
  "#64748B", "#78716C"
]

const EMPTY: CategoryFormValues = {
  name:  "",
  type:  "EXPENSE",
  icon:  "",
  color: "#6366F1",
}

export function CategoryForm({ open, onClose, onSubmit, initial, loading }: Props) {
  const [values, setValues]         = useState<CategoryFormValues>(EMPTY)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [globalError, setGlobalError] = useState<string | null>(null)

  useEffect(() => {
    if (initial) {
      setValues({
        name:  initial.name,
        type:  initial.type,
        icon:  initial.icon ?? "",
        color: initial.color ?? "#6366F1",
      })
    } else {
      setValues(EMPTY)
    }
    setFieldErrors({})
    setGlobalError(null)
  }, [initial, open])

  function set<K extends keyof CategoryFormValues>(key: K, val: CategoryFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: val }))
    setFieldErrors((prev) => { const n = { ...prev }; delete n[key]; return n })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setGlobalError(null)
    setFieldErrors({})

    const result = await onSubmit(values)
    if (result?.error)       setGlobalError(result.error)
    if (result?.fieldErrors) setFieldErrors(result.fieldErrors)
  }

  const title = initial ? "Edit Category" : "Add Category"

  function err(field: string) {
    return fieldErrors[field]?.[0]
  }

  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <form onSubmit={handleSubmit} className="txn-form" noValidate>
        {globalError && (
          <div className="form-banner form-banner--error" role="alert">{globalError}</div>
        )}

        {/* Name */}
        <div className="form-row">
          <label className="form-label" htmlFor="cat-name">Category Name</label>
          <input
            id="cat-name"
            type="text"
            className={`form-input${err("name") ? " form-input--error" : ""}`}
            placeholder="e.g. Groceries"
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            maxLength={80}
            required
            disabled={loading}
          />
          {err("name") && <p className="form-error">{err("name")}</p>}
        </div>

        {/* Type */}
        <div className="form-row">
          <label className="form-label">Type</label>
          <div className="form-type-tabs" style={{ width: "100%" }}>
            {(["EXPENSE", "INCOME"] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={`form-type-tab form-type-tab--${t.toLowerCase()}${values.type === t ? " active" : ""}`}
                onClick={() => set("type", t)}
                disabled={loading}
              >
                {t === "EXPENSE" ? "📤 Expense" : "📥 Income"}
              </button>
            ))}
          </div>
        </div>

        {/* Icon (Emoji descriptor) */}
        <div className="form-row">
          <label className="form-label" htmlFor="cat-icon">Icon <span className="form-label-hint">(Emoji)</span></label>
          <input
            id="cat-icon"
            type="text"
            className={`form-input${err("icon") ? " form-input--error" : ""}`}
            placeholder="e.g. 🍕 or 🛍️"
            value={values.icon}
            onChange={(e) => set("icon", e.target.value)}
            maxLength={50}
            disabled={loading}
          />
          {err("icon") && <p className="form-error">{err("icon")}</p>}
        </div>

        {/* Color presets */}
        <div className="form-row">
          <label className="form-label">Category Color</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", margin: "4px 0" }}>
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className="color-preset"
                style={{
                  backgroundColor: c,
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  border: values.color === c ? "2px solid #fff" : "1px solid rgba(255,255,255,0.15)",
                  cursor: "pointer",
                  transform: values.color === c ? "scale(1.15)" : "none",
                  transition: "transform 0.12s",
                }}
                onClick={() => set("color", c)}
                disabled={loading}
                aria-label={`Select color ${c}`}
              />
            ))}
          </div>
          {err("color") && <p className="form-error">{err("color")}</p>}
        </div>

        {/* Actions */}
        <div className="form-actions">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={loading}>
            {loading ? <span className="spinner" /> : initial ? "Save" : "Add"}
          </button>
        </div>
      </form>
    </Modal>
  )
}