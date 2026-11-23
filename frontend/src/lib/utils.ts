/**
 * Small, framework-free helpers used across the UI: class-name joining, number formatting, statistics,
 * CSV export and grouping. Nothing here touches React or the network, which keeps it easy to test.
 */
import { clsx, type ClassValue } from 'clsx'

/** Join CSS class names, skipping falsy values: cn('a', cond && 'b') -> 'a b'. (Wrapper around `clsx`.) */
export const cn = (...v: ClassValue[]) => clsx(v)

/** Format a number as US dollars, e.g. money(1234.5) -> "$1,234.50". `d` = decimals. null/NaN -> an em dash "—". */
export const money = (v: number | null | undefined, d = 2) =>
  v == null || Number.isNaN(v) ? '—' : `$${v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`
/**
 * Format a percentage, e.g. pct(12.34) -> "+12.3%". `signed` adds an explicit + for positive values
 * (used for price gaps where the direction matters). null/NaN -> "—".
 */
export const pct = (v: number | null | undefined, d = 1, signed = true) =>
  v == null || Number.isNaN(v) ? '—' : `${signed && v > 0 ? '+' : ''}${v.toFixed(d)}%`
/** Format a plain number with thousands separators (num(1234) -> "1,234"); null/NaN -> "—". */
export const num = (v: number | null | undefined, d = 0) =>
  v == null || Number.isNaN(v) ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: d })

/**
 * Quantile `q` (0..1) of an ALREADY SORTED array, using linear interpolation between the two nearest values
 * (the same method as numpy's default). Returns NaN for an empty array.
 */
export function quantile(sorted: number[], q: number) {
  if (!sorted.length) return NaN
  // Fractional index of the quantile; interpolate between its floor and ceil neighbours.
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}
/**
 * Five-number summary used to draw box-plots: [min, Q1, median, Q3, max].
 * Whiskers are the true min/max (no outlier removal, which suits these small samples).
 * Ignores null/NaN values; returns null when nothing is left.
 */
export function boxStats(values: number[]): number[] | null {
  const s = values.filter(v => v != null && !Number.isNaN(v)).sort((a, b) => a - b)
  return s.length ? [s[0], quantile(s, 0.25), quantile(s, 0.5), quantile(s, 0.75), s[s.length - 1]] : null
}

/**
 * Download `rows` (an array of flat objects) as a CSV file in the browser, entirely client-side — no server call.
 * Columns come from the first row's keys. Used by every table's CSV button.
 */
export function downloadCsv(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return
  const cols = Object.keys(rows[0])
  // CSV escaping: wrap values containing a comma, quote or newline in quotes, and double any inner quotes.
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n')
  // Trick to trigger a download: build a Blob, point a temporary <a download> at it, click it, then free the URL.
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}

/** Group rows by a key function: groupBy(rows, r => r.category) -> { Laptops: [...], Tablets: [...] }. */
export const groupBy = <T,>(rows: T[], key: (r: T) => string) =>
  rows.reduce<Record<string, T[]>>((acc, r) => ((acc[key(r)] ||= []).push(r), acc), {})
