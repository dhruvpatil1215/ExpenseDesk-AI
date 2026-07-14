/**
 * Goal Form — Create & Edit Modal
 * Path: src/components/goals/GoalForm.tsx
 */

"use client"

import { useState, useEffect } from "react"
import { Modal } from "@/components/ui/Modal"
import type { SerializedGoal } from "@/lib/queries/goal.queries"

export interface GoalFormValues {
  name:          string
  description:   string
  targetAmount:  string
  currentAmount: string
  targetDate:    string
  icon:          string
  color:         string
}

interface Props {
  open:     boolean
  onClose:  () => void
  onSubmit: (values: GoalFormValues) => Promise<{ error?: string; fieldErrors?: Record<string, string[]> } | void>
  initial?: SerializedGoal | null
  loading?: boolean
}

const PRESET_COLORS = [
  "#10B981", "#3B82F6", "#6366F1", "#A855F7", "#EC4899", 
  "#EF4444", "#F59E0B", "#84CC16", "#06B6D4", "#64748B"
]

const EMPTY: GoalFormValues = {
  name:          "",
  description:   "",
  targetAmount:  "",
  currentAmount: "0",
  targetDate:    "",
  icon:          "",
  color:         "#10B981",
}

export function GoalForm({ open, onClose, onSubmit, initial, loading }: Props) {
  const [values, setValues]         = useState<GoalFormValues>(EMPTY)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [globalError, setGlobalError] = useState<string | null>(null)

  useEffect(() => {
    if (initial) {
      setValues({
        name:          initial.name,
        description:   initial.description ?? "",
        targetAmount:  (initial.targetAmount / 100).toFixed(2),
        currentAmount: (initial.currentAmount / 100).toFixed(2),
        targetDate:    initial.targetDate ?? "",
        icon:          initial.icon ?? "",
        color:         initial.color ?? "#10B981",
      })
    } else {
      setValues(EMPTY)
    }
    setFieldErrors({})
    setGlobalError(null)
  }, [initial, open])

  function set<K extends keyof GoalFormValues>(key: K, val: GoalFormValues[K]) {
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

  const title = initial ? "Edit Savings Goal" : "Add Savings Goal"
  const err = (field: string) => fieldErrors[field]?.[0]

  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <form onSubmit={handleSubmit} className="txn-form" noValidate>
        {globalError && (
          <div className="form-banner form-banner--error" role="alert">{globalError}</div>
        )}

        {/* Goal Name */}
        <div className="form-row">
          <label className="form-label" htmlFor="g-name">Goal Name</label>
          <input
            id="g-name"
            type="text"
            className={`form-input${err("name") ? " form-input--error" : ""}`}
            placeholder="e.g. Vacation Fund"
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            required
            maxLength={100}
            disabled={loading}
          />
          {err("name") && <p className="form-error">{err("name")}</p>}
        </div>

        {/* Description */}
        <div className="form-row">
          <label className="form-label" htmlFor="g-desc">Description</label>
          <textarea
            id="g-desc"
            className={`form-input${err("description") ? " form-input--error" : ""}`}
            placeholder="Save money for next summer trip..."
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
            maxLength={500}
            rows={2}
            disabled={loading}
          />
          {err("description") && <p className="form-error">{err("description")}</p>}
        </div>

        {/* Target & Current Amounts */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <div className="form-row">
            <label className="form-label" htmlFor="g-target">Target Amount (INR)</label>
            <input
              id="g-target"
              type="number"
              step="0.01"
              className={`form-input${err("targetAmount") ? " form-input--error" : ""}`}
              placeholder="0.00"
              value={values.targetAmount}
              onChange={(e) => set("targetAmount", e.target.value)}
              required
              disabled={loading}
            />
            {err("targetAmount") && <p className="form-error">{err("targetAmount")}</p>}
          </div>

          <div className="form-row">
            <label className="form-label" htmlFor="g-current">Current Savings (INR)</label>
            <input
              id="g-current"
              type="number"
              step="0.01"
              className={`form-input${err("currentAmount") ? " form-input--error" : ""}`}
              placeholder="0.00"
              value={values.currentAmount}
              onChange={(e) => set("currentAmount", e.target.value)}
              disabled={loading}
            />
            {err("currentAmount") && <p className="form-error">{err("currentAmount")}</p>}
          </div>
        </div>

        {/* Target Date */}
        <div className="form-row">
          <label className="form-label" htmlFor="g-date">Target Date <span className="form-label-hint">(Optional)</span></label>
          <input
            id="g-date"
            type="date"
            className={`form-input${err("targetDate") ? " form-input--error" : ""}`}
            value={values.targetDate}
            onChange={(e) => set("targetDate", e.target.value)}
            disabled={loading}
          />
          {err("targetDate") && <p className="form-error">{err("targetDate")}</p>}
        </div>

        {/* Icon & Color Preset */}
        <div className="form-row">
          <label className="form-label" htmlFor="g-icon">Icon <span className="form-label-hint">(Emoji)</span></label>
          <input
            id="g-icon"
            type="text"
            className={`form-input${err("icon") ? " form-input--error" : ""}`}
            placeholder="e.g. 🏖️ or 🚗"
            value={values.icon}
            onChange={(e) => set("icon", e.target.value)}
            maxLength={50}
            disabled={loading}
          />
          {err("icon") && <p className="form-error">{err("icon")}</p>}
        </div>

        <div className="form-row">
          <label className="form-label">Theme Color</label>
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