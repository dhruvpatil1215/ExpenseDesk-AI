/**
 * AI Insights REST API Route
 * Path: src/app/api/ai/insights/route.ts
 *
 * GET  /api/ai/insights?period=90          → returns cached insights
 * POST /api/ai/insights                    → force-refresh (bypasses cache)
 *
 * Auth: reads the NextAuth JWT from the cookie — same as server actions.
 * Rate limit: relies on Vercel Edge functions / Cloudflare for IP limiting.
 *             Add Redis-based rate limiting for self-hosted deployments.
 *
 * This route exists for:
 *   - Future mobile app integrations
 *   - Webhook / scheduled jobs that pre-warm the cache
 *   - Direct API testing with curl / Postman
 */

import { type NextRequest, NextResponse } from "next/server"
import { auth }             from "@/auth"
import { generateInsights } from "@/lib/ai/insights.service"
import { revalidateTag }    from "next/cache"

export const runtime = "nodejs"  // bcryptjs + Prisma need Node runtime
export const maxDuration = 60    // Vercel: allow up to 60s for Gemini calls

// ── GET: return (possibly cached) insights ────────────────────

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const period = (req.nextUrl.searchParams.get("period") ?? "90") as string
  const periodDays = [30, 60, 90].includes(Number(period)) ? Number(period) as 30 | 60 | 90 : 90

  try {
    const payload = await generateInsights(session.user.id, { periodDays })

    return NextResponse.json(
      { success: true, data: payload },
      {
        status: 200,
        headers: {
          // Allows CDN/browser to cache for 30 min; stale-while-revalidate for 1h
          "Cache-Control": "private, max-age=1800, stale-while-revalidate=3600",
          "X-Generated-At": new Date().toISOString(),
          "X-Period-Days":  String(periodDays),
        },
      }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to generate insights."
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}

// ── POST: force refresh ────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let periodDays: 30 | 60 | 90 = 90
  try {
    const body = await req.json().catch(() => ({}))
    if ([30, 60, 90].includes(body.periodDays)) periodDays = body.periodDays
  } catch { /* ignore */ }

  // Invalidate cache for this user
  revalidateTag(`user-insights-${session.user.id}`)

  try {
    const payload = await generateInsights(session.user.id, { periodDays })
    return NextResponse.json({ success: true, data: { ...payload, cached: false } }, { status: 200 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Refresh failed."
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}