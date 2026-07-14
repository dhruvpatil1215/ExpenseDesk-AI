/**
 * AI Insights Page
 * Path: src/app/(dashboard)/insights/page.tsx
 *
 * This is a Server Component that:
 *   1. Validates the session (redirect if not authenticated)
 *   2. Renders a static shell with metadata
 *   3. Defers all data fetching + AI calls to <InsightsPanel>
 *      which runs entirely on the client via server actions
 *
 * Why client-side fetch instead of server-side?
 *   Gemini calls can take 5-15 seconds. If we await generateInsights()
 *   here, the page blocks until the AI responds — bad UX.
 *   By deferring to the client, the page shell renders instantly and
 *   the panel shows a skeleton while Gemini is thinking.
 */

import type { Metadata } from "next"
import { auth }          from "@/auth"
import { redirect }      from "next/navigation"
import { InsightsPanel } from "@/components/ai/InsightsPanel"

export const metadata: Metadata = {
  title:       "AI Insights",
  description: "Gemini-powered spending analysis, budget recommendations, and personalised savings suggestions.",
}

export default async function InsightsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  return (
    <div className="page-wrap">
      <InsightsPanel />
    </div>
  )
}