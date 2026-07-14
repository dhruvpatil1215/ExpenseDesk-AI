/**
 * Insight Card
 * Path: src/components/ai/InsightCard.tsx
 *
 * Visual design:
 *   spending_alert      → red glow
 *   budget_recommendation → amber glow
 *   savings_suggestion  → emerald glow
 *   positive_trend      → indigo glow
 *   category_insight    → purple glow
 *
 * Priority badge: critical (red pill) / high (orange) / medium (yellow) / low (slate)
 */

"use client"

import { useState } from "react"
import type { AIInsight } from "@/lib/validators/insights.schema"
import { formatCurrency } from "@/lib/utils/format"

interface Props {
  insight: AIInsight
  index:   number     // for stagger animation delay
}

const TYPE_CONFIG: Record<
  string,
  { icon: string; colorClass: string; label: string }
> = {
  spending_alert:       { icon: "🚨", colorClass: "insight--alert",   label: "Alert"         },
  budget_recommendation:{ icon: "📋", colorClass: "insight--budget",  label: "Budget"        },
  savings_suggestion:   { icon: "💰", colorClass: "insight--savings", label: "Savings"       },
  positive_trend:       { icon: "📈", colorClass: "insight--positive",label: "Positive"      },
  category_insight:     { icon: "🏷️", colorClass: "insight--category",label: "Category"     },
}

const PRIORITY_CONFIG: Record<string, { label: string; cls: string }> = {
  critical: { label: "Critical", cls: "priority--critical" },
  high:     { label: "High",     cls: "priority--high"     },
  medium:   { label: "Medium",   cls: "priority--medium"   },
  low:      { label: "Low",      cls: "priority--low"      },
}

export function InsightCard({ insight, index }: Props) {
  const [expanded, setExpanded] = useState(false)

  const typeConf = TYPE_CONFIG[insight.type]    ?? TYPE_CONFIG["category_insight"]
  const priConf  = PRIORITY_CONFIG[insight.priority] ?? PRIORITY_CONFIG["low"]

  const hasAction  = !!insight.action
  const hasImpact  = !!insight.impactLabel
  const hasAmount  = insight.amountPaise !== null && insight.amountPaise !== undefined

  return (
    <div
      className={`insight-card ${typeConf.colorClass}`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Header */}
      <div className="insight-card__header">
        <span className="insight-card__icon">{typeConf.icon}</span>
        <div className="insight-card__meta">
          <div className="insight-card__title-row">
            <h3 className="insight-card__title">{insight.title}</h3>
            <span className={`priority-badge ${priConf.cls}`}>{priConf.label}</span>
          </div>
          {insight.affectedCategory && (
            <span className="insight-card__category">{insight.affectedCategory}</span>
          )}
        </div>
      </div>

      {/* Description */}
      <p className="insight-card__desc">{insight.description}</p>

      {/* Amount pill */}
      {hasAmount && (
        <div className="insight-card__amount">
          {formatCurrency(insight.amountPaise!, "INR")}
        </div>
      )}

      {/* Impact label */}
      {hasImpact && (
        <div className="insight-card__impact">
          ✦ {insight.impactLabel}
        </div>
      )}

      {/* Action (collapsible on mobile) */}
      {hasAction && (
        <div className="insight-card__action-wrap">
          <button
            className="insight-card__action-toggle"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
          >
            {expanded ? "▾ Hide action" : "▸ What to do"}
          </button>
          {expanded && (
            <div className="insight-card__action" role="region">
              <span className="insight-card__action-icon">→</span>
              <span>{insight.action}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}