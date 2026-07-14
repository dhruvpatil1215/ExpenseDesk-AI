/**
 * Budget Form — Create & Edit Modal
 * Path: src/components/budgets/BudgetForm.tsx
 */

"use client"

import { useState, useEffect } from "react"
import { Modal } from "@/components/ui/Modal"
import type { SerializedBudget } from "@/lib/queries/budget.queries"
import type { CategoryOption } from "@/lib/queries/transaction.queries"

export interface BudgetFormValues {
  categoryId:     string
  name:           string
  limitAmount:    string
  period:         "WEEKLY" | "MONTHLY" | "YEARLY" | "CUSTOM"
  periodStart:    string
  periodEnd:      string
  rollover:       boolean
  alertAtPercent: number
}

interface Props {
  open:       boolean
  onClose:    () => void
  onSubmit:   (values: BudgetFormValues) => Promise<{ error?: string; fieldErrors?: Record<string, string[]> } | void>
  categories: CategoryOption[]
  initial?:   SerializedBudget | null
  loading?:   boolean
}

const EMPTY: BudgetFormValues = {
  categoryId:     "",
  name:           "",
  limitAmount:    "",
  period:         "MONTHLY",
  periodStart:    "",
  periodEnd:      "",
  rollover:       false,
  alertAtPercent: 80,
}

export function BudgetForm({ open, onClose, onSubmit, categories, initial, loading }: Props) {
  const [values, setValues]         = useState<BudgetFormValues>(EMPTY)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [globalError, setGlobalError] = useState<string | null>(null)

  // Auto-fill dates based on period selection
  useEffect(() => {
    if (initial) return
    const now   = new Date()
    const year  = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, "0")

    if (values.period === "MONTHLY") {
      const lastDay = new Date(year, now.getMonth() + 1, 0).getDate()
      setValues((prev) => ({
        ...prev,
        periodStart: `${year}-${month}-01`,
        periodEnd:   `${year}-${month}-${lastDay}`,
      }))
    } else if (values.period === "WEEKLY") {
      // Current week
      const currentDay = now.getDay()
      const diff = now.getDate() - currentDay + (currentDay === 0 ? -6 : 1) // adjust when day is sunday
      const mon = new Date(now.setDate(diff))
      const sun = new Date(mon)
      sun.setDate(sun.getDate() + 6)
      setValues((prev) => ({
        ...prev,
        periodStart: mon.toISOString().split("T")[0],
        periodEnd:   sun.toISOString().split("T")[0],
      }))
    } else if (values.period === "YEARLY") {
      setValues((prev) => ({
        ...prev,
        periodStart: `${year}-01-01`,
        periodEnd:   `${year}-12-31`,
      }))
    }
  }, [values.period, initial, open])

  useEffect(() => {
    if (initial) {
      setValues({
        categoryId:     initial.categoryId,
        name:           initial.name ?? "",
        limitAmount:    (initial.limitAmount / 100).toFixed(2),
        period:         initial.period,
        periodStart:    initial.periodStart,
        periodEnd:      initial.periodEnd,
        rollover:       initial.rollover,
        alertAtPercent: initial.alertAtPercent,
      })
    } else {
      setValues(EMPTY)
    }
    setFieldErrors({})
    setGlobalError(null)
  }, [initial, open])

  function set<K extends keyof BudgetFormValues>(key: K, val: BudgetFormValues[K]) {
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

  const title = initial ? "Edit Budget" : "Add Budget"
  const err = (field: string) => fieldErrors[field]?.[0]

  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <form onSubmit={handleSubmit} className="txn-form" noValidate>
        {globalError && (
          <div className="form-banner form-banner--error" role="alert">{globalError}</div>
        )}

        {/* Category (only editable on create) */}
        <div className="form-row">
          <label className="form-label" htmlFor="b-category">Category</label>
          <select
            id="b-category"
            className={`form-select${err("categoryId") ? " form-select--error" : ""}`}
            value={values.categoryId}
            onChange={(e) => set("categoryId", e.target.value)}
            disabled={loading || !!initial}
            required
          >
            <option value="">Select Category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon ? c.icon + " " : ""}{c.name}
              </option>
            ))}
          </select>
          {err("categoryId") && <p className="form-error">{err("categoryId")}</p>}
        </div>

        {/* Name */}
        <div className="form-row">
          <label className="form-label" htmlFor="b-name">Budget Label <span className="form-label-hint">(Optional)</span></label>
          <input
            id="b-name"
            type="text"
            className={`form-input${err("name") ? " form-input--error" : ""}`}
            placeholder="e.g. Monthly Grocery Limit"
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            maxLength={100}
            disabled={loading}
          />
          {err("name") && <p className="form-error">{err("name")}</p>}
        </div>

        {/* Limit amount */}
        <div className="form-row">
          <label className="form-label" htmlFor="b-limit">Limit Amount (INR)</label>
          <input
            id="b-limit"
            type="number"
            step="0.01"
            className={`form-input${err("limitAmount") ? " form-input--error" : ""}`}
            placeholder="0.00"
            value={values.limitAmount}
            onChange={(e) => set("limitAmount", e.target.value)}
            required
            disabled={loading}
          />
          {err("limitAmount") && <p className="form-error">{err("limitAmount")}</p>}
        </div>

        {/* Period */}
        <div className="form-row">
          <label className="form-label" htmlFor="b-period">Period</label>
          <select
            id="b-period"
            className="form-select"
            value={values.period}
            onChange={(e) => set("period", e.target.value as any)}
            disabled={loading}
          >
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
            <option value="YEARLY">Yearly</option>
            <option value="CUSTOM">Custom Range</option>
          </select>
        </div>

        {/* Start & End Dates */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <div className="form-row">
            <label className="form-label" htmlFor="b-start">Starts On</label>
            <input
              id="b-start"
              type="date"
              className={`form-input${err("periodStart") ? " form-input--error" : ""}`}
              value={values.periodStart}
              onChange={(e) => set("periodStart", e.target.value)}
              required
              disabled={loading || values.period !== "CUSTOM"}
            />
            {err("periodStart") && <p className="form-error">{err("periodStart")}</p>}
          </div>

          <div className="form-row">
            <label className="form-label" htmlFor="b-end">Ends On</label>
            <input
              id="b-end"
              type="date"
              className={`form-input${err("periodEnd") ? " form-input--error" : ""}`}
              value={values.periodEnd}
              onChange={(e) => set("periodEnd", e.target.value)}
              required
              disabled={loading || values.period !== "CUSTOM"}
            />
            {err("periodEnd") && <p className="form-error">{err("periodEnd")}</p>}
          </div>
        </div>

        {/* Alert threshold */}
        <div className="form-row">
          <label className="form-label" htmlFor="b-alert">Alert Threshold %</label>
          <input
            id="b-alert"
            type="number"
            min="1"
            max="100"
            className="form-input"
            value={values.alertAtPercent}
            onChange={(e) => set("alertAtPercent", parseInt(e.target.value, 10))}
            disabled={loading}
          />
        </div>

        {/* Rollover Toggle */}
        <div className="form-row" style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "0.25rem" }}>
          <input
            id="b-rollover"
            type="checkbox"
            checked={values.rollover}
            onChange={(e) => set("rollover", e.target.checked)}
            disabled={loading}
          />
          <label className="form-label" htmlFor="b-rollover" style={{ marginBottom: 0, cursor: "pointer" }}>
            Enable budget rollover <span className="form-label-hint">(forward leftover limits)</span>
          </label>
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