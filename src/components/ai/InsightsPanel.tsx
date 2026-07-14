/**
 * AI Insights Panel
 * Path: src/components/ai/InsightsPanel.tsx
 *
 * Fetches insights on mount via getInsights() server action.
 * Re-fetches when period changes or user clicks Refresh.
 *
 * Sections:
 *   1. Health Score ring + summary paragraph
 *   2. Period selector (30 / 60 / 90 days)
 *   3. Key stats strip (income, expenses, savings rate, potential savings)
 *   4. Tabbed insight cards (All | Alerts | Savings | Budget | Positive)
 *   5. Category breakdown table
 *   6. Budget recommendations
 *   7. Positive highlights
 */

"use client"

import { useEffect, useState, useTransition } from "react"
import { InsightCard }  from "./InsightCard"
import { getInsights, refreshInsights } from "@/server/actions/insights.actions"
import type { InsightsPayload, AIInsightsResponse, AIInsight } from "@/lib/validators/insights.schema"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import "@/styles/insights.css"

type Period = 30 | 60 | 90
type TabKey  = "all" | "spending_alert" | "savings_suggestion" | "budget_recommendation" | "positive_trend"

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "all",                    label: "All",      icon: "✦"  },
  { key: "spending_alert",         label: "Alerts",   icon: "🚨" },
  { key: "savings_suggestion",     label: "Savings",  icon: "💰" },
  { key: "budget_recommendation",  label: "Budget",   icon: "📋" },
  { key: "positive_trend",         label: "Positive", icon: "📈" },
]

// ── Skeleton ─────────────────────────────────────────────────
function InsightsSkeleton() {
  return (
    <div className="insights-skeleton" aria-busy="true" aria-label="Loading insights…">
      <div className="insights-skeleton__hero">
        <div className="skeleton insights-skeleton__score" />
        <div className="insights-skeleton__text">
          <div className="skeleton insights-skeleton__line insights-skeleton__line--lg" />
          <div className="skeleton insights-skeleton__line" />
          <div className="skeleton insights-skeleton__line insights-skeleton__line--sm" />
        </div>
      </div>
      <div className="insights-skeleton__stats">
        {[0,1,2,3].map(i => <div key={i} className="skeleton insights-skeleton__stat" />)}
      </div>
      <div className="insights-skeleton__cards">
        {[0,1,2,3].map(i => <div key={i} className="skeleton insights-skeleton__card" />)}
      </div>
    </div>
  )
}

// ── Health score ring ─────────────────────────────────────────
function HealthRing({ score, label }: { score: number; label: string }) {
  const r    = 44
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ

  const colour =
    score >= 85 ? "#22c55e" :
    score >= 65 ? "#818cf8" :
    score >= 45 ? "#f59e0b" : "#ef4444"

  return (
    <div className="health-ring" aria-label={`Financial health score: ${score}/100 — ${label}`}>
      <svg width="120" height="120" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8"/>
        <circle
          cx="50" cy="50" r={r} fill="none"
          stroke={colour} strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          strokeDashoffset={circ / 4}
          style={{ transition: "stroke-dasharray 1s ease" }}
        />
      </svg>
      <div className="health-ring__inner">
        <span className="health-ring__score" style={{ color: colour }}>{score}</span>
        <span className="health-ring__label">{label}</span>
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────
export function InsightsPanel() {
  const [period,   setPeriod]   = useState<Period>(90)
  const [payload,  setPayload]  = useState<InsightsPayload | null>(null)
  const [error,    setError]    = useState<string | null>(null)
  const [activeTab, setTab]     = useState<TabKey>("all")
  const [isPending, setIsPending] = useState(false)

  async function load(p: Period, refresh = false) {
    setError(null)
    setIsPending(true)
    try {
      const result = refresh
        ? await refreshInsights(p)
        : await getInsights(p)

      if (!result || !result.success || !result.data) {
        setError(result?.error ?? "Failed to load insights. Please try again.")
        return
      }
      setPayload(result.data)
    } catch (err: any) {
      setError(err?.message ?? "An unexpected error occurred.")
    } finally {
      setIsPending(false)
    }
  }

  // Load on mount and when period changes
  useEffect(() => { load(period) }, [period])

  function handlePeriod(p: Period) {
    setPeriod(p)
    setTab("all")
  }

  // ── Render loading ──────────────────────────────────────────
  if (isPending && !payload) return <InsightsSkeleton />

  // ── Render error ────────────────────────────────────────────
  if (error && !payload) {
    return (
      <div className="insights-error">
        <span className="insights-error__icon">⚡</span>
        <p>{error}</p>
        <button className="btn btn--primary" onClick={() => load(period)}>Try again</button>
      </div>
    )
  }

  if (!payload) return <InsightsSkeleton />

  const ai = payload.insights

  // ── Insufficient data ───────────────────────────────────────
  if (payload.insufficientData) {
    return (
      <div className="insights-empty">
        <span className="insights-empty__icon">🤖</span>
        <h2>Not enough data yet</h2>
        <p>{ai.monthlySummary}</p>
        <button
          className="btn btn--primary"
          style={{ marginTop: "1rem" }}
          onClick={() => load(period, true)}
          disabled={isPending}
        >
          {isPending ? "Analysing..." : "Refresh Insights"}
        </button>
      </div>
    )
  }

  // ── Filter insights by tab ──────────────────────────────────
  const visibleInsights: AIInsight[] =
    activeTab === "all"
      ? ai.insights
      : ai.insights.filter((i) => i.type === activeTab)

  const tabCount = (key: TabKey) =>
    key === "all" ? ai.insights.length : ai.insights.filter((i) => i.type === key).length

  // ── Stats ───────────────────────────────────────────────────
  const stats = [
    { label: "Income",    value: formatCurrency(ai.insights.find(i => i.amountPaise)?.amountPaise ?? 0, "INR"), icon: "📥" },
    { label: "Health Score",  value: `${ai.financialHealthScore}/100`, icon: "💗" },
    { label: "Savings Potential", value: formatCurrency(ai.savingsPotentialPaise, "INR"), icon: "💡" },
    { label: "Insights",  value: `${ai.insights.length} found`,  icon: "✦"  },
  ]

  return (
    <div className="insights-panel">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="insights-header">
        <div className="insights-header__left">
          <h1 className="insights-header__title">AI Financial Insights</h1>
          <p className="insights-header__sub">
            {payload.periodDays}-day analysis · {formatDate(payload.periodFrom)} – {formatDate(payload.periodTo)}
            {payload.cached && <span className="insights-cache-badge">· Cached</span>}
          </p>
        </div>
        <div className="insights-header__actions">
          {/* Period selector */}
          <div className="period-selector" role="group" aria-label="Analysis period">
            {([30, 60, 90] as Period[]).map((p) => (
              <button
                key={p}
                className={`period-btn${period === p ? " period-btn--active" : ""}`}
                onClick={() => handlePeriod(p)}
                disabled={isPending}
              >
                {p}d
              </button>
            ))}
          </div>
          <button
            className="btn btn--ghost"
            onClick={() => load(period, true)}
            disabled={isPending}
            title="Force refresh (ignores cache)"
          >
            {isPending ? <span className="spinner spinner--sm" /> : "⟳"} Refresh
          </button>
        </div>
      </div>

      {/* Loading bar */}
      {isPending && <div className="txn-loading-bar" />}

      {/* ── Hero: score + summary ────────────────────────────── */}
      <div className="insights-hero">
        <HealthRing score={ai.financialHealthScore} label={ai.financialHealthLabel} />
        <div className="insights-hero__text">
          <div className="insights-hero__label-row">
            <span className="insights-hero__health-label" data-health={ai.financialHealthLabel}>
              {ai.financialHealthLabel}
            </span>
            {ai.savingsPotentialPaise > 0 && (
              <span className="insights-hero__potential">
                💡 Save up to {formatCurrency(ai.savingsPotentialPaise, "INR")}/month
              </span>
            )}
          </div>
          <p className="insights-hero__summary">{ai.monthlySummary}</p>
        </div>
      </div>

      {/* ── Positive highlights ──────────────────────────────── */}
      {ai.positiveHighlights.length > 0 && (
        <div className="insights-positives">
          {ai.positiveHighlights.map((h, i) => (
            <div key={i} className="insights-positive-item">
              <span>✓</span> <span>{h}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Tabbed insights ──────────────────────────────────── */}
      <div className="insights-section">
        <div className="insights-tabs" role="tablist">
          {TABS.map((tab) => {
            const count = tabCount(tab.key)
            if (tab.key !== "all" && count === 0) return null
            return (
              <button
                key={tab.key}
                role="tab"
                aria-selected={activeTab === tab.key}
                className={`insights-tab${activeTab === tab.key ? " insights-tab--active" : ""}`}
                onClick={() => setTab(tab.key)}
              >
                {tab.icon} {tab.label}
                {count > 0 && <span className="insights-tab__count">{count}</span>}
              </button>
            )
          })}
        </div>

        {visibleInsights.length === 0 ? (
          <p className="insights-empty-tab">No {activeTab.replace("_", " ")} insights for this period.</p>
        ) : (
          <div className="insight-cards-grid">
            {visibleInsights.map((insight, i) => (
              <InsightCard key={insight.id} insight={insight} index={i} />
            ))}
          </div>
        )}
      </div>

      {/* ── Category breakdown ───────────────────────────────── */}
      {ai.categoryInsights.length > 0 && (
        <div className="insights-section">
          <h2 className="insights-section__title">Category Analysis</h2>
          <div className="cat-breakdown">
            {ai.categoryInsights.map((c) => (
              <div key={c.categoryName} className="cat-row">
                <div className="cat-row__header">
                  <span className="cat-row__name">{c.categoryName}</span>
                  <span className="cat-row__amount">{formatCurrency(c.amountPaise, "INR")}</span>
                  <span className={`cat-row__trend cat-trend--${c.trend}`}>
                    {c.trend === "up" ? "↑" : c.trend === "down" ? "↓" : "→"} {c.trendPct}%
                  </span>
                </div>
                <div className="cat-row__bar-wrap">
                  <div
                    className="cat-row__bar"
                    style={{ width: `${Math.min(c.percentOfExpense, 100)}%` }}
                  />
                  <span className="cat-row__pct">{c.percentOfExpense}%</span>
                </div>
                <p className="cat-row__assessment">{c.assessment}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Budget recommendations ───────────────────────────── */}
      {ai.budgetRecommendations.length > 0 && (
        <div className="insights-section">
          <h2 className="insights-section__title">Budget Recommendations</h2>
          <div className="budget-recs">
            {ai.budgetRecommendations.map((b, i) => (
              <div key={i} className="budget-rec">
                <div className="budget-rec__header">
                  <span className="budget-rec__cat">{b.categoryName}</span>
                  <div className="budget-rec__amounts">
                    <span className="budget-rec__current">{formatCurrency(b.currentSpendPaise, "INR")}</span>
                    <span className="budget-rec__arrow">→</span>
                    <span className="budget-rec__recommended">{formatCurrency(b.recommendedBudgetPaise, "INR")}</span>
                  </div>
                </div>
                <p className="budget-rec__reasoning">{b.reasoning}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <p className="insights-footer">
        AI-generated analysis · Last updated {new Date(payload.generatedAt).toLocaleString("en-IN")}
        {" · "}Powered by Gemini 2.5 Flash
      </p>
    </div>
  )
}