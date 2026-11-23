/**
 * Price Comparison page (route "/pricing").
 *
 * Head-to-head prices for matched products: a price-vs-price scatter plot, a "price ladder" (one row per pair, showing both
 * prices joined by a coloured line), and a per-category summary of who is cheaper.
 */
import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Chart } from '../components/Chart'
import { DataTable } from '../components/DataTable'
import { Badge, Card, EmptyState, PageHeader, Segmented } from '../components/ui'
import { useAnalysis } from '../lib/queries'
import { useTheme } from '../lib/theme'
import { POS_COLOR, dumbbell, grid, legend, tooltip, valueAxis } from '../lib/chartKit'
import { groupBy, money, pct } from '../lib/utils'

// The three price positions, in display order.
const POS = ['Cheaper', 'At par', 'Pricier'] as const

/** Scatter + ladder + category table for the matched pairs. */
export default function Pricing() {
  const { pairs, meta } = useAnalysis()
  const { palette: p } = useTheme()
  const [sort, setSort] = useState<'Largest gap' | 'Your price' | 'Match score'>('Largest gap')
  const col = POS_COLOR(p)
  const prices = pairs.flatMap(r => [r.our_price, r.comp_price])
  // Use a log price axis automatically when the cheapest and dearest products differ by more than 20x, so both stay readable.
  const useLog = prices.length > 0 && Math.max(...prices) / Math.min(...prices) > 20   // keeps cheap and expensive items readable together

  // Scatter: x = competitor price, y = your price. A point BELOW the dashed parity line means you're cheaper.
  // One series per position (so the legend/colours come for free) plus a parity line.
  const scatter = useMemo(() => {
    const lo = Math.min(...prices) * 0.8, hi = Math.max(...prices) * 1.1
    return {
      grid: grid({ top: 40, bottom: 36 }), legend: legend(p),
      tooltip: tooltip(p, { trigger: 'item', formatter: (x: any) => (x.value[2] ? `<b>${x.value[2]}</b><br/>You ${money(x.value[1])} · Competitor ${money(x.value[0])}<br/>${pct(x.value[3])}` : '') }),
      xAxis: valueAxis(p, { name: `${meta.comp_name} price`, nameLocation: 'middle', nameGap: 28, axisLabel: { color: p.muted, formatter: (v: number) => money(v, 0) } }),
      yAxis: valueAxis(p, { axisLabel: { color: p.muted, formatter: (v: number) => money(v, 0) } }),
      series: [
        ...POS.map(pos => ({ name: pos, type: 'scatter', symbolSize: 14, itemStyle: { color: col[pos], borderColor: p.surface, borderWidth: 2 }, data: pairs.filter(r => r.position === pos).map(r => [r.comp_price, r.our_price, r.label, r.pct_diff]) })),
        // The y = x reference line from the lowest to the highest price.
        { name: 'Parity', type: 'line', symbol: 'none', silent: true, lineStyle: { color: p.neutral, type: 'dashed', width: 1.5 }, data: [[lo, lo], [hi, hi]], tooltip: { show: false } },
      ],
    }
  }, [pairs, p, meta])

  // Ladder row order, chosen by the Segmented control: largest gap first, highest price first, or best match first.
  const sorted = useMemo(() => {
    const key = { 'Largest gap': (r: any) => -r.abs_pct_diff, 'Your price': (r: any) => -r.our_price, 'Match score': (r: any) => -r.score }[sort]
    return [...pairs].sort((a, b) => key(a) - key(b))
  }, [pairs, sort])
  // Dumbbell chart (src/lib/chartKit.ts). The connecting line is coloured by price position: green = you're cheaper, red = pricier.
  const ladderOpt = useMemo(() => dumbbell(p, sorted.map(r => ({ label: r.label, a: r.our_price, b: r.comp_price })), meta.our_name, meta.comp_name, useLog,
    it => col[sorted.find(r => r.label === it.label)?.position ?? 'At par']), [sorted, p, meta, useLog])

  // Per-category roll-up of the pairs: count, average gap, how many you win/lose, and which store has better prices
  // (within the "at par" tolerance from the Filters).
  const byCat = useMemo(() => Object.entries(groupBy(pairs, r => r.category)).map(([category, rs]) => {
    const avg = rs.reduce((s, r) => s + r.pct_diff, 0) / rs.length
    return { category, pairs: rs.length, avg_gap: avg, cheaper: rs.filter(r => r.position === 'Cheaper').length, pricier: rs.filter(r => r.position === 'Pricier').length,
      verdict: avg < -meta.tol ? `${meta.our_name} cheaper` : avg > meta.tol ? `${meta.comp_name} cheaper` : 'At par' }
  }), [pairs, meta])
  const cols: ColumnDef<(typeof byCat)[number]>[] = [
    { header: 'Category', accessorKey: 'category', cell: c => <b>{c.getValue<string>()}</b> }, { header: 'Matched pairs', accessorKey: 'pairs' },
    { header: 'Avg gap', accessorKey: 'avg_gap', cell: c => <span className={`tabular font-semibold ${c.getValue<number>() > 0 ? 'text-bad' : 'text-good'}`}>{pct(c.getValue<number>())}</span> },
    { header: 'You cheaper', accessorKey: 'cheaper' }, { header: 'You pricier', accessorKey: 'pricier' },
    { header: 'Better prices', accessorKey: 'verdict', cell: c => <Badge tone={String(c.getValue()).startsWith(meta.our_name) ? 'good' : String(c.getValue()).startsWith(meta.comp_name) ? 'bad' : 'neutral'}>{c.getValue<string>()}</Badge> },
  ]

  // No pairs -> guidance message.
  if (!pairs.length) return <><PageHeader title="Price comparison" /><EmptyState title="No matched products at the current filters">Try <b>Filters → Match reliability → All matches</b>.</EmptyState></>
  return (
    <>
      <PageHeader title="Price comparison" subtitle="Head-to-head prices on matched products." />
      <Card title="Price vs price" subtitle="Each dot is one product pair. Dots below the dashed line are cheaper at your store.">
        <Chart option={scatter} height={380} />
      </Card>
      <Card className="mt-4" title="Price ladder" subtitle="Blue = your price, amber = competitor. Line colour shows who wins: green = you're cheaper, red = pricier."
        actions={<Segmented size="sm" options={['Largest gap', 'Your price', 'Match score'] as const} value={sort} onChange={setSort} />}>
        <Chart option={ladderOpt} height={Math.max(300, 34 * sorted.length + 100)} />
      </Card>
      <Card className="mt-4" title="Who is cheaper, by category"><DataTable data={byCat} columns={cols} searchable={false} pageSize={20} dense /></Card>
    </>
  )
}
