/**
 * Client-Side PDF Generator
 * Path: src/lib/export/pdf-generator.ts
 *
 * MUST be imported with dynamic import() from Client Components only:
 *   const { generateMonthlySummaryPdf } = await import("@/lib/export/pdf-generator")
 *
 * Uses:
 *   - jsPDF       — core PDF engine (MIT)
 *   - jspdf-autotable — professional table layouts (MIT)
 *
 * Install: npm install jspdf jspdf-autotable
 *
 * Design decisions:
 *   - Dynamic import → zero impact on initial bundle / SSR
 *   - saveAs pattern → creates a <a> blob URL → click → revoke
 *   - All amounts come from the server as paise integers; we format here
 *   - Consistent brand colours (indigo #6366f1, green #22c55e, red #ef4444)
 */

import type { MonthlySummaryReport, BudgetReport, TransactionReport }
  from "./report-queries"

// ── jsPDF dynamic loader ─────────────────────────────────────

async function loadJsPDF() {
  const [{ jsPDF }, autoTable] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ])
  return { jsPDF, autoTable: autoTable.default }
}

// ── Shared helpers ────────────────────────────────────────────

const formatRs = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR",
    minimumFractionDigits: 2,
  }).format(paise / 100)

function triggerDownload(doc: import("jspdf").jsPDF, filename: string) {
  const blob = doc.output("blob")
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement("a")
  a.href     = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

// Colours
const INDIGO = [99,  102, 241] as [number, number, number]
const GREEN  = [34,  197,  94] as [number, number, number]
const RED    = [239,  68,  68] as [number, number, number]
const AMBER  = [245, 158,  11] as [number, number, number]
const GREY   = [100, 116, 139] as [number, number, number]
const DARK   = [15,   23,  42] as [number, number, number]

function addHeader(doc: import("jspdf").jsPDF, title: string, subtitle: string) {
  const W = doc.internal.pageSize.getWidth()

  // Accent bar
  doc.setFillColor(...INDIGO)
  doc.rect(0, 0, W, 14, "F")

  // App name
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(11)
  doc.setFont("helvetica", "bold")
  doc.text("ExpenseDesk AI", 12, 9)

  // Generated date (right-aligned)
  doc.setFontSize(7)
  doc.setFont("helvetica", "normal")
  doc.text(`Generated ${new Date().toLocaleDateString("en-IN")}`, W - 12, 9, { align: "right" })

  // Title
  doc.setTextColor(...DARK)
  doc.setFontSize(18)
  doc.setFont("helvetica", "bold")
  doc.text(title, 12, 26)

  // Subtitle
  doc.setTextColor(...GREY)
  doc.setFontSize(9)
  doc.setFont("helvetica", "normal")
  doc.text(subtitle, 12, 32)

  // Divider
  doc.setDrawColor(...INDIGO)
  doc.setLineWidth(0.5)
  doc.line(12, 35, W - 12, 35)
}

function addPageNumbers(doc: import("jspdf").jsPDF) {
  const total = (doc as unknown as { internal: { pages: unknown[] } }).internal.pages.length - 1
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(...GREY)
    doc.text(
      `Page ${i} of ${total}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 6,
      { align: "center" }
    )
  }
}

// ── 1. Monthly Summary PDF ────────────────────────────────────

export async function generateMonthlySummaryPdf(data: MonthlySummaryReport): Promise<void> {
  const { jsPDF, autoTable } = await loadJsPDF()
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })

  addHeader(doc,
    `${data.year} Annual Financial Summary`,
    `Report for ${data.userName}  ·  ${data.months.filter(m => m.incomePaise + m.expensePaise > 0).length} active months`
  )

  let y = 42

  // ── Annual totals strip ──────────────────────────────────────
  const stats = [
    { label: "Total Income",   value: formatRs(data.totals.incomePaise),  color: GREEN },
    { label: "Total Expenses", value: formatRs(data.totals.expensePaise), color: RED   },
    { label: "Net Savings",    value: formatRs(data.totals.netPaise),     color: data.totals.netPaise >= 0 ? GREEN : RED },
    { label: "Savings Rate",
      value: data.totals.incomePaise > 0
        ? Math.round((data.totals.netPaise / data.totals.incomePaise) * 100) + "%"
        : "—",
      color: INDIGO },
  ]

  const W      = doc.internal.pageSize.getWidth()
  const boxW   = (W - 24 - 9) / 4
  const boxH   = 16

  stats.forEach((s, i) => {
    const x = 12 + i * (boxW + 3)
    doc.setFillColor(245, 247, 255)
    doc.roundedRect(x, y, boxW, boxH, 2, 2, "F")
    doc.setFontSize(7)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(...GREY)
    doc.text(s.label, x + boxW / 2, y + 5, { align: "center" })
    doc.setFontSize(9)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...s.color)
    doc.text(s.value, x + boxW / 2, y + 12, { align: "center" })
  })

  y += boxH + 6

  // ── Monthly breakdown table ──────────────────────────────────
  autoTable(doc, {
    startY: y,
    head: [["Month", "Income", "Expenses", "Net Savings", "Savings Rate"]],
    body: data.months.map(m => [
      m.label,
      formatRs(m.incomePaise),
      formatRs(m.expensePaise),
      formatRs(m.netPaise),
      m.incomePaise > 0 ? Math.round((m.netPaise / m.incomePaise) * 100) + "%" : "—",
    ]),
    foot: [[
      "TOTAL",
      formatRs(data.totals.incomePaise),
      formatRs(data.totals.expensePaise),
      formatRs(data.totals.netPaise),
      data.totals.incomePaise > 0
        ? Math.round((data.totals.netPaise / data.totals.incomePaise) * 100) + "%"
        : "—",
    ]],
    headStyles:  { fillColor: INDIGO, textColor: [255,255,255], fontStyle: "bold", fontSize: 8 },
    footStyles:  { fillColor: [240,242,255], textColor: DARK, fontStyle: "bold", fontSize: 8 },
    bodyStyles:  { fontSize: 8 },
    alternateRowStyles: { fillColor: [249, 250, 255] },
    columnStyles: {
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "center" },
    },
    margin: { left: 12, right: 12 },
  })

  addPageNumbers(doc)
  triggerDownload(doc, `monthly-summary-${data.year}.pdf`)
}

// ── 2. Budget Report PDF ──────────────────────────────────────

export async function generateBudgetReportPdf(data: BudgetReport): Promise<void> {
  const { jsPDF, autoTable } = await loadJsPDF()
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })

  addHeader(doc,
    "Budget Report",
    `${data.userName}  ·  ${data.budgets.length} active budget${data.budgets.length !== 1 ? "s" : ""}`
  )

  let y = 42

  // Summary strip
  const W    = doc.internal.pageSize.getWidth()
  const sums = [
    { label: "Total Budgets", value: String(data.summary.total), color: INDIGO },
    { label: "On Track",      value: String(data.summary.onTrack), color: GREEN },
    { label: "At Risk",       value: String(data.summary.atRisk),  color: AMBER },
    { label: "Over Budget",   value: String(data.summary.overBudget), color: RED },
    { label: "Total Allocated", value: formatRs(data.summary.totalLimitPaise), color: INDIGO },
    { label: "Total Spent",     value: formatRs(data.summary.totalSpentPaise), color:
        data.summary.totalSpentPaise > data.summary.totalLimitPaise ? RED : GREEN },
  ]

  const boxW = (W - 24 - 15) / 6
  const boxH = 16
  sums.forEach((s, i) => {
    const x = 12 + i * (boxW + 3)
    doc.setFillColor(245, 247, 255)
    doc.roundedRect(x, y, boxW, boxH, 2, 2, "F")
    doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(...GREY)
    doc.text(s.label, x + boxW / 2, y + 5, { align: "center" })
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...s.color)
    doc.text(s.value, x + boxW / 2, y + 12, { align: "center" })
  })

  y += boxH + 6

  // Budget table
  autoTable(doc, {
    startY: y,
    head: [["Budget / Category", "Period", "Limit", "Spent", "Remaining", "Used %", "Status", "Days Left"]],
    body: data.budgets.map(b => [
      `${b.name}\n${b.categoryName !== b.name ? b.categoryName : ""}`,
      `${b.periodStart} → ${b.periodEnd}`,
      formatRs(b.limitPaise),
      formatRs(b.spentPaise),
      formatRs(b.remainingPaise),
      b.utilisationPct + "%",
      b.status,
      String(b.daysRemaining),
    ]),
    headStyles:  { fillColor: INDIGO, textColor: [255,255,255], fontStyle: "bold", fontSize: 7 },
    bodyStyles:  { fontSize: 7 },
    alternateRowStyles: { fillColor: [249, 250, 255] },
    didParseCell: (hookData: any) => {
      // Colour the Status column based on value
      if (hookData.column.index === 6 && hookData.row.raw) {
        const status = String((hookData.row.raw as string[])[6] ?? "")
        if (status === "Over Budget") hookData.cell.styles.textColor = RED
        else if (status === "At Risk") hookData.cell.styles.textColor = AMBER
        else hookData.cell.styles.textColor = GREEN
        hookData.cell.styles.fontStyle = "bold"
      }
      // Right-align monetary columns
      if ([2,3,4].includes(hookData.column.index)) {
        (hookData.cell.styles as { halign: string }).halign = "right"
      }
    },
    margin: { left: 12, right: 12 },
  })

  addPageNumbers(doc)
  triggerDownload(doc, `budget-report-${new Date().toISOString().split("T")[0]}.pdf`)
}

// ── 3. Transaction Report PDF ─────────────────────────────────

export async function generateTransactionReportPdf(data: TransactionReport): Promise<void> {
  const { jsPDF, autoTable } = await loadJsPDF()
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })

  const subtitle = data.limitApplied
    ? `Showing first 500 of ${data.totalRows.toLocaleString()} rows · Use CSV export for full data`
    : `${data.transactions.length} transactions · ${data.userName}`

  addHeader(doc, "Transaction Report", subtitle)

  autoTable(doc, {
    startY: 42,
    head: [["Date", "Description", "Type", "Category", "Account", "Amount", "Status"]],
    body: data.transactions.map(t => [
      t.date,
      t.description,
      t.type,
      t.category,
      t.account,
      formatRs(t.amountPaise),
      t.status,
    ]),
    headStyles:  { fillColor: INDIGO, textColor: [255,255,255], fontStyle: "bold", fontSize: 7 },
    bodyStyles:  { fontSize: 6.5 },
    alternateRowStyles: { fillColor: [249, 250, 255] },
    didParseCell: (hookData: any) => {
      if (hookData.column.index === 2) {
        const type = String((hookData.row.raw as string[])[2] ?? "")
        hookData.cell.styles.textColor =
          type === "INCOME"   ? GREEN :
          type === "EXPENSE"  ? RED   : INDIGO
      }
      if (hookData.column.index === 5) {
        hookData.cell.styles.halign = "right"
      }
    },
    margin: { left: 12, right: 12 },
  })

  if (data.limitApplied) {
    const lastY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? 150
    doc.setFontSize(7)
    doc.setTextColor(...AMBER)
    doc.text(
      `⚠ Report limited to 500 rows. Export as CSV to download all ${data.totalRows.toLocaleString()} transactions.`,
      12,
      lastY + 6
    )
  }

  addPageNumbers(doc)

  const dateTag = new Date().toISOString().split("T")[0]
  triggerDownload(doc, `transactions-${dateTag}.pdf`)
}