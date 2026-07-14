/**
 * AI Insights Server Actions
 * Path: src/server/actions/insights.actions.ts
 *
 * Caching strategy:
 *   - getInsights()     → cached per (userId, periodDays) for 1 hour
 *   - refreshInsights() → bypasses cache via revalidateTag()
 *
 * Why cache?
 *   Gemini calls cost tokens and take 5-15 seconds. Insights don't change
 *   meaningfully within an hour for most users. Caching gives instant
 *   load on repeated visits while allowing manual refresh.
 *
 * Cache key: "insights-{userId}-{periodDays}"
 * Cache tag:  "user-insights-{userId}"  (used by revalidateTag)
 */

"use server"

import { unstable_cache, revalidateTag } from "next/cache"
import { requireAuth }      from "@/lib/session"
import { generateInsights } from "@/lib/ai/insights.service"
import type { InsightsPayload } from "@/lib/validators/insights.schema"

// ── Return type ───────────────────────────────────────────────

export interface InsightsActionResult {
  success:  boolean
  data?:    InsightsPayload
  error?:   string
}

// ── Cache TTL ─────────────────────────────────────────────────

const CACHE_TTL_SECONDS = 60 * 60   // 1 hour

// ── getInsights (cached) ──────────────────────────────────────

export async function getInsights(
  periodDays: 30 | 60 | 90 = 90
): Promise<InsightsActionResult> {
  const user = await requireAuth()

  // Build the cached fetcher bound to this user+period
  const cached = unstable_cache(
    async () => generateInsights(user.id, {
      periodDays,
      currency: "INR",
    }),
    [`insights-${user.id}-${periodDays}`],
    {
      revalidate: CACHE_TTL_SECONDS,
      tags:       [`user-insights-${user.id}`],
    }
  )

  try {
    const payload = await cached()
    return { success: true, data: { ...payload, cached: true } }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate insights."
    console.error("[InsightsAction] getInsights error:", message)
    return { success: false, error: message }
  }
}

// ── refreshInsights (bypass cache) ───────────────────────────

/**
 * Forces a fresh Gemini call by invalidating the cache tag,
 * then generating new insights immediately.
 */
export async function refreshInsights(
  periodDays: 30 | 60 | 90 = 90
): Promise<InsightsActionResult> {
  const user = await requireAuth()

  // Invalidate all cached insights for this user
  revalidateTag(`user-insights-${user.id}`)

  try {
    const payload = await generateInsights(user.id, { periodDays, currency: "INR" })
    return { success: true, data: { ...payload, cached: false } }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to refresh insights."
    console.error("[InsightsAction] refreshInsights error:", message)
    return { success: false, error: message }
  }
}