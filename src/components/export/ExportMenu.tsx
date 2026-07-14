/**
 * Export Menu Component
 * Path: src/components/export/ExportMenu.tsx
 *
 * A floating dropdown attached to an "Export ↓" trigger button.
 *
 * Items:
 *   CSV group:
 *     - Transactions CSV (respects current filters)
 *     - All Transactions CSV (no filters)
 *     - Monthly Summary CSV (current year)
 *     - Budget Report CSV
 *
 *   PDF group:
 *     - Monthly Summary PDF (current year)
 *     - Budget Report PDF
 *     - Transaction Report PDF (first 500 rows)
 *
 * Flow for CSV:
 *   Click → window.open("/api/export/transactions?...") → browser saves
 *   (streaming response, no client-side buffering)
 *
 * Flow for PDF:
 *   Click → fetch /api/export/report?type=...
 *         → dynamic import jsPDF
 *         → generate PDF in browser
 *         → trigger download
 *
 * activeItemId: tracks which item is loading so each shows its own spinner
 */

"use client"

import { useState, useRef, useEffect } from "react"
import { useToast } from "@/components/ui/Toast"
import "@/styles/export.css"

// ── Types ────────────────────────────────────────────────────

export interface ExportFilters {
  type?:       string
  categoryId?: string
  accountId?:  string
  dateFrom?:   string
  dateTo?:     string
  search?:     string
}

interface Props {
  filters?: ExportFilters   // current active filters (from TransactionList)
}

interface ExportItem {
  id:       string
  label:    string
  hint?:    string
  icon:     string
  group:    "csv" | "pdf"
  action:   () => Promise<void>
}

// ── Helpers ───────────────────────────────────────────────────

function buildCsvUrl(path: string, params: Record<string, string | undefined>): string {
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v) u.set(k, v)
  }
  return `${path}?${u.toString()}`
}

async function fetchReportData<T>(type: string, extra?: Record<string, string>): Promise<T> {
  const p = new URLSearchParams({ type, ...extra })
  const res = await fetch(`/api/export/report?${p.toString()}`)
  if (!res.ok) throw new Error(`Server error ${res.status}`)
  const json = await res.json()
  if (!json.success) throw new Error(json.error ?? "Failed to fetch report data")
  return json.data as T
}

// ── Component ─────────────────────────────────────────────────

export function ExportMenu({ filters = {} }: Props) {
  const [open,          setOpen]          = useState(false)
  const [activeItemId,  setActiveItemId]  = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  const currentYear = new Date().getFullYear()

  // Close on outside click
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleOutside)
    return () => document.removeEventListener("mousedown", handleOutside)
  }, [])

  // ── Action runner ──────────────────────────────────────────
  async function run(item: ExportItem) {
    if (activeItemId) return   // block concurrent exports
    setActiveItemId(item.id)
    setOpen(false)
    try {
      await item.action()
      toast.success(`${item.label} downloaded successfully!`)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : `${item.label} failed. Please try again.`
      )
    } finally {
      setActiveItemId(null)
    }
  }

  // ── CSV download (streaming — just open the URL) ───────────
  function csvDownload(url: string) {
    return async () => {
      const a    = document.createElement("a")
      a.href     = url
      a.download = ""
      a.click()
      // Give the browser 1s to start the download before resolving
      await new Promise(r => setTimeout(r, 1000))
    }
  }

  // ── PDF download ────────────────────────────────────────────
  function pdfDownload(type: "monthly" | "budgets" | "transactions", extra?: Record<string, string>) {
    return async () => {
      const data = await fetchReportData(type, extra)

      // Dynamic import — zero initial bundle impact
      const pdf = await import("@/lib/export/pdf-generator")

      switch (type) {
        case "monthly":
          await pdf.generateMonthlySummaryPdf(data as Parameters<typeof pdf.generateMonthlySummaryPdf>[0])
          break
        case "budgets":
          await pdf.generateBudgetReportPdf(data as Parameters<typeof pdf.generateBudgetReportPdf>[0])
          break
        case "transactions":
          await pdf.generateTransactionReportPdf(data as Parameters<typeof pdf.generateTransactionReportPdf>[0])
          break
      }
    }
  }

  // ── Export item definitions ────────────────────────────────
  const filteredCsvParams = {
    type:       filters.type,
    categoryId: filters.categoryId,
    accountId:  filters.accountId,
    dateFrom:   filters.dateFrom,
    dateTo:     filters.dateTo,
    search:     filters.search,
  }

  const txnFilterExtra: Record<string, string> = {}
  for (const [k, v] of Object.entries(filteredCsvParams)) {
    if (v) txnFilterExtra[k] = v
  }

  const ITEMS: ExportItem[] = [
    // ── CSV ───────────────────────────────────────────────────
    {
      id:     "csv-filtered",
      label:  "Transactions CSV",
      hint:   "Applies current filters",
      icon:   "📊",
      group:  "csv",
      action: csvDownload(buildCsvUrl("/api/export/transactions", filteredCsvParams)),
    },
    {
      id:     "csv-all",
      label:  "All Transactions CSV",
      hint:   "No filters — full history",
      icon:   "📊",
      group:  "csv",
      action: csvDownload("/api/export/transactions"),
    },
    {
      id:     "csv-monthly",
      label:  `Monthly Summary CSV ${currentYear}`,
      hint:   "Income & expenses by category",
      icon:   "📅",
      group:  "csv",
      action: csvDownload(`/api/export/transactions?report=monthly&year=${currentYear}`),
    },
    {
      id:     "csv-budgets",
      label:  "Budget Report CSV",
      hint:   "Active budgets with utilisation",
      icon:   "📋",
      group:  "csv",
      action: csvDownload("/api/export/transactions?report=budgets"),
    },
    // ── PDF ───────────────────────────────────────────────────
    {
      id:     "pdf-monthly",
      label:  `Monthly Summary PDF ${currentYear}`,
      hint:   "Annual overview with tables",
      icon:   "📄",
      group:  "pdf",
      action: pdfDownload("monthly", { year: String(currentYear) }),
    },
    {
      id:     "pdf-budgets",
      label:  "Budget Report PDF",
      hint:   "Budget health & recommendations",
      icon:   "📄",
      group:  "pdf",
      action: pdfDownload("budgets"),
    },
    {
      id:     "pdf-transactions",
      label:  "Transaction Report PDF",
      hint:   "First 500 rows — use CSV for full data",
      icon:   "📄",
      group:  "pdf",
      action: pdfDownload("transactions", txnFilterExtra),
    },
  ]

  const csvItems = ITEMS.filter(i => i.group === "csv")
  const pdfItems = ITEMS.filter(i => i.group === "pdf")

  const isLoading = activeItemId !== null

  return (
    <div className="export-wrap" ref={menuRef}>
      {/* Trigger button */}
      <button
        type="button"
        className={`btn btn--ghost export-trigger${open ? " export-trigger--open" : ""}`}
        onClick={() => setOpen(!open)}
        disabled={isLoading}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {isLoading
          ? <span className="spinner spinner--sm" aria-label="Exporting…" />
          : <span>↓</span>
        }
        Export
        <span className="export-trigger__caret">{open ? "▴" : "▾"}</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="export-menu" role="menu" aria-label="Export options">
          {/* CSV group */}
          <div className="export-group">
            <span className="export-group__label">CSV — Spreadsheet</span>
            {csvItems.map(item => (
              <ExportMenuItem key={item.id} item={item} loading={activeItemId === item.id} onRun={run} />
            ))}
          </div>

          <div className="export-divider" />

          {/* PDF group */}
          <div className="export-group">
            <span className="export-group__label">PDF — Reports</span>
            {pdfItems.map(item => (
              <ExportMenuItem key={item.id} item={item} loading={activeItemId === item.id} onRun={run} />
            ))}
          </div>

          <div className="export-footer">
            <span>💡 Large datasets use CSV for best performance</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Menu item ─────────────────────────────────────────────────

function ExportMenuItem({
  item,
  loading,
  onRun,
}: {
  item:    ExportItem
  loading: boolean
  onRun:   (item: ExportItem) => Promise<void>
}) {
  return (
    <button
      type="button"
      className={`export-item${loading ? " export-item--loading" : ""}`}
      role="menuitem"
      onClick={() => onRun(item)}
      disabled={loading}
    >
      <span className="export-item__icon">
        {loading ? <span className="spinner spinner--sm" /> : item.icon}
      </span>
      <span className="export-item__text">
        <span className="export-item__label">{item.label}</span>
        {item.hint && <span className="export-item__hint">{item.hint}</span>}
      </span>
      {!loading && <span className="export-item__arrow">→</span>}
    </button>
  )
}