/**
 * AI Insights Response Schema (Zod)
 * Path: src/lib/validators/insights.schema.ts
 *
 * Validates the raw JSON string returned by Gemini before
 * it touches any frontend code. Sanitizes enums and forces
 * integer rounding to prevent structural validation crashes.
 */

import { z } from "zod"

// ── Helpers ───────────────────────────────────────────────────

function safeInt(val: unknown): number {
  if (typeof val === "number") return Math.round(val)
  if (typeof val === "string") {
    const parsed = parseFloat(val)
    if (!isNaN(parsed)) return Math.round(parsed)
  }
  return 0
}

// ── Individual insight ────────────────────────────────────────

export const insightTypeValues = [
  "spending_alert",
  "budget_recommendation",
  "savings_suggestion",
  "positive_trend",
  "category_insight",
] as const

export const insightPriorityValues = ["critical", "high", "medium", "low"] as const

export const AIInsightSchema = z.object({
  id: z.string().min(1).catch(() => `insight-${Date.now()}`),
  type: z.preprocess((val) => {
    const str = String(val).toLowerCase().trim()
    if (insightTypeValues.includes(str as any)) return str
    if (str.includes("alert")) return "spending_alert"
    if (str.includes("budget")) return "budget_recommendation"
    if (str.includes("savings") || str.includes("saving")) return "savings_suggestion"
    if (str.includes("positive") || str.includes("trend")) return "positive_trend"
    return "category_insight"
  }, z.enum(insightTypeValues)),
  priority: z.preprocess((val) => {
    const str = String(val).toLowerCase().trim()
    if (insightPriorityValues.includes(str as any)) return str
    if (str.includes("crit") || str.includes("urgent")) return "critical"
    if (str.includes("high")) return "high"
    if (str.includes("low")) return "low"
    return "medium"
  }, z.enum(insightPriorityValues)),
  title: z.preprocess((val) => String(val || "Financial Alert").slice(0, 100), z.string()),
  description: z.preprocess((val) => String(val || "").slice(0, 600), z.string()),
  action: z.preprocess((val) => val ? String(val).slice(0, 300) : null, z.string().nullable().optional().default(null)),
  impactLabel: z.preprocess((val) => val ? String(val).slice(0, 100) : null, z.string().nullable().optional().default(null)),
  affectedCategory: z.preprocess((val) => val ? String(val).slice(0, 80) : null, z.string().nullable().optional().default(null)),
  amountPaise: z.preprocess((val) => val !== null && val !== undefined ? safeInt(val) : null, z.number().int().nullable().optional().default(null)),
})

export type AIInsight = z.infer<typeof AIInsightSchema>

// ── Category insight ──────────────────────────────────────────

export const CategoryInsightSchema = z.object({
  categoryName: z.preprocess((val) => String(val || "Category"), z.string()),
  amountPaise: z.preprocess(safeInt, z.number().int().nonnegative()),
  percentOfExpense: z.preprocess(safeInt, z.number().int().min(0).max(100)),
  trend: z.preprocess((val) => {
    const str = String(val).toLowerCase().trim()
    if (str.includes("up")) return "up"
    if (str.includes("down")) return "down"
    return "stable"
  }, z.enum(["up", "down", "stable"])),
  trendPct: z.preprocess(safeInt, z.number().int().nonnegative()),
  assessment: z.preprocess((val) => String(val || "").slice(0, 300), z.string()),
})

export type CategoryInsight = z.infer<typeof CategoryInsightSchema>

// ── Budget recommendation ─────────────────────────────────────

export const BudgetRecommendationSchema = z.object({
  categoryName: z.preprocess((val) => String(val || "Category"), z.string()),
  currentSpendPaise: z.preprocess(safeInt, z.number().int().nonnegative()),
  recommendedBudgetPaise: z.preprocess(safeInt, z.number().int().positive().catch(() => 100000)), // fallback to ₹1,000
  reasoning: z.preprocess((val) => String(val || "").slice(0, 300), z.string()),
})

export type BudgetRecommendation = z.infer<typeof BudgetRecommendationSchema>

// ── Full response ─────────────────────────────────────────────

export const AIInsightsResponseSchema = z.object({
  monthlySummary: z.preprocess((val) => String(val || "Analysis generated.").slice(0, 1000), z.string()),
  financialHealthScore: z.preprocess((val) => {
    const score = safeInt(val)
    return Math.max(0, Math.min(100, score))
  }, z.number().int().min(0).max(100)),
  financialHealthLabel: z.preprocess((val) => {
    const str = String(val).trim()
    if (["Excellent", "Good", "Fair", "Needs Attention"].includes(str)) return str
    const l = str.toLowerCase()
    if (l.includes("excellent")) return "Excellent"
    if (l.includes("good")) return "Good"
    if (l.includes("attention") || l.includes("need") || l.includes("poor") || l.includes("bad")) return "Needs Attention"
    return "Fair"
  }, z.enum(["Excellent", "Good", "Fair", "Needs Attention"])),
  savingsPotentialPaise: z.preprocess(safeInt, z.number().int().nonnegative().default(0)),
  insights: z.array(AIInsightSchema).min(1).max(12).catch(() => [
    {
      id: "default-spending-insight",
      type: "category_insight" as const,
      priority: "medium" as const,
      title: "Review Category Budgets",
      description: "Review your category spending patterns to identify monthly savings opportunities.",
      action: "Track custom categories regularly.",
      impactLabel: "Save money MoM",
      affectedCategory: null,
      amountPaise: null
    }
  ]),
  categoryInsights: z.array(CategoryInsightSchema).default([]),
  budgetRecommendations: z.array(BudgetRecommendationSchema).default([]),
  positiveHighlights: z.array(z.preprocess((val) => String(val || "").slice(0, 200), z.string())).max(5).default([]),
})

export type AIInsightsResponse = z.infer<typeof AIInsightsResponseSchema>

// ── Wrapper with metadata (stored / returned to client) ───────

export interface InsightsPayload {
  generatedAt:   number
  periodDays:    number
  periodFrom:    string
  periodTo:      string
  insights:      AIInsightsResponse
  cached:        boolean
  insufficientData: boolean
}