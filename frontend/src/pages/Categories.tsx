import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Chart } from '../components/Chart'
import { DataTable } from '../components/DataTable'
import { Badge, Card, Grid, PageHeader, Segmented, Toggle } from '../components/ui'
import type { BrandRow, CategoryRow } from '../lib/api'
import { useAnalysis } from '../lib/queries'
import { useTheme } from '../lib/theme'
import { catAxis, dumbbell, grid, legend, padded, tooltip, valueAxis } from '../lib/chartKit'
import { money, num, pct } from '../lib/utils'

const gapCell = (v: number | null) => v == null ? <span className="text-muted">—</span> : <span className={`tabular font-semibold ${v > 0 ? 'text-bad' : 'text-good'}`}>{pct(v)}</span>

export default function Categories() {
  const { categories, brand_category, brands, meta } = useAnalysis()
  const { palette: p } = useTheme()
  const [stat, setStat] = useState<'Median' | 'Average'>('Median')
  const [log, setLog] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const both = useMemo(() => categories.filter(c => c.coverage === 'Both'), [categories])
  const k = stat === 'Median' ? 'median' : 'avg'

  const dumb = useMemo(() => {
    const rows = (showAll ? categories : both).filter(c => c[`our_${k}`] != null || c[`comp_${k}`] != null).sort((a, b) => (a[`comp_${k}`] ?? 0) - (b[`comp_${k}`] ?? 0))
    return { n: rows.length, option: dumbbell(p, rows.map(c => ({ label: c.category, a: c[`our_${k}`], b: c[`comp_${k}`], aN: c.our_n, bN: c.comp_n })), meta.our_name, meta.comp_name, log) }
  }, [categories, both, showAll, k, log, p, meta])

  const gap = useMemo(() => {
    const rows = [...both].filter(c => c.median_gap_pct != null).sort((a, b) => a.median_gap_pct! - b.median_gap_pct!)
    return {
      grid: grid({ top: 40 }), legend: legend(p), tooltip: tooltip(p, { trigger: 'item' }),
      xAxis: valueAxis(p, { ...padded(1.3), axisLabel: { color: p.muted, formatter: '{value}%' } }), yAxis: catAxis(p, rows.map(c => c.category), { axisLabel: { color: p.fg } }),
      series: [
        { name: 'All products (median)', type: 'bar', barMaxWidth: 24, data: rows.map(c => ({ value: +c.median_gap_pct!.toFixed(1), itemStyle: { color: c.median_gap_pct! < 0 ? p.good : p.bad, borderRadius: 4 }, label: { show: true, position: c.median_gap_pct! < 0 ? 'left' : 'right', color: p.fg, formatter: (x: any) => `${x.value > 0 ? '+' : ''}${Math.round(x.value)}%` } })) },
        { name: 'Matched pairs (avg)', type: 'scatter', symbol: 'diamond', symbolSize: 13, itemStyle: { color: p.fg }, data: rows.map((c, i) => c.matched_avg_pct_diff == null ? null : [c.matched_avg_pct_diff, i]), tooltip: { formatter: (x: any) => `Matched pairs avg: ${pct(x.value[0])}` } },
      ],
    }
  }, [both, p])

  const bc = useMemo(() => {
    const rows = [...brand_category].sort((a, b) => a.gap_pct - b.gap_pct)
    return {
      grid: grid({ top: 8, left: 8 }), tooltip: tooltip(p, { trigger: 'item', formatter: (x: any) => { const r = rows[x.dataIndex]; return `<b>${r.brand} · ${r.category}</b><br/>gap ${pct(r.gap_pct)}<br/>You: ${r.our_n} items, median ${money(r.our_median, 0)}<br/>Competitor: ${r.comp_n} items, median ${money(r.comp_median, 0)}` } }),
      xAxis: valueAxis(p, { ...padded(1.3), axisLabel: { color: p.muted, formatter: '{value}%' } }), yAxis: catAxis(p, rows.map(r => `${r.brand} · ${r.category}`), { axisLabel: { color: p.fg } }),
      series: [{ type: 'bar', barMaxWidth: 22, data: rows.map(r => ({ value: +r.gap_pct.toFixed(1), itemStyle: { color: r.gap_pct < 0 ? p.good : p.bad, borderRadius: 4 }, label: { show: true, position: r.gap_pct < 0 ? 'left' : 'right', color: p.fg, formatter: (x: any) => `${x.value > 0 ? '+' : ''}${Math.round(x.value)}%` } })) }],
    }
  }, [brand_category, p])

  const catCols: ColumnDef<CategoryRow>[] = [
    { header: 'Category', accessorKey: 'category', cell: c => <b>{c.getValue<string>()}</b> },
    { header: 'Coverage', accessorKey: 'coverage', cell: c => <Badge tone={c.getValue() === 'Both' ? 'info' : c.getValue() === 'Only you' ? 'good' : 'warn'}>{c.getValue<string>()}</Badge> },
    { header: 'Your #', accessorKey: 'our_n', cell: c => num(c.getValue<number | null>()) }, { header: 'Comp. #', accessorKey: 'comp_n', cell: c => num(c.getValue<number | null>()) },
    { header: 'Your median', accessorKey: 'our_median', cell: c => money(c.getValue<number | null>()) }, { header: 'Comp. median', accessorKey: 'comp_median', cell: c => money(c.getValue<number | null>()) },
    { header: 'Median gap', accessorKey: 'median_gap_pct', cell: c => gapCell(c.getValue<number | null>()) },
    { header: 'Avg gap', accessorKey: 'avg_gap_pct', cell: c => gapCell(c.getValue<number | null>()) },
    { header: 'Your ★', accessorKey: 'our_rating', cell: c => num(c.getValue<number | null>(), 2) }, { header: 'Comp. ★', accessorKey: 'comp_rating', cell: c => num(c.getValue<number | null>(), 2) },
    { header: 'Matched', accessorKey: 'matched_n', cell: c => num(c.getValue<number | null>()) }, { header: 'Matched gap', accessorKey: 'matched_avg_pct_diff', cell: c => gapCell(c.getValue<number | null>()) },
  ]
  const brandCols: ColumnDef<BrandRow>[] = [
    { header: 'Brand', accessorKey: 'brand', cell: c => <b>{c.getValue<string>()}</b> },
    { header: 'Your #', accessorKey: 'our_n', cell: c => num(c.getValue<number | null>()) }, { header: 'Comp. #', accessorKey: 'comp_n', cell: c => num(c.getValue<number | null>()) },
    { header: 'Your median', accessorKey: 'our_median', cell: c => money(c.getValue<number | null>()) }, { header: 'Comp. median', accessorKey: 'comp_median', cell: c => money(c.getValue<number | null>()) },
    { header: 'Your ★', accessorKey: 'our_rating', cell: c => num(c.getValue<number | null>(), 2) }, { header: 'Comp. ★', accessorKey: 'comp_rating', cell: c => num(c.getValue<number | null>(), 2) },
    { header: 'Median gap', accessorKey: 'gap', cell: c => gapCell(c.getValue<number | null>()) },
  ]

  return (
    <>
      <PageHeader title="Categories & brands" subtitle="Computed over every product each store lists — medians stay meaningful even where few exact matches exist." />
      <Card title={`${stat} price by category`} subtitle="Blue = your store, amber diamond = competitor"
        actions={<><Segmented size="sm" options={['Median', 'Average'] as const} value={stat} onChange={setStat} /><div className="w-28"><Toggle label="Log axis" checked={log} onChange={setLog} /></div><div className="w-56"><Toggle label="Include one-sided categories" checked={showAll} onChange={setShowAll} /></div></>}>
        <Chart option={dumb.option} height={Math.max(240, 52 * dumb.n + 90)} />
      </Card>
      <Grid cols={2} className="mt-4">
        <Card title="Price gap by category" subtitle="Bars: all products (median). Diamonds: matched pairs only"><Chart option={gap} height={320} /></Card>
        <Card title="Same brand, same category" subtitle="Median price gap where both stores sell the brand">
          {brand_category.length ? <Chart option={bc} height={320} /> : <p className="py-16 text-center text-sm text-muted">No brand is sold by both stores in a shared category.</p>}
        </Card>
      </Grid>
      <Card className="mt-4" title="Category detail"><DataTable data={categories} columns={catCols} pageSize={15} searchable={false} csvName="categories.csv" dense /></Card>
      <Card className="mt-4" title="Brand detail" subtitle="Median gap mixes product classes within a brand — prefer the same-brand/same-category chart above for decisions."><DataTable data={brands} columns={brandCols} pageSize={10} csvName="brands.csv" dense /></Card>
    </>
  )
}
