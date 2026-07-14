/**
 * Pagination Component
 * Path: src/components/ui/Pagination.tsx
 *
 * URL-driven pagination — pushes ?page=N to the router so the
 * Server Component re-fetches the correct slice from the DB.
 *
 * Renders: ← Prev | 1 2 … 5 6 … 12 13 | Next →
 * Shows at most 7 page buttons (with ellipsis for large ranges).
 */

"use client"

import { useRouter, useSearchParams, usePathname } from "next/navigation"

interface Props {
  page:       number
  totalPages: number
  total:      number
  pageSize:   number
}

export function Pagination({ page, totalPages, total, pageSize }: Props) {
  const router   = useRouter()
  const params   = useSearchParams()
  const pathname = usePathname()

  if (totalPages <= 1) return null

  function navigate(p: number) {
    const next = new URLSearchParams(params.toString())
    next.set("page", String(p))
    router.push(`${pathname}?${next.toString()}`)
  }

  // Build page number window: always show first, last, and ±2 around current
  function getPages(): (number | "…")[] {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)

    const pages: (number | "…")[] = [1]
    if (page > 3)           pages.push("…")
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
      pages.push(i)
    }
    if (page < totalPages - 2) pages.push("…")
    pages.push(totalPages)
    return pages
  }

  const from = (page - 1) * pageSize + 1
  const to   = Math.min(page * pageSize, total)

  return (
    <div className="pagination" role="navigation" aria-label="Pagination">
      <span className="pagination__info">
        {from}–{to} of {total.toLocaleString()}
      </span>

      <div className="pagination__controls">
        <button
          className="pagination__btn"
          onClick={() => navigate(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          ← Prev
        </button>

        {getPages().map((p, i) =>
          p === "…" ? (
            <span key={`ellipsis-${i}`} className="pagination__ellipsis">…</span>
          ) : (
            <button
              key={p}
              className={`pagination__btn pagination__btn--page${p === page ? " pagination__btn--active" : ""}`}
              onClick={() => navigate(p as number)}
              aria-label={`Page ${p}`}
              aria-current={p === page ? "page" : undefined}
            >
              {p}
            </button>
          )
        )}

        <button
          className="pagination__btn"
          onClick={() => navigate(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          Next →
        </button>
      </div>
    </div>
  )
}