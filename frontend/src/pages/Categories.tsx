/**
 * Categories & Brands page (route "/categories").
 *
 * Compares pricing across the WHOLE catalogue (every product, not just matched ones), so it stays meaningful even when few exact
 * matches exist. Uses medians (robust to outliers). Shows typical price per category for both stores, the price gap per category,
 * the gap for brands both stores sell within the same category, and a summary table.
 */
import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Chart } from '../components/Chart'
import { DataTable } from '../components/DataTable'
import { Badge, Card, Grid, PageHeader } from '../components/ui'
import type { CategoryRow } from '../lib/api'
import { useAnalysis } from '../lib/queries'
import { useTheme } from '../lib/theme'
import { catAxis, dumbbell, grid, legend, padded, tooltip, valueAxis } from '../lib/chartKit'
import { money, num, pct } from '../lib/utils'

/** Table cell for a percentage gap: red when you're pricier, green when cheaper, "—" when unknown. */
const gapCell = (v: number | null) => v == null ? <span className="text-muted">—</span> : <span className={`tabular font-semibold ${v > 0 ? 'text-bad' : 'text-good'}`}>{pct(v)}</span>

/** Category/brand charts and table. */
export default function Categories() {
  const { categories, brand_category, meta } = useAnalysis()
  const { palette: p } = useTheme()
  // Only categories sold by both stores can be compared; one-sided categories appear in the table and on the Market page.
  const both = useMemo(() => categories.filter(c => c.coverage === 'Both'), [categories])

  // Dumbbell of median price per category (blue dot = you, amber diamond = competitor), with a log axis only if prices span >20x
  // (e.g. $4 groceries vs $20k vehicles would otherwise squash everything).
  const dumb = useMemo(() => {
    const rows = [...both].sort((a, b) => (a.comp_median ?? 0) - (b.comp_median ?? 0))
    const v = rows.flatMap(c => [c.our_median, c.comp_median]).filter((x): x is number => !!x)
    const log = v.length > 0 && Math.max(...v) / Math.min(...v) > 20
    return { n: rows.length, option: dumbbell(p, rows.map(c => ({ label: c.category, a: c.our_median, b: c.comp_median, aN: c.our_n, bN: c.comp_n })), meta.our_name, meta.comp_name, log) }
  }, [both, p, meta])

  // Bars = median price gap over ALL products in the category; black diamonds = average gap over matched pairs only,
  // so you can see whether the matched sample agrees with the full picture.
  const gap = useMemo(() => {
    const rows = [...both].filter(c => c.median_gap_pct != null).sort((a, b) => a.median_gap_pct! - b.median_gap_pct!)
    return {
      grid: grid({ top: 40 }), legend: legend(p), tooltip: tooltip(p, { trigger: 'item' }),
      xAxis: valueAxis(p, { ...padded(1.3), axisLabel: { color: p.muted, formatter: '{value}%' } }), yAxis: catAxis(p, rows.map(c => c.category), { axisLabel: { color: p.fg } }),
      series: [
        { name: 'All products (median)', type: 'bar', barMaxWidth: 24, data: rows.map(c => ({ value: +c.median_gap_pct!.toFixed(1), itemStyle: { color: c.median_gap_pct! < 0 ? p.good : p.bad, borderRadius: 4 }, label: { show: true, position: c.median_gap_pct! < 0 ? 'left' : 'right', color: p.fg, formatter: (x: any) => `${x.value > 0 ? '+' : ''}${Math.round(x.value)}%` } })) },
        // Diamonds are plotted on the same category rows; null entries (no pairs in that category) are skipped.
        { name: 'Matched pairs only', type: 'scatter', symbol: 'diamond', symbolSize: 13, itemStyle: { color: p.fg }, data: rows.map((c, i) => (c.matched_avg_pct_diff == null ? null : [c.matched_avg_pct_diff, i])), tooltip: { formatter: (x: any) => `Matched pairs avg: ${pct(x.value[0])}` } },
      ],
    }
  }, [both, p])

  // Same-brand, same-category gap: the fairest comparison available without exact matches (e.g. Samsung tablets vs Samsung tablets).
  const bc = useMemo(() => {
    const rows = [...brand_category].sort((a, b) => a.gap_pct - b.gap_pct)
    return {
      grid: grid({ top: 8 }),
      tooltip: tooltip(p, { trigger: 'item', formatter: (x: any) => { const r = rows[x.dataIndex]; return `<b>${r.brand} · ${r.category}</b><br/>gap ${pct(r.gap_pct)}<br/>You: ${r.our_n} items, median ${money(r.our_median, 0)}<br/>Competitor: ${r.comp_n} items, median ${money(r.comp_median, 0)}` } }),
      xAxis: valueAxis(p, { ...padded(1.3), axisLabel: { color: p.muted, formatter: '{value}%' } }), yAxis: catAxis(p, rows.map(r => `${r.brand} · ${r.category}`), { axisLabel: { color: p.fg } }),
      series: [{ type: 'bar', barMaxWidth: 22, data: rows.map(r => ({ value: +r.gap_pct.toFixed(1), itemStyle: { color: r.gap_pct < 0 ? p.good : p.bad, borderRadius: 4 }, label: { show: true, position: r.gap_pct < 0 ? 'left' : 'right', color: p.fg, formatter: (x: any) => `${x.value > 0 ? '+' : ''}${Math.round(x.value)}%` } })) }],
    }
  }, [brand_category, p])

  // Summary table columns, including coverage (Both / Only you / Only competitor).
  const cols: ColumnDef<CategoryRow>[] = [
    { header: 'Category', accessorKey: 'category', cell: c => <b>{c.getValue<string>()}</b> },
    { header: 'Coverage', accessorKey: 'coverage', cell: c => <Badge tone={c.getValue() === 'Both' ? 'info' : c.getValue() === 'Only you' ? 'good' : 'warn'}>{c.getValue<string>()}</Badge> },
    { header: 'Your products', accessorKey: 'our_n', cell: c => num(c.getValue<number | null>()) }, { header: 'Competitor products', accessorKey: 'comp_n', cell: c => num(c.getValue<number | null>()) },
    { header: 'Your median price', accessorKey: 'our_median', cell: c => money(c.getValue<number | null>()) }, { header: 'Competitor median', accessorKey: 'comp_median', cell: c => money(c.getValue<number | null>()) },
    { header: 'Price gap', accessorKey: 'median_gap_pct', cell: c => gapCell(c.getValue<number | null>()) },
    { header: 'Matched pairs', accessorKey: 'matched_n', cell: c => num(c.getValue<number | null>()) },
  ]

  return (
    <>
      <PageHeader title="Categories & brands" subtitle="How your pricing compares across the whole catalogue — every product, not just matched ones." />
      <Card title="Typical price by category" subtitle="Median price in each store (blue = you, amber = competitor)">
        <Chart option={dumb.option} height={Math.max(220, 52 * dumb.n + 90)} />
      </Card>
      <Grid cols={2} className="mt-4">
        <Card title="Price gap by category" subtitle="Bars: all products. Diamonds: matched pairs only. Negative = you're cheaper."><Chart option={gap} height={320} /></Card>
        <Card title="Same brand, same category" subtitle="Where both stores sell the brand">
          {brand_category.length ? <Chart option={bc} height={320} /> : <p className="py-16 text-center text-sm text-muted">No brand is sold by both stores in a shared category.</p>}
        </Card>
      </Grid>
      <Card className="mt-4" title="Category summary"><DataTable data={categories} columns={cols} pageSize={15} searchable={false} csvName="categories.csv" dense /></Card>
    </>
  )
}
