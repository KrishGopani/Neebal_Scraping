import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Chart } from '../components/Chart'
import { DataTable } from '../components/DataTable'
import { Badge, Card, EmptyState, Grid, KpiCard, PageHeader, Select, Slider, confidenceTone } from '../components/ui'
import type { BenchmarkRow, Recommendation } from '../lib/api'
import { useAnalysis, useRecommendations } from '../lib/queries'
import { useTheme } from '../lib/theme'
import { catAxis, grid, padded, tooltip, valueAxis } from '../lib/chartKit'
import { money, num, pct } from '../lib/utils'

function hbar(p: any, rows: { label: string; value: number; tip?: string }[], color: string, valueFmt: (v: number) => string) {
  return {
    grid: grid({ top: 8 }), tooltip: tooltip(p, { trigger: 'item', formatter: (x: any) => rows[x.dataIndex].tip ?? `${x.name}: ${valueFmt(x.value)}` }),
    xAxis: valueAxis(p, { ...padded(1.35), axisLabel: { color: p.muted, formatter: '{value}%' } }), yAxis: catAxis(p, rows.map(r => r.label), { inverse: true, axisLabel: { color: p.fg, width: 190, overflow: 'truncate' } }),
    series: [{ type: 'bar', barMaxWidth: 24, itemStyle: { color, borderRadius: 4 }, data: rows.map(r => ({ value: +r.value.toFixed(1), label: { show: true, position: r.value < 0 ? 'left' : 'right', color: p.fg, formatter: () => valueFmt(r.value) } })) }],
  }
}
const ACTION_TONE: Record<string, string> = { 'Reduce price': 'bad', 'Raise price': 'good', 'Hold (premium justified)': 'info', 'Manual review': 'warn', Monitor: 'neutral' }

export default function Actions() {
  const { pairs, benchmark, meta } = useAnalysis()
  const { palette: p } = useTheme()
  const [n, setN] = useState(5)
  const [thr, setThr] = useState(10), [margin, setMargin] = useState(3), [step, setStep] = useState(15)
  const [cat, setCat] = useState('All shared categories')
  const recs = useRecommendations(thr, margin, step)

  const top = useMemo(() => ({
    over: [...pairs].filter(r => r.pct_diff > 0).sort((a, b) => b.pct_diff - a.pct_diff).slice(0, n),
    under: [...pairs].filter(r => r.pct_diff < 0).sort((a, b) => a.pct_diff - b.pct_diff).slice(0, n),
  }), [pairs, n])
  const tipFor = (r: (typeof pairs)[number]) => `<b>${r.our_name}</b><br/>vs ${r.comp_name}<br/>You ${money(r.our_price)} · Competitor ${money(r.comp_price)}<br/>Match confidence: ${r.confidence}`
  const overOpt = useMemo(() => hbar(p, top.over.map(r => ({ label: r.our_name, value: r.pct_diff, tip: tipFor(r) })), p.bad, v => `${pct(v, 0)} (${money(Math.abs(top.over.find(r => r.pct_diff === v)?.diff ?? 0), 0)})`), [top, p])
  const underOpt = useMemo(() => hbar(p, top.under.map(r => ({ label: r.our_name, value: r.pct_diff, tip: tipFor(r) })), p.good, v => `${pct(v, 0)} (${money(Math.abs(top.under.find(r => r.pct_diff === v)?.diff ?? 0), 0)})`), [top, p])

  const bm = useMemo(() => cat.startsWith('All') ? benchmark : benchmark.filter(r => r.category === cat), [benchmark, cat])
  const hi = [...bm].sort((a, b) => b.vs_cat_pct - a.vs_cat_pct).slice(0, 10), lo = [...bm].sort((a, b) => a.vs_cat_pct - b.vs_cat_pct).slice(0, 10)
  const hiOpt = useMemo(() => hbar(p, hi.map(r => ({ label: r.name, value: r.vs_cat_pct })), p.bad, v => pct(v, 0)), [hi, p])
  const loOpt = useMemo(() => hbar(p, lo.map(r => ({ label: r.name, value: r.vs_cat_pct })), p.good, v => pct(v, 0)), [lo, p])

  const recCols: ColumnDef<Recommendation>[] = [
    { header: 'Your product', accessorKey: 'our_name', cell: c => <span className="font-medium">{c.getValue<string>()}</span> },
    { header: 'Matched competitor product', accessorKey: 'comp_name', cell: c => <span className="text-muted">{c.getValue<string>()}</span> },
    { header: 'Confidence', accessorKey: 'confidence', cell: c => <Badge tone={confidenceTone(c.getValue<string>())}>{c.getValue<string>()}</Badge> },
    { header: 'Your price', accessorKey: 'our_price', cell: c => money(c.getValue<number>()) }, { header: 'Competitor', accessorKey: 'comp_price', cell: c => money(c.getValue<number>()) },
    { header: 'Gap', accessorKey: 'pct_diff', cell: c => <span className={`font-semibold ${c.getValue<number>() > 0 ? 'text-bad' : 'text-good'}`}>{pct(c.getValue<number>())}</span> },
    { header: 'Action', accessorKey: 'action', cell: c => <Badge tone={ACTION_TONE[c.getValue<string>()]}>{c.getValue<string>()}</Badge> },
    { header: 'Suggested', accessorKey: 'suggested_price', cell: c => <b>{money(c.getValue<number>())}</b> },
    { header: 'Change', accessorKey: 'price_change', cell: c => <span className={c.getValue<number>() > 0 ? 'text-good' : c.getValue<number>() < 0 ? 'text-bad' : 'text-muted'}>{c.getValue<number>() > 0 ? '+' : ''}{money(c.getValue<number>())}</span> },
    { header: 'Rationale', accessorKey: 'rationale', cell: c => <span className="block min-w-64 text-xs text-muted">{c.getValue<string>()}</span> },
  ]
  const bmCols: ColumnDef<BenchmarkRow>[] = [
    { header: 'Product', accessorKey: 'name', cell: c => <span className="font-medium">{c.getValue<string>()}</span> }, { header: 'Brand', accessorKey: 'brand' }, { header: 'Category', accessorKey: 'category' },
    { header: 'Your price', accessorKey: 'price', cell: c => money(c.getValue<number>()) }, { header: 'Comp. category median', accessorKey: 'comp_cat_median', cell: c => money(c.getValue<number>()) },
    { header: 'vs median', accessorKey: 'vs_cat_pct', cell: c => <span className={`font-semibold ${c.getValue<number>() > 0 ? 'text-bad' : 'text-good'}`}>{pct(c.getValue<number>())}</span> },
    { header: 'Percentile', accessorKey: 'percentile', cell: c => num(c.getValue<number>()) },
    { header: 'vs same brand', accessorKey: 'vs_brand_pct', cell: c => c.getValue<number | null>() == null ? '—' : pct(c.getValue<number>()) },
    { header: '★', accessorKey: 'rating', cell: c => num(c.getValue<number | null>(), 1) },
  ]
  const counts = (recs.data ?? []).reduce<Record<string, number>>((a, r) => ((a[r.action] = (a[r.action] ?? 0) + 1), a), {})
  const cats = ['All shared categories', ...Array.from(new Set(benchmark.map(r => r.category))).sort()]

  return (
    <>
      <PageHeader title="Gaps & actions" subtitle="Where prices diverge most, and what to do about it." />
      {!pairs.length ? <EmptyState title="No matched products at the current settings">Adjust the matching options in <b>Filters</b>.</EmptyState> : (
        <>
          <Card title="Largest price gaps (matched products)" actions={pairs.length > 3 ? <div className="w-56"><Slider label="Show per side" value={n} min={3} max={Math.min(15, pairs.length)} onChange={setN} /></div> : null}>
            <Grid cols={2}>
              <div><div className="mb-1 text-sm font-semibold text-bad">Where you're most expensive</div>{top.over.length ? <Chart option={overOpt} height={Math.max(160, 46 * top.over.length + 40)} /> : <p className="py-10 text-center text-sm text-good">You're not pricier on any matched product.</p>}</div>
              <div><div className="mb-1 text-sm font-semibold text-good">Where you're most under-priced</div>{top.under.length ? <Chart option={underOpt} height={Math.max(160, 46 * top.under.length + 40)} /> : <p className="py-10 text-center text-sm text-muted">You're not cheaper on any matched product.</p>}</div>
            </Grid>
          </Card>

          <Card className="mt-4" title="Recommended pricing actions" subtitle="Decision support only — rules use price gap and rating, and ignore cost, margin and demand. Low-confidence matches go to manual review."
            actions={<span className="text-xs text-muted">{recs.isFetching ? 'updating…' : ''}</span>}>
            <Grid cols={3} className="mb-4">
              <Slider label="Act when gap exceeds" value={thr} min={3} max={30} onChange={setThr} format={v => `${v}%`} />
              <Slider label="Undercut competitor by (when raising)" value={margin} min={0} max={10} onChange={setMargin} format={v => `${v}%`} />
              <Slider label="Max price move per cycle" value={step} min={5} max={40} onChange={setStep} format={v => `${v}%`} />
            </Grid>
            <Grid cols={4} className="mb-4">
              <KpiCard label="Reduce price" value={counts['Reduce price'] ?? 0} sub="products" tone="bad" />
              <KpiCard label="Raise price" value={counts['Raise price'] ?? 0} sub="products" tone="good" />
              <KpiCard label="Hold (premium)" value={counts['Hold (premium justified)'] ?? 0} sub="products" />
              <KpiCard label="Manual review" value={counts['Manual review'] ?? 0} sub="products" tone="warn" />
            </Grid>
            <DataTable data={recs.data ?? []} columns={recCols} pageSize={8} csvName="pricing_recommendations.csv" />
          </Card>
        </>
      )}

      <Card className="mt-4" title="Market benchmark — every product, matched or not" subtitle="Each of your products vs the competitor's price distribution in the same category."
        actions={<Select value={cat} onChange={setCat} options={cats} />}>
        {!benchmark.length ? <p className="py-10 text-center text-sm text-muted">No shared categories to benchmark against.</p> : (
          <>
            <Grid cols={2}>
              <div><div className="mb-1 text-sm font-semibold">Priced highest vs competitor median</div><Chart option={hiOpt} height={340} /></div>
              <div><div className="mb-1 text-sm font-semibold">Priced lowest vs competitor median</div><Chart option={loOpt} height={340} /></div>
            </Grid>
            <div className="mt-4"><DataTable data={bm} columns={bmCols} pageSize={8} initialSort={[{ id: 'vs_cat_pct', desc: true }]} csvName="market_benchmark.csv" dense /></div>
          </>
        )}
      </Card>
    </>
  )
}
