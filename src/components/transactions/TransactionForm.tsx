/**
 * Transaction Form — Create & Edit Modal
 * Path: src/components/transactions/TransactionForm.tsx
 *
 * Controlled form (no FormData) — values are passed as a plain object
 * to the parent's onSubmit handler which calls the server action.
 *
 * Amount: user types rupees (e.g. "1250.50"); displayed with ₹ prefix.
 * The Zod schema in the server action converts to paise.
 */

"use client"

import { useState, useEffect } from "react"
import { Modal } from "@/components/ui/Modal"
import type { SerializedTransaction } from "@/lib/queries/transaction.queries"
import type { AccountOption, CategoryOption } from "@/lib/queries/transaction.queries"
import { todayInputDate, toInputDate } from "@/lib/utils/format"

// ── Types ─────────────────────────────────────────────────────

export interface TransactionFormValues {
  type:                "INCOME" | "EXPENSE" | "TRANSFER"
  accountId:           string
  categoryId:          string
  description:         string
  amount:              string   // rupees string
  transactionDate:     string   // YYYY-MM-DD
  notes:               string
  tags:                string[]
  transferToAccountId: string
}

interface Props {
  open:       boolean
  onClose:    () => void
  onSubmit:   (values: TransactionFormValues) => Promise<{ error?: string; fieldErrors?: Record<string, string[]> } | void>
  initial?:   SerializedTransaction | null
  accounts:   AccountOption[]
  categories: CategoryOption[]
  loading?:   boolean
}

const EMPTY: TransactionFormValues = {
  type:                "EXPENSE",
  accountId:           "",
  categoryId:          "",
  description:         "",
  amount:              "",
  transactionDate:     todayInputDate(),
  notes:               "",
  tags:                [],
  transferToAccountId: "",
}

// ── Component ─────────────────────────────────────────────────

export function TransactionForm({ open, onClose, onSubmit, initial, accounts, categories, loading }: Props) {
  const [values, setValues]         = useState<TransactionFormValues>(EMPTY)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [tagInput, setTagInput]       = useState("")
  const [showNotes, setShowNotes]     = useState(false)

  // Sync form when editing an existing transaction
  useEffect(() => {
    if (initial) {
      setValues({
        type:                initial.type,
        accountId:           initial.accountId,
        categoryId:          initial.categoryId ?? "",
        description:         initial.description,
        amount:              (initial.amount / 100).toFixed(2),  // paise → rupees
        transactionDate:     toInputDate(initial.transactionDate),
        notes:               initial.notes ?? "",
        tags:                initial.tags,
        transferToAccountId: initial.transferToAccountId ?? "",
      })
      setShowNotes(!!initial.notes)
    } else {
      setValues({ ...EMPTY, accountId: accounts[0]?.id ?? "" })
      setShowNotes(false)
    }
    setFieldErrors({})
    setGlobalError(null)
    setTagInput("")
  }, [initial, open, accounts])

  function set<K extends keyof TransactionFormValues>(key: K, val: TransactionFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: val }))
    setFieldErrors((prev) => { const n = { ...prev }; delete n[key]; return n })
  }

  function addTag() {
    const tag = tagInput.trim().toLowerCase()
    if (!tag || values.tags.includes(tag) || values.tags.length >= 10) return
    set("tags", [...values.tags, tag])
    setTagInput("")
  }

  function removeTag(tag: string) {
    set("tags", values.tags.filter((t) => t !== tag))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setGlobalError(null)
    setFieldErrors({})

    const result = await onSubmit(values)
    if (result?.error)       setGlobalError(result.error)
    if (result?.fieldErrors) setFieldErrors(result.fieldErrors)
  }

  const expenseCategories = categories.filter((c) => c.type === "EXPENSE")
  const incomeCategories  = categories.filter((c) => c.type === "INCOME")
  const filteredCats = values.type === "INCOME" ? incomeCategories : expenseCategories

  const isTransfer = values.type === "TRANSFER"
  const title      = initial ? "Edit Transaction" : "Add Transaction"

  function err(field: string) {
    return fieldErrors[field]?.[0]
  }

  return (
    <Modal open={open} onClose={onClose} title={title} size="md">
      <form onSubmit={handleSubmit} className="txn-form" noValidate>

        {/* Global error */}
        {globalError && (
          <div className="form-banner form-banner--error" role="alert">{globalError}</div>
        )}

        {/* Type tabs */}
        <div className="form-type-tabs" role="group" aria-label="Transaction type">
          {(["EXPENSE", "INCOME", "TRANSFER"] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`form-type-tab form-type-tab--${t.toLowerCase()}${values.type === t ? " active" : ""}`}
              onClick={() => { set("type", t); set("categoryId", "") }}
            >
              {t === "EXPENSE" ? "📤 Expense" : t === "INCOME" ? "📥 Income" : "🔁 Transfer"}
            </button>
          ))}
        </div>

        {/* Amount */}
        <div className="form-row">
          <label className="form-label" htmlFor="amount">Amount</label>
          <div className="form-amount-wrap">
            <span className="form-amount-prefix">₹</span>
            <input
              id="amount"
              type="number"
              step="0.01"
              min="0.01"
              className={`form-input form-input--amount${err("amount") ? " form-input--error" : ""}`}
              placeholder="0.00"
              value={values.amount}
              onChange={(e) => set("amount", e.target.value)}
              required
              disabled={loading}
            />
          </div>
          {err("amount") && <p className="form-error">{err("amount")}</p>}
        </div>

        {/* Description */}
        <div className="form-row">
          <label className="form-label" htmlFor="description">Description</label>
          <input
            id="description"
            type="text"
            className={`form-input${err("description") ? " form-input--error" : ""}`}
            placeholder="e.g. Lunch at office cafeteria"
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
            maxLength={255}
            required
            disabled={loading}
          />
          {err("description") && <p className="form-error">{err("description")}</p>}
        </div>

        {/* Account + Date row */}
        <div className="form-grid-2">
          <div className="form-row">
            <label className="form-label" htmlFor="accountId">Account</label>
            <select
              id="accountId"
              className={`form-select${err("accountId") ? " form-input--error" : ""}`}
              value={values.accountId}
              onChange={(e) => set("accountId", e.target.value)}
              disabled={loading}
            >
              <option value="">Select account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            {err("accountId") && <p className="form-error">{err("accountId")}</p>}
          </div>

          <div className="form-row">
            <label className="form-label" htmlFor="transactionDate">Date</label>
            <input
              id="transactionDate"
              type="date"
              className={`form-input${err("transactionDate") ? " form-input--error" : ""}`}
              value={values.transactionDate}
              max={todayInputDate()}
              onChange={(e) => set("transactionDate", e.target.value)}
              required
              disabled={loading}
            />
            {err("transactionDate") && <p className="form-error">{err("transactionDate")}</p>}
          </div>
        </div>

        {/* Category (not for transfers) */}
        {!isTransfer && (
          <div className="form-row">
            <label className="form-label" htmlFor="categoryId">Category</label>
            <select
              id="categoryId"
              className="form-select"
              value={values.categoryId}
              onChange={(e) => set("categoryId", e.target.value)}
              disabled={loading}
            >
              <option value="">Uncategorized</option>
              {filteredCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon ? `${c.icon} ` : ""}{c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Transfer destination */}
        {isTransfer && (
          <div className="form-row">
            <label className="form-label" htmlFor="transferToAccountId">To Account</label>
            <select
              id="transferToAccountId"
              className={`form-select${err("transferToAccountId") ? " form-input--error" : ""}`}
              value={values.transferToAccountId}
              onChange={(e) => set("transferToAccountId", e.target.value)}
              disabled={loading}
            >
              <option value="">Select destination</option>
              {accounts
                .filter((a) => a.id !== values.accountId)
                .map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            {err("transferToAccountId") && <p className="form-error">{err("transferToAccountId")}</p>}
          </div>
        )}

        {/* Tags */}
        <div className="form-row">
          <label className="form-label">Tags <span className="form-label-hint">(optional, max 10)</span></label>
          <div className="form-tags">
            {values.tags.map((tag) => (
              <span key={tag} className="form-tag">
                {tag}
                <button type="button" onClick={() => removeTag(tag)} aria-label={`Remove ${tag}`}>×</button>
              </span>
            ))}
            {values.tags.length < 10 && (
              <input
                type="text"
                className="form-tag-input"
                placeholder="Add tag + Enter"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); addTag() }
                }}
                maxLength={30}
                disabled={loading}
              />
            )}
          </div>
        </div>

        {/* Notes toggle */}
        <button
          type="button"
          className="form-notes-toggle"
          onClick={() => setShowNotes(!showNotes)}
        >
          {showNotes ? "▾ Hide notes" : "▸ Add notes"}
        </button>
        {showNotes && (
          <div className="form-row">
            <textarea
              id="notes"
              className="form-textarea"
              placeholder="Additional details..."
              value={values.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={3}
              maxLength={1000}
              disabled={loading}
            />
          </div>
        )}

        {/* Actions */}
        <div className="form-actions">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={loading}>
            {loading
              ? <span className="spinner" aria-label="Saving…" />
              : initial ? "Save changes" : "Add transaction"
            }
          </button>
        </div>
      </form>
    </Modal>
  )
}