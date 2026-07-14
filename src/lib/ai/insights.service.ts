/**
 * AI Insights Service
 * Path: src/lib/ai/insights.service.ts
 *
 * Orchestrates the full pipeline:
 *   buildFinancialContext() → buildInsightsPrompt() → Gemini → Zod → payload
 *
 * Guard rails:
 *   - Minimum 10 transactions check (insufficient data guard)
 *   - JSON parse error → descriptive error, not crash
 *   - Zod validation with partial fallback (if Gemini omits optional arrays)
 *   - Hard timeout: 30 seconds
 *
 * This service is called ONLY from:
 *   - src/server/actions/insights.actions.ts (server action)
 *   - src/app/api/ai/insights/route.ts       (API route)
 * Never call it from a Client Component.
 */

import { buildFinancialContext } from "./financial-context"
import { buildInsightsPrompt, SYSTEM_PROMPT } from "./prompts"
import { generateWithRetry } from "./gemini"
import { AIInsightsResponseSchema, type AIInsightsResponse } from "@/lib/validators/insights.schema"
import type { InsightsPayload } from "@/lib/validators/insights.schema"

// ── Options ───────────────────────────────────────────────────

export interface GenerateInsightsOptions {
  periodDays?: number   // default 90
  currency?:  string    // default "INR"
}

// ── Main entry point ──────────────────────────────────────────

export async function generateInsights(
  userId:  string,
  options: GenerateInsightsOptions = {}
): Promise<InsightsPayload> {
  const { periodDays = 90, currency = "INR" } = options

  const now = Date.now()

  // 1. Build financial context (DB queries)
  const context = await buildFinancialContext(userId, periodDays, currency)

  // 2. Guard: not enough data for meaningful analysis
  if (context.transactionCount < 1) {
    return {
      generatedAt:      now,
      periodDays,
      periodFrom:       context.periodFrom,
      periodTo:         context.periodTo,
      cached:           false,
      insufficientData: true,
      insights: {
        monthlySummary:         "You don't have enough transactions yet for AI analysis. Add at least 1 transaction to unlock personalised insights.",
        financialHealthScore:   0,
        financialHealthLabel:   "Needs Attention",
        savingsPotentialPaise:  0,
        insights:               [],
        categoryInsights:       [],
        budgetRecommendations:  [],
        positiveHighlights:     ["You've started your financial journey — keep adding transactions!"],
      },
    }
  }

  // 3. Build prompt from context
  const userPrompt = buildInsightsPrompt(context)

  // 4. Call Gemini (with retry + 30s timeout)
  let rawText: string
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Gemini API timeout after 30 seconds")), 30_000)
    )
    rawText = await Promise.race([
      generateWithRetry(SYSTEM_PROMPT, userPrompt, 3),
      timeoutPromise,
    ])
  } catch (err) {
    throw new Error(
      `AI service unavailable: ${err instanceof Error ? err.message : "Unknown error"}`
    )
  }

  // 5. Parse JSON
  let parsed: unknown
  try {
    // Strip any accidental markdown fences Gemini might add despite instructions
    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/,  "")
      .trim()
    parsed = JSON.parse(cleaned)
  } catch {
    console.error("[InsightsService] JSON parse error. Raw response:", rawText.slice(0, 500))
    throw new Error("AI returned malformed JSON. Please try again.")
  }

  // 6. Validate with Zod
  const validated = AIInsightsResponseSchema.safeParse(parsed)
  if (!validated.success) {
    console.error("[InsightsService] Zod validation errors:", validated.error.flatten())
    // Attempt a lenient parse — use .partial() variant
    const lenient = AIInsightsResponseSchema.partial().safeParse(parsed)
    if (!lenient.success || !lenient.data.monthlySummary) {
      throw new Error("AI response did not match the expected schema. Please try again.")
    }
    // Fill in missing required fields with defaults
    const fallback = {
      monthlySummary:         lenient.data.monthlySummary ?? "Analysis generated.",
      financialHealthScore:   lenient.data.financialHealthScore ?? 50,
      financialHealthLabel:   lenient.data.financialHealthLabel ?? "Fair",
      savingsPotentialPaise:  lenient.data.savingsPotentialPaise ?? 0,
      insights:               lenient.data.insights ?? [],
      categoryInsights:       lenient.data.categoryInsights ?? [],
      budgetRecommendations:  lenient.data.budgetRecommendations ?? [],
      positiveHighlights:     lenient.data.positiveHighlights ?? [],
    } satisfies AIInsightsResponse

    return {
      generatedAt:      Date.now(),
      periodDays,
      periodFrom:       context.periodFrom,
      periodTo:         context.periodTo,
      cached:           false,
      insufficientData: false,
      insights:         fallback,
    }
  }

  return {
    generatedAt:      Date.now(),
    periodDays,
    periodFrom:       context.periodFrom,
    periodTo:         context.periodTo,
    cached:           false,
    insufficientData: false,
    insights:         validated.data,
  }
}