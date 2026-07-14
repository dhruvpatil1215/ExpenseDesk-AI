/**
 * Shared Formatting Utilities
 * Path: src/lib/utils/format.ts
 *
 * All monetary amounts inside the DB are BigInt paise (smallest unit).
 * Server queries serialise them to plain `number` (still paise) before
 * sending to the client.  These helpers convert for display.
 */

// ── Currency ─────────────────────────────────────────────────

/**
 * Format a paise amount to a localised currency string.
 * e.g. formatCurrency(125050) → "₹1,250.50"
 */
export function formatCurrency(
  paise:    number,
  currency: string = "INR",
  locale:   string = "en-IN"
): string {
  return new Intl.NumberFormat(locale, {
    style:                 "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(paise / 100)
}

/**
 * Parse a user-entered rupee string to paise integer.
 * e.g. parseToPaise("1,250.50") → 125050
 * Returns null if the input is invalid.
 */
export function parseToPaise(input: string): number | null {
  const cleaned = input.replace(/[^0-9.]/g, "")
  const num = parseFloat(cleaned)
  if (isNaN(num) || num <= 0) return null
  return Math.round(num * 100)
}

// ── Dates ─────────────────────────────────────────────────────

/**
 * "15 Jul 2026"
 */
export function formatDate(iso: string | Date, locale = "en-IN"): string {
  return new Intl.DateTimeFormat(locale, {
    day:   "numeric",
    month: "short",
    year:  "numeric",
  }).format(new Date(iso))
}

/**
 * Returns "YYYY-MM-DD" suitable for a date <input> value attribute.
 */
export function toInputDate(iso: string | Date): string {
  const d = new Date(iso)
  return d.toISOString().split("T")[0]
}

/**
 * Returns today as "YYYY-MM-DD".
 */
export function todayInputDate(): string {
  return new Date().toISOString().split("T")[0]
}

// ── Class names ───────────────────────────────────────────────

/**
 * Joins class names, filtering falsy values.
 * cn("foo", false && "bar", "baz") → "foo baz"
 */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ")
}

// ── Truncation ────────────────────────────────────────────────

export function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "…" : str
}