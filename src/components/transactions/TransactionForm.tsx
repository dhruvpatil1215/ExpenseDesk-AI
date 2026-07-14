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
import { parseReceiptWithAI } from "@/server/actions/transaction.actions"

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
  receiptUrl?:         string | null
  receiptMimeType?:    string | null
  submitForApproval?:  boolean
  aiRawVendor?:        string | null
  aiRawAmount?:        number | null
  aiRawDate?:          string | null
  aiRawCategory?:      string | null
  aiConfidence?:       number | null
  aiExtractionRaw?:    any
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
  receiptUrl:          null,
  receiptMimeType:     null,
  submitForApproval:   false,
}

// ── Component ─────────────────────────────────────────────────

export function TransactionForm({ open, onClose, onSubmit, initial, accounts, categories, loading }: Props) {
  const [values, setValues]         = useState<TransactionFormValues>(EMPTY)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [tagInput, setTagInput]       = useState("")
  const [showNotes, setShowNotes]     = useState(false)
  const [parsing, setParsing]         = useState(false)
  const [aiSuccess, setAiSuccess]     = useState<string | null>(null)

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
        receiptUrl:          initial.receiptUrl,
        submitForApproval:   initial.status === "PENDING" || (initial.status === "APPROVED" && !!initial.receiptUrl),
      })
      setShowNotes(!!initial.notes)
      setAiSuccess(null)
    } else {
      setValues({ ...EMPTY, accountId: accounts[0]?.id ?? "" })
      setShowNotes(false)
      setAiSuccess(null)
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

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setParsing(true)
    setGlobalError(null)
    setAiSuccess(null)

    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const base64String = (reader.result as string).split(",")[1]
        const mimeType = file.type

        const result = await parseReceiptWithAI(base64String, mimeType)
        if (!result.success || !result.data) {
          setGlobalError(result.error ?? "Failed to parse receipt with AI.")
          return
        }

        const data = result.data

        // Auto-fill values
        setValues((prev) => ({
          ...prev,
          amount: data.amount ? data.amount.toFixed(2) : prev.amount,
          description: data.vendor ? `Expense at ${data.vendor}` : prev.description,
          transactionDate: data.date ? data.date : prev.transactionDate,
          categoryId: data.categoryId ? data.categoryId : prev.categoryId,
          receiptUrl: reader.result as string,
          receiptMimeType: mimeType,
          submitForApproval: true, // Auto check submit for approval when receipt is uploaded
          
          // AI fields for audit
          aiRawVendor: data.vendor,
          aiRawAmount: data.amount ? Math.round(data.amount * 100) : null,
          aiRawDate: data.date,
          aiRawCategory: categories.find((c) => c.id === data.categoryId)?.name || null,
          aiConfidence: data.confidence,
        }))

        setAiSuccess(`✨ AI auto-filled details with ${Math.round(data.confidence * 100)}% confidence!`)

      } catch (err) {
        setGlobalError("Failed to process file.")
      } finally {
        setParsing(false)
      }
    }
    reader.onerror = () => {
      setGlobalError("Error reading file.")
      setParsing(false)
    }
    reader.readAsDataURL(file)
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

        {/* Receipt Upload (AI Capture) */}
        {values.type === "EXPENSE" && (
          <div className="form-row" style={{
            background: "rgba(129, 140, 248, 0.04)",
            border: "1px dashed rgba(129, 140, 248, 0.3)",
            borderRadius: "8px",
            padding: "1rem",
            marginBottom: "1rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label className="form-label" style={{ margin: 0, textTransform: "none", fontSize: "0.85rem", fontWeight: "600", color: "var(--color-text)" }}>
                📄 Receipt Capture (AI-Powered)
              </label>
              {parsing && <span className="auth-spinner" style={{ width: "12px", height: "12px", border: "1.5px solid rgba(255,255,255,0.3)", borderTopColor: "#fff" }} />}
            </div>
            
            <input
              type="file"
              accept="image/png, image/jpeg, image/webp"
              onChange={handleFileChange}
              disabled={parsing || loading}
              style={{
                fontSize: "0.825rem",
                color: "var(--color-text-muted)",
                width: "100%",
                cursor: "pointer"
              }}
            />
            <p style={{ margin: 0, fontSize: "0.725rem", color: "var(--color-text-muted)" }}>
              Upload JPG, PNG, or WEBP. Gemini will scan and auto-fill your expense details.
            </p>

            {aiSuccess && (
              <p style={{ margin: 0, fontSize: "0.75rem", color: "#86efac", fontWeight: "500" }}>{aiSuccess}</p>
            )}

            {values.receiptUrl && !aiSuccess && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
                <span style={{ fontSize: "0.75rem", color: "#86efac" }}>✓ Receipt attached</span>
                <button 
                  type="button" 
                  onClick={() => setValues((prev) => ({ ...prev, receiptUrl: null, receiptMimeType: null }))}
                  style={{ background: "none", border: "none", color: "#fca5a5", fontSize: "0.725rem", cursor: "pointer", padding: 0 }}
                >
                  Remove
                </button>
              </div>
            )}
          </div>
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

        {/* Business Approval Checkbox */}
        {values.type === "EXPENSE" && (
          <div className="form-row" style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem", marginBottom: "1rem" }}>
            <input
              id="submitForApproval"
              type="checkbox"
              checked={values.submitForApproval || false}
              onChange={(e) => set("submitForApproval", e.target.checked)}
              disabled={loading}
              style={{ width: "16px", height: "16px", cursor: "pointer" }}
            />
            <label htmlFor="submitForApproval" className="form-label" style={{ margin: 0, cursor: "pointer", fontSize: "0.85rem", textTransform: "none", color: "var(--color-text)", fontWeight: "500" }}>
              Submit as business expense for manager approval
            </label>
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