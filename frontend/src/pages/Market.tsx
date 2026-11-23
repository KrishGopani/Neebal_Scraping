/**
 * Market & Trends page (route "/market").
 *
 * Broader market context beyond matched pairs:
 *   - Competitor price trends over time (needs 2+ scrape snapshots; otherwise shows the current price spread by category).
 *   - Competitor discounting strategy (how many products are discounted, average/deepest discount, by category).
 *   - Assortment: products listed per category per store, price-tier mix, and categories only one store sells.
 *   - Competitor stock pressure: products that are out of / low on stock (a chance to win demand).
 */
import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Info } from 'lucide-react'
import { Chart } from '../components/Chart'
import { DataTable } from '../components/DataTable'
import { Card, Grid, KpiCard, PageHeader, Select } from '../components/ui'
import { useAnalysis } from '../lib/queries'
import { useTheme } from '../lib/theme'
import { catAxis, grid, legend, logTicks, tooltip, valueAxis } from '../lib/chartKit'
import { boxStats, groupBy, money, pct } from '../lib/utils'

/** All Market & Trends sections; data comes from `analysis.market` (backend/app/core/pipeline.py -> _market). */
export default function Market() {
  const { market: m, meta, categories } = useAnalysis()
  const { palette: p } = useTheme()
  // Categories sold by both stores; they're listed first in the trend dropdown because that's where a comparison is meaningful.
  const sharedCats = useMemo(() => new Set(categories.filter(c => c.coverage === 'Both').map(c => c.category)), [categories])
  // Categories present in the price history, shared ones first.
  const trendCats = useMemo(() => Array.from(new Set(m.trend.series.map(s => s.category))).sort((a, b) => Number(!sharedCats.has(a)) - Number(!sharedCats.has(b)) || a.localeCompare(b)), [m, sharedCats])
  const [cat, setCat] = useState('')
  const tc = cat || trendCats[0] || ''

  // Line chart of the MEDIAN price per category over time, one line per store. One point per scrape snapshot.
  const trendOpt = useMemo(() => ({
    grid: grid({ top: 44 }), legend: legend(p), tooltip: tooltip(p, { trigger: 'axis' }),
    xAxis: { type: 'time', axisLabel: { color: p.muted }, axisLine: { lineStyle: { color: p.line } } }, yAxis: valueAxis(p, { scale: true, axisLabel: { color: p.muted, formatter: (v: number) => money(v, 0) } }),
    series: [meta.our_name, meta.comp_name].map((s, i) => ({ name: s, type: 'line', symbolSize: 8, smooth: false, itemStyle: { color: i ? p.comp : p.ours }, lineStyle: { width: 3 },
      data: m.trend.series.filter(r => r.store === s && r.category === tc).map(r => [r.scraped_at, r.median_price]) })),
  }), [m, tc, meta, p])

  // Fallback when there's only one snapshot: box-plot of today's prices per category and store on a log axis (box = middle 50%
  // of products, line = median, whiskers = min/max).
  const spreadOpt = useMemo(() => {
    const cats = Array.from(new Set(m.price_spread.map(r => r.category))).sort()
    const g = groupBy(m.price_spread, r => `${r.store}|${r.category}`)
    const all = m.price_spread.map(r => r.price)
    return { grid: grid({ top: 44 }), legend: legend(p), tooltip: tooltip(p, { trigger: 'item' }), xAxis: catAxis(p, cats),
      yAxis: valueAxis(p, { type: 'log', min: Math.min(...logTicks(Math.min(...all), Math.max(...all))), axisLabel: { color: p.muted, formatter: (v: number) => money(v, 0) } }),
      series: [meta.our_name, meta.comp_name].map((s, i) => ({ name: s, type: 'boxplot', itemStyle: { color: 'transparent', borderColor: i ? p.comp : p.ours, borderWidth: 2 }, data: cats.map(c => boxStats((g[`${s}|${c}`] ?? []).map(r => r.price)) ?? []) })) }
  }, [m, meta, p])

  // Average listed discount per category in the competitor's catalogue (tooltip also shows the maximum).
  const discBar = useMemo(() => {
    const rows = [...m.discount_by_category].sort((a, b) => a.mean - b.mean)
    return { grid: grid({ top: 8 }), tooltip: tooltip(p, { trigger: 'item', formatter: (x: any) => `${x.name}: avg ${x.value}% (max ${rows[x.dataIndex].max.toFixed(0)}%)` }), xAxis: valueAxis(p, { axisLabel: { color: p.muted, formatter: '{value}%' } }), yAxis: catAxis(p, rows.map(r => r.category), { axisLabel: { color: p.fg } }),
      series: [{ type: 'bar', barMaxWidth: 20, itemStyle: { color: p.comp, borderRadius: 4 }, label: { show: true, position: 'right', color: p.fg, formatter: '{c}%' }, data: rows.map(r => +r.mean.toFixed(1)) }] }
  }, [m, p])
  // Number of products each store lists per category, categories sorted by total size.
  const assortOpt = useMemo(() => {
    const cats = Array.from(new Set(m.assortment.map(r => r.category)))
    const tot = (c: string) => m.assortment.filter(r => r.category === c).reduce((s, r) => s + r.products, 0)
    cats.sort((a, b) => tot(a) - tot(b))
    const val = (s: string, c: string) => m.assortment.find(r => r.store === s && r.category === c)?.products ?? 0
    return { grid: grid({ top: 44 }), legend: legend(p), tooltip: tooltip(p, { trigger: 'axis', axisPointer: { type: 'shadow' } }), xAxis: valueAxis(p), yAxis: catAxis(p, cats, { axisLabel: { color: p.fg } }),
      series: [meta.our_name, meta.comp_name].map((s, i) => ({ name: s, type: 'bar', barMaxWidth: 14, itemStyle: { color: i ? p.comp : p.ours, borderRadius: 3 }, data: cats.map(c => val(s, c)) })) }
  }, [m, meta, p])
  // 100%-stacked bars: share of each catalogue falling in each price band (<$50, $50-150 ... >$2.5k) — shows who sells cheap vs premium.
  const bandOpt = useMemo(() => {
    const bands = Array.from(new Set(m.price_bands.map(b => b.band)))
    const stores = [meta.our_name, meta.comp_name]
    const shades = p.dark ? ['#1e3a8a', '#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd'] : ['#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#1d4ed8']
    return { grid: grid({ top: 44 }), legend: legend(p), tooltip: tooltip(p, { trigger: 'item', formatter: (x: any) => `${x.seriesName} · ${x.name}: ${x.value.toFixed(1)}%` }), xAxis: catAxis(p, stores), yAxis: valueAxis(p, { max: 100, axisLabel: { color: p.muted, formatter: '{value}%' } }),
      series: bands.map((b, i) => ({ name: b, type: 'bar', stack: 's', barMaxWidth: 90, itemStyle: { color: shades[i % shades.length] }, data: stores.map(s => m.price_bands.find(x => x.store === s && x.band === b)?.share ?? 0) })) }
  }, [m, meta, p])

  // Helper: categories with the given coverage ('Only competitor' / 'Only you').
  const only = (c: string) => categories.filter(x => x.coverage === c)
  // Low-stock table columns.
  const stockCols: ColumnDef<(typeof m.stock_low)[number]>[] = [
    { header: 'Product', accessorKey: 'name' }, { header: 'Category', accessorKey: 'category' }, { header: 'Price', accessorKey: 'price', cell: c => money(c.getValue<number>()) },
    { header: 'Stock', accessorKey: 'stock' }, { header: 'Availability', accessorKey: 'availability' }]
  // Price-change table columns (before/now/% change between the last two scrapes).
  const chgCols: ColumnDef<(typeof m.trend.changes)[number]>[] = [
    { header: 'Store', accessorKey: 'store' }, { header: 'Product', accessorKey: 'name' }, { header: 'Category', accessorKey: 'category' },
    { header: 'Before', accessorKey: 'price_prev', cell: c => money(c.getValue<number>()) }, { header: 'Now', accessorKey: 'price', cell: c => money(c.getValue<number>()) },
    { header: 'Δ %', accessorKey: 'change_pct', cell: c => <span className={c.getValue<number>() > 0 ? 'text-bad' : 'text-good'}>{pct(c.getValue<number>())}</span> }]

  return (
    <>
      <PageHeader title="Market & trends" subtitle="Price movement over time, competitor discounting, and assortment structure." />
      <Card title="Competitor pricing trends" subtitle={`${m.trend.n_snapshots} scrape snapshot${m.trend.n_snapshots === 1 ? '' : 's'} stored`}
        actions={m.trend.n_snapshots >= 2 ? <Select value={tc} onChange={setCat} options={trendCats} /> : null}>
        {/* Two or more snapshots -> real trend chart + change table; otherwise an explanation and the current price spread. */}
        {m.trend.n_snapshots >= 2 ? (
          <>
            <Chart option={trendOpt} height={320} />
            <h4 className="mb-2 mt-4 text-sm font-semibold">Price changes since the previous scrape</h4>
            {m.trend.changes.length ? <DataTable data={m.trend.changes} columns={chgCols} pageSize={6} dense /> : <p className="text-sm text-muted">No product changed price between the last two scrapes.</p>}
          </>
        ) : (
          <>
            <div className="mb-3 flex gap-2 rounded-xl bg-brand-soft p-3 text-sm text-brand"><Info size={16} className="mt-0.5 shrink-0" /><span>Each scrape is saved as an immutable snapshot. Trend lines and price-change alerts appear once you've scraped at least twice — use <b>Run scrape</b>, or schedule <code>python -m app.scrapers.runner</code> with cron. Until then, here is the current price landscape.</span></div>
            <Chart option={spreadOpt} height={340} />
          </>
        )}
      </Card>

      {/* Discounting: three KPI tiles + a chart. The tip underneath only appears when headline (not post-discount) prices are being compared. */}
      <Card className="mt-4" title="Competitor discounting strategy" subtitle={m.discount_values.length ? `${m.discount_share.toFixed(0)}% of competitor products carry a listed discount` : undefined}>
        {m.discount_values.length ? (
          <>
            <Grid cols={3} className="mb-4">
              <KpiCard label="Products discounted" value={`${m.discount_share.toFixed(0)}%`} sub="of the competitor catalogue" tone="warn" />
              <KpiCard label="Average discount" value={`${(m.discount_values.reduce((a, b) => a + b, 0) / m.discount_values.length).toFixed(1)}%`} sub="across discounted products" />
              <KpiCard label="Deepest discount" value={`${Math.max(...m.discount_values).toFixed(0)}%`} sub="single product" />
            </Grid>
            <div className="mb-1 text-sm font-semibold">Average listed discount by category</div>
            <Chart option={discBar} height={Math.max(260, 28 * m.discount_by_category.length + 60)} />
          </>
        ) : <p className="py-8 text-center text-sm text-muted">{meta.comp_name} shows no listed discounts.</p>}
        {!meta.effective && m.discount_values.length > 0 && <p className="mt-2 text-xs text-muted">💡 Headline prices are compared by default. Enable <b>post-discount prices</b> in Filters to see the competitor's effective price.</p>}
      </Card>

      <Grid cols={2} className="mt-4">
        {/* Assortment structure: listings per category and price-tier mix. */}
        <Card title="Products listed per category"><Chart option={assortOpt} height={Math.max(300, 34 * new Set(m.assortment.map(a => a.category)).size + 80)} /></Card>
        <Card title="Price-tier mix" subtitle="Share of each catalogue by price band"><Chart option={bandOpt} height={Math.max(300, 34 * new Set(m.assortment.map(a => a.category)).size + 80)} /></Card>
      </Grid>
      <Grid cols={2} className="mt-4">
        <KpiCard label="Competitor-only categories" value={only('Only competitor').length} sub={`${only('Only competitor').reduce((s, c) => s + (c.comp_n ?? 0), 0)} products you don't sell`} tone={only('Only competitor').length ? 'warn' : ''} />
        <KpiCard label="Your exclusive categories" value={only('Only you').length} sub={only('Only you').map(c => c.category).join(', ') || 'none'} tone={only('Only you').length ? 'good' : ''} />
      </Grid>

      {/* Only shown when the competitor has low/out-of-stock products. */}
      {m.stock_low.length > 0 && <Card className="mt-4" title="Competitor stock pressure" subtitle={`${m.stock_low.length} competitor products have fewer than 10 units in stock — a possible opening to win demand.`}><DataTable data={m.stock_low} columns={stockCols} pageSize={6} dense /></Card>}
    </>
  )
}
