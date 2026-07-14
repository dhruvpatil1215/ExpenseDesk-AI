/**
 * AI Prompt Engineering
 * Path: src/lib/ai/prompts.ts
 *
 * Two-part prompt design:
 *
 * 1. SYSTEM PROMPT — sets Gemini's persona, rules, and output contract.
 *    Never includes user data. Describes the expected JSON schema in detail.
 *
 * 2. USER MESSAGE — built by buildInsightsPrompt() at request time.
 *    Contains the serialised FinancialContext (real user data).
 *
 * Design decisions:
 *   - Amounts always in PAISE (integers) so Gemini never misformats decimals
 *   - Schema is explicit and exhaustive to prevent hallucination
 *   - Examples in schema hints nudge the model toward correct output
 *   - "Think step by step" instruction improves reasoning quality
 *   - Negative constraints ("do NOT invent data") are explicit
 */

import type { FinancialContext } from "./financial-context"

// ── JSON Response Schema ───────────────────────────────────────
// Embedded in the system prompt so Gemini knows the exact contract.

const RESPONSE_SCHEMA = `
{
  "monthlySummary": "string — 3-4 sentences. Summarise the user's financial health. Be specific: use real numbers from the data. Mention the savings rate, biggest expense category, and one positive / one area to improve.",

  "financialHealthScore": "integer 0-100. Score based on: savings rate (40pts), budget adherence (30pts), spending trends (20pts), goal progress (10pts). Lower score = needs more attention.",

  "financialHealthLabel": "one of: 'Excellent' (85-100) | 'Good' (65-84) | 'Fair' (45-64) | 'Needs Attention' (0-44)",

  "savingsPotentialPaise": "integer — estimated paise the user could save per month by following the recommendations. Base this on over-budget categories + unusual spends.",

  "insights": [
    {
      "id": "string — short unique key e.g. 'food-overspend-1'",
      "type": "one of: spending_alert | budget_recommendation | savings_suggestion | positive_trend | category_insight",
      "priority": "one of: critical | high | medium | low",
      "title": "string — 5-8 words. Direct and specific.",
      "description": "string — 2-3 sentences. What is happening and why it matters. Use real numbers.",
      "action": "string | null — The single most important thing the user should do. Start with a verb. e.g. 'Set a ₹3,000/month budget for Food & Dining'",
      "impactLabel": "string | null — Quantified impact e.g. 'Save ₹2,400/month' or 'Reduce food spend by 20%'",
      "affectedCategory": "string | null — Category name from the data, or null if general",
      "amountPaise": "integer | null — The primary amount referenced in this insight (in paise)"
    }
  ],

  "categoryInsights": [
    {
      "categoryName": "string",
      "amountPaise": "integer",
      "percentOfExpense": "integer 0-100",
      "trend": "up | down | stable",
      "trendPct": "integer — absolute change %",
      "assessment": "string — 1 sentence assessment e.g. 'Up 18% from last quarter. Consider meal prepping to reduce delivery costs.'"
    }
  ],

  "budgetRecommendations": [
    {
      "categoryName": "string",
      "currentSpendPaise": "integer",
      "recommendedBudgetPaise": "integer — realistic cap based on trend",
      "reasoning": "string — 1-2 sentences"
    }
  ],

  "positiveHighlights": ["string — max 3 items, each a specific positive observation from the data"]
}
`

// ── System Prompt ─────────────────────────────────────────────

export const SYSTEM_PROMPT = `You are an expert personal finance analyst embedded in ExpenseDesk AI, a financial management platform.

YOUR ROLE:
Analyse real transaction data and generate clear, actionable, personalised financial insights that help users make better money decisions.

STRICT RULES — follow every one:
1. DATA ONLY: Every number, category name, and claim must come from the financial data provided. Never invent transactions or amounts.
2. AMOUNTS IN PAISE: All monetary values in your JSON response must be integers representing paise (Indian Rupees × 100). Example: ₹1,250 = 125000.
3. LANGUAGE: Direct, professional, empathetic. No jargon. No filler. No "I think" or "you might want to consider".
4. SPECIFICITY: Replace vague advice ("spend less") with specific advice ("Reduce Food & Dining from ₹8,200 to ₹6,000 by limiting restaurant visits to twice a week").
5. POSITIVITY: Always include at least one positive highlight. Balance criticism with encouragement.
6. JSON ONLY: Return ONLY the raw JSON object matching the schema below. No markdown code fences, no explanations, no preamble.
7. INSIGHTS COUNT: Generate between 4 and 8 insights total. Prioritise: critical > high > medium > low.
8. BUDGET RECOMMENDATIONS: Only recommend budgets for categories where the user is over budget or trending up significantly.
9. THINK STEP BY STEP internally before writing the JSON, but only output the JSON.

RESPONSE SCHEMA (return exactly this structure):
${RESPONSE_SCHEMA}

CURRENCY DISPLAY HINT for your descriptions (NOT for JSON values):
When mentioning amounts in description/action/assessment text, format as ₹X,XXX (rupees with commas). JSON values remain in paise integers.`

// ── User prompt builder ───────────────────────────────────────

export function buildInsightsPrompt(ctx: FinancialContext): string {
  // Format paise as rupees string for readability in the prompt
  const r = (paise: number) =>
    `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

  return `Analyse the following ${ctx.periodDays}-day financial data (${ctx.periodFrom} to ${ctx.periodTo}) and generate comprehensive insights.

=== FINANCIAL SUMMARY ===
Currency:          ${ctx.currency}
Total Income:      ${r(ctx.totalIncomePaise)} (${ctx.totalIncomePaise} paise)
Total Expenses:    ${r(ctx.totalExpensePaise)} (${ctx.totalExpensePaise} paise)
Net Savings:       ${r(ctx.netPaise)} (${ctx.netPaise} paise)
Savings Rate:      ${ctx.savingsRatePct}%
Avg Daily Spend:   ${r(ctx.avgDailySpendPaise)}
Total Transactions:${ctx.transactionCount}
Unique Categories: ${ctx.uniqueCategories}

Previous Period (${ctx.periodDays} days before):
  Income:          ${r(ctx.prevTotalIncomePaise)} (${ctx.prevTotalIncomePaise} paise)
  Expenses:        ${r(ctx.prevTotalExpensePaise)} (${ctx.prevTotalExpensePaise} paise)

=== MONTHLY BREAKDOWN ===
${ctx.monthlyTotals.map(m =>
  `${m.month}: Income ${r(m.incomePaise)}, Expenses ${r(m.expensePaise)}, Net ${r(m.incomePaise - m.expensePaise)}`
).join("\n")}

=== EXPENSE CATEGORIES (top ${ctx.expenseCategories.length}) ===
${ctx.expenseCategories.map((c, i) =>
  `${i + 1}. ${c.name} (${c.icon ?? "—"}): ${r(c.currentPaise)} (${c.percentOfTotal}% of total expenses), ${c.transactionCount} transactions, trend: ${c.trend} ${c.trendPct > 0 ? `(${c.trendPct}% vs previous period)` : ""}`
).join("\n")}

=== INCOME SOURCES ===
${ctx.incomeCategories.length > 0
  ? ctx.incomeCategories.map((c) => `• ${c.name}: ${r(c.currentPaise)}`).join("\n")
  : "No income transactions in this period."}

=== BUDGET STATUS (${ctx.budgets.length} active budgets) ===
${ctx.budgets.length > 0
  ? ctx.budgets.map((b) =>
      `• ${b.name} [${b.categoryName}]: Spent ${r(b.spentPaise)} of ${r(b.limitPaise)} (${b.utilisationPct}%)${b.isOverBudget ? " ⚠ OVER BUDGET" : b.utilisationPct >= 80 ? " ⚠ AT RISK" : ""}, ${b.daysRemaining} days remaining`
    ).join("\n")
  : "No active budgets set."}

Over-budget budgets: ${ctx.budgetsOverLimit}
At-risk budgets (>80%): ${ctx.budgetsAtRisk}

=== SAVINGS GOALS ===
${ctx.goals.length > 0
  ? ctx.goals.map((g) =>
      `• ${g.name}: ${r(g.currentPaise)} / ${r(g.targetPaise)} (${g.progressPct}%)${g.daysRemaining !== null ? `, ${g.daysRemaining} days to target date` : ", no target date"}`
    ).join("\n")
  : "No active savings goals."}

=== UNUSUAL TRANSACTIONS ===
${ctx.unusualTransactions.length > 0
  ? ctx.unusualTransactions.map((u) =>
      `• "${u.description}" — ${r(u.amountPaise)} on ${u.date} in ${u.category ?? "uncategorized"} (${u.reasonFlag})`
    ).join("\n")
  : "No unusual transactions detected."}

=== TASK ===
Generate a complete financial insights report following your system instructions. Return only the JSON object. No markdown.`
}