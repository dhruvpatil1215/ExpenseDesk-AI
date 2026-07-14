/**
 * Report Data API Route (JSON — for client-side PDF generation)
 * Path: src/app/api/export/report/route.ts
 *
 * GET /api/export/report?type=monthly&year=2026
 *   → MonthlySummaryReport JSON
 *
 * GET /api/export/report?type=budgets
 *   → BudgetReport JSON
 *
 * GET /api/export/report?type=transactions&dateFrom=...&dateTo=...&...
 *   → TransactionReport JSON (max 500 rows — use CSV for full data)
 *
 * Why JSON instead of PDF on the server?
 *   - Eliminates heavy server-side PDF libraries (pdfkit, puppeteer)
 *   - No executable binary dependencies → works on every hosting platform
 *   - jsPDF + autotable generate identical PDFs client-side
 *   - Reduces server memory usage for concurrent PDF requests
 */

import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import {
  getMonthlySummaryReport,
  getBudgetReport,
  getTransactionReport,
} from "@/lib/export/report-queries"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const sp   = req.nextUrl.searchParams
  const type = sp.get("type") ?? "monthly"

  try {
    switch (type) {
      case "monthly": {
        const year = parseInt(sp.get("year") ?? String(new Date().getFullYear()), 10)
        if (year < 2000 || year > 2100) {
          return NextResponse.json({ error: "Invalid year" }, { status: 400 })
        }
        const data = await getMonthlySummaryReport(session.user.id, year)
        return NextResponse.json({ success: true, data }, cacheHeaders())
      }

      case "budgets": {
        const data = await getBudgetReport(session.user.id)
        return NextResponse.json({ success: true, data }, cacheHeaders())
      }

      case "transactions": {
        const filters: Record<string, string> = {}
        for (const [k, v] of sp.entries()) {
          if (k !== "type" && v) filters[k] = v
        }
        const data = await getTransactionReport(session.user.id, filters)
        return NextResponse.json({ success: true, data }, cacheHeaders())
      }

      default:
        return NextResponse.json({ error: "Unknown report type" }, { status: 400 })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to generate report data."
    console.error("[ExportReport]", msg)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}

function cacheHeaders() {
  return {
    headers: {
      // Short cache: data changes with new transactions
      "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
    },
  }
}