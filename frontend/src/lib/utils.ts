import { clsx, type ClassValue } from 'clsx'

export const cn = (...v: ClassValue[]) => clsx(v)

export const money = (v: number | null | undefined, d = 2) =>
  v == null || Number.isNaN(v) ? '—' : `$${v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`
export const pct = (v: number | null | undefined, d = 1, signed = true) =>
  v == null || Number.isNaN(v) ? '—' : `${signed && v > 0 ? '+' : ''}${v.toFixed(d)}%`
export const num = (v: number | null | undefined, d = 0) =>
  v == null || Number.isNaN(v) ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: d })

export function quantile(sorted: number[], q: number) {
  if (!sorted.length) return NaN
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}
/** [min, Q1, median, Q3, max] (whiskers = min/max). */
export function boxStats(values: number[]): number[] | null {
  const s = values.filter(v => v != null && !Number.isNaN(v)).sort((a, b) => a - b)
  return s.length ? [s[0], quantile(s, 0.25), quantile(s, 0.5), quantile(s, 0.75), s[s.length - 1]] : null
}

export function downloadCsv(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return
  const cols = Object.keys(rows[0])
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}

export const groupBy = <T,>(rows: T[], key: (r: T) => string) =>
  rows.reduce<Record<string, T[]>>((acc, r) => ((acc[key(r)] ||= []).push(r), acc), {})
