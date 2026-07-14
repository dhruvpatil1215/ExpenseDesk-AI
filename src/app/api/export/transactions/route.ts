/**
 * Transaction CSV Export — Streaming API Route
 * Path: src/app/api/export/transactions/route.ts
 *
 * GET /api/export/transactions
 *   ?format=csv           (only csv supported here)
 *   &type=EXPENSE         (optional filter)
 *   &categoryId=xxx       (optional)
 *   &accountId=xxx        (optional)
 *   &dateFrom=YYYY-MM-DD  (optional)
 *   &dateTo=YYYY-MM-DD    (optional)
 *   &search=text          (optional)
 *
 * GET /api/export/transactions?report=monthly&year=2026
 *   → Monthly summary CSV
 *
 * GET /api/export/transactions?report=budgets
 *   → Budget report CSV
 *
 * Large dataset handling:
 *   Cursor-based pagination inside the generator.
 *   The HTTP response body is a ReadableStream — no buffering.
 *   A 10,000-row export uses ≈ 1 batch (500 rows) of RAM at any time.
 */

import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import {
  generateTransactionsCsvStream,
  generateMonthlySummaryCsvBuffer,
  generateBudgetReportCsvBuffer,
} from "@/lib/export/csv"

export const runtime    = "nodejs"   // Prisma needs Node runtime
export const dynamic    = "force-dynamic"
export const maxDuration = 60        // Vercel: up to 60s for large exports

export async function GET(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const sp     = req.nextUrl.searchParams
  const report = sp.get("report")    // "monthly" | "budgets" | null
  const now    = new Date()

  // ── Monthly summary CSV ─────────────────────────────────────
  if (report === "monthly") {
    const year    = parseInt(sp.get("year") ?? String(now.getFullYear()), 10)
    const buffer  = await generateMonthlySummaryCsvBuffer(session.user.id, year)
    const filename = `monthly-summary-${year}.csv`

    return new Response(buffer as any, {
      headers: csvHeaders(filename, buffer.length),
    })
  }

  // ── Budget report CSV ───────────────────────────────────────
  if (report === "budgets") {
    const buffer  = await generateBudgetReportCsvBuffer(session.user.id)
    const filename = `budget-report-${now.toISOString().split("T")[0]}.csv`

    return new Response(buffer as any, {
      headers: csvHeaders(filename, buffer.length),
    })
  }

  // ── Transactions CSV (streaming) ────────────────────────────
  const filters = {
    type:       sp.get("type")       ?? undefined,
    categoryId: sp.get("categoryId") ?? undefined,
    accountId:  sp.get("accountId")  ?? undefined,
    dateFrom:   sp.get("dateFrom")   ?? undefined,
    dateTo:     sp.get("dateTo")     ?? undefined,
    search:     sp.get("search")     ?? undefined,
  }

  const dateTag  = now.toISOString().split("T")[0]
  const filename = `transactions-${dateTag}.csv`

  // Build ReadableStream from the async generator
  const generator = generateTransactionsCsvStream(session.user.id, filters as any)
  const stream    = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await generator.next()
      if (done) {
        controller.close()
      } else {
        controller.enqueue(value)
      }
    },
    cancel() {
      // Allow the generator to be garbage-collected if the client disconnects
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type":        "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Transfer-Encoding":   "chunked",
      "Cache-Control":       "no-store",
      "X-Export-Date":       dateTag,
    },
  })
}

// ── Helper ────────────────────────────────────────────────────

function csvHeaders(filename: string, length: number): HeadersInit {
  return {
    "Content-Type":        "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Content-Length":      String(length),
    "Cache-Control":       "no-store",
  }
}