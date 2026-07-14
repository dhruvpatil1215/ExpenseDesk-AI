/**
 * Transaction Filters Bar
 * Path: src/components/transactions/TransactionFilters.tsx
 *
 * Filter state lives in the URL (searchParams) so:
 *   - Filters survive refresh
 *   - URLs are shareable
 *   - The Server Component page does the actual filtering (no client fetch)
 *
 * Debounced search: waits 300ms after the user stops typing before
 * pushing to the URL — avoids rapid refetches on every keystroke.
 */

"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import type { CategoryOption } from "@/lib/queries/transaction.queries"

interface Props {
  categories: CategoryOption[]
}

const SORT_OPTIONS = [
  { value: "transactionDate:desc", label: "Date (newest)" },
  { value: "transactionDate:asc",  label: "Date (oldest)" },
  { value: "amount:desc",          label: "Amount (high)" },
  { value: "amount:asc",           label: "Amount (low)"  },
  { value: "description:asc",      label: "Description A–Z" },
]

export function TransactionFilters({ categories }: Props) {
  const router     = useRouter()
  const pathname   = usePathname()
  const params     = useSearchParams()

  // Local state mirrors the URL — avoids stale display during navigation
  const [search,     setSearch]     = useState(params.get("search")     ?? "")
  const [type,       setType]       = useState(params.get("type")       ?? "")
  const [categoryId, setCategoryId] = useState(params.get("categoryId") ?? "")
  const [dateFrom,   setDateFrom]   = useState(params.get("dateFrom")   ?? "")
  const [dateTo,     setDateTo]     = useState(params.get("dateTo")     ?? "")
  const [sortKey,    setSortKey]    = useState(
    `${params.get("sortBy") ?? "transactionDate"}:${params.get("sortOrder") ?? "desc"}`
  )

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Push all current filter values to the URL
  const pushParams = useCallback(
    (overrides: Record<string, string>) => {
      const next = new URLSearchParams(params.toString())
      next.set("page", "1") // always reset page when filters change

      const merged: Record<string, string> = {
        search, type, categoryId, dateFrom, dateTo, sortKey, ...overrides,
      }

      // Extract sortBy / sortOrder from combined key
      const [sortBy, sortOrder] = (merged.sortKey ?? sortKey).split(":")

      const setOrDelete = (key: string, val: string) =>
        val ? next.set(key, val) : next.delete(key)

      setOrDelete("search",     merged.search)
      setOrDelete("type",       merged.type)
      setOrDelete("categoryId", merged.categoryId)
      setOrDelete("dateFrom",   merged.dateFrom)
      setOrDelete("dateTo",     merged.dateTo)
      next.set("sortBy",    sortBy)
      next.set("sortOrder", sortOrder)

      router.push(`${pathname}?${next.toString()}`)
    },
    [params, pathname, router, search, type, categoryId, dateFrom, dateTo, sortKey]
  )

  // Debounced search
  function handleSearch(val: string) {
    setSearch(val)
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => pushParams({ search: val }), 300)
  }

  function handleType(val: string) {
    const next = val === type ? "" : val
    setType(next)
    setCategoryId("")
    pushParams({ type: next, categoryId: "" })
  }

  function handleSort(val: string) {
    setSortKey(val)
    pushParams({ sortKey: val })
  }

  function handleClear() {
    setSearch(""); setType(""); setCategoryId("")
    setDateFrom(""); setDateTo(""); setSortKey("transactionDate:desc")
    router.push(pathname)
  }

  const hasFilters = search || type || categoryId || dateFrom || dateTo

  const filteredCats = type === "INCOME"
    ? categories.filter(c => c.type === "INCOME")
    : type === "EXPENSE"
    ? categories.filter(c => c.type === "EXPENSE")
    : categories

  return (
    <div className="txn-filters">
      {/* Row 1: Search + Sort */}
      <div className="txn-filters__row">
        <div className="txn-filters__search-wrap">
          <span className="txn-filters__search-icon">🔍</span>
          <input
            type="search"
            className="txn-filters__search"
            placeholder="Search transactions…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            aria-label="Search transactions"
          />
          {search && (
            <button
              type="button"
              className="txn-filters__search-clear"
              onClick={() => handleSearch("")}
              aria-label="Clear search"
            >×</button>
          )}
        </div>

        <select
          className="txn-filters__sort"
          value={sortKey}
          onChange={(e) => handleSort(e.target.value)}
          aria-label="Sort by"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Row 2: Type + Category + Date range + Clear */}
      <div className="txn-filters__row txn-filters__row--chips">
        {/* Type buttons */}
        <div className="txn-filters__types" role="group" aria-label="Filter by type">
          {(["INCOME", "EXPENSE", "TRANSFER"] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`txn-filter-chip${type === t ? " txn-filter-chip--active" : ""}`}
              onClick={() => handleType(t)}
            >
              {t === "INCOME" ? "📥" : t === "EXPENSE" ? "📤" : "🔁"} {t}
            </button>
          ))}
        </div>

        {/* Category select */}
        <select
          className="txn-filters__select"
          value={categoryId}
          onChange={(e) => { setCategoryId(e.target.value); pushParams({ categoryId: e.target.value }) }}
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {filteredCats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon ? `${c.icon} ` : ""}{c.name}
            </option>
          ))}
        </select>

        {/* Date range */}
        <input
          type="date"
          className="txn-filters__date"
          value={dateFrom}
          max={dateTo || undefined}
          onChange={(e) => { setDateFrom(e.target.value); pushParams({ dateFrom: e.target.value }) }}
          aria-label="From date"
        />
        <span className="txn-filters__date-sep">→</span>
        <input
          type="date"
          className="txn-filters__date"
          value={dateTo}
          min={dateFrom || undefined}
          onChange={(e) => { setDateTo(e.target.value); pushParams({ dateTo: e.target.value }) }}
          aria-label="To date"
        />

        {hasFilters && (
          <button type="button" className="txn-filter-chip txn-filter-chip--clear" onClick={handleClear}>
            ✕ Clear
          </button>
        )}
      </div>
    </div>
  )
}