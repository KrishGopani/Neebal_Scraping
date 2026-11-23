/**
 * Quality & Value page (route "/quality").
 *
 * Answers: "does a price premium (or discount) come with better customer ratings?" Matched pairs are placed in four
 * quadrants by price gap and rating gap — "At risk" (pricier AND lower-rated) is the most dangerous. A second chart (value map)
 * plots price vs rating for every product in one category, for both stores.
 */
import { useMemo, useState } from 'react'
import { Chart } from '../components/Chart'
import { Card, EmptyState, Grid, KpiCard, PageHeader, Select } from '../components/ui'
import { useAnalysis } from '../lib/queries'
import { useTheme } from '../lib/theme'
import { grid, legend, tooltip, valueAxis } from '../lib/chartKit'
import { money, pct } from '../lib/utils'

// The four price/rating quadrants, in display order.
const QUADS = ['At risk', 'Premium', 'Strong value', 'Under-priced'] as const
// One-line meaning of each quadrant.
const QDESC: Record<string, string> = { 'At risk': 'pricier & lower-rated', Premium: 'pricier & better-rated', 'Strong value': 'cheaper & better-rated', 'Under-priced': 'cheaper & lower-rated' }

/** Quadrant scatter + summary tiles + value map. */
export default function Quality() {
  const { pairs, ratings, meta } = useAnalysis()
  const { palette: p } = useTheme()
  // Categories sold by both stores — the only ones where a value-map comparison is fair.
  const shared = useMemo(() => Array.from(new Set(ratings.map(r => r.category))).sort(), [ratings])
  const [cat, setCat] = useState('')
  const vmCat = cat || shared[0] || ''
  const qcol: Record<string, string> = { 'At risk': p.bad, Premium: p.ours, 'Strong value': p.good, 'Under-priced': p.warn }

  // Classify a pair: pricier+lower-rated = At risk; pricier+better-rated = Premium; cheaper+better-rated = Strong value;
  // cheaper+lower-rated = Under-priced.
  const quad = (r: (typeof pairs)[number]) => (r.pct_diff > 0 ? ((r.rating_diff ?? 0) < 0 ? 'At risk' : 'Premium') : (r.rating_diff ?? 0) >= 0 ? 'Strong value' : 'Under-priced')
  // Only pairs where both products have a rating can be placed on the chart.
  const rated = useMemo(() => pairs.filter(r => r.rating_diff != null), [pairs])
  // Scatter: x = price gap %, y = rating gap in stars. The cross-hair at 0/0 splits the four quadrants; dots are coloured by quadrant.
  const quadOpt = useMemo(() => ({
    grid: grid({ top: 44, bottom: 36 }), legend: legend(p), tooltip: tooltip(p, { trigger: 'item', formatter: (x: any) => `<b>${x.value[2]}</b><br/>Price ${pct(x.value[0])} · Rating ${x.value[1] > 0 ? '+' : ''}${x.value[1].toFixed(1)}★` }),
    xAxis: valueAxis(p, { name: 'Price gap vs competitor (%)', nameLocation: 'middle', nameGap: 28, axisLabel: { color: p.muted, formatter: '{value}%' } }), yAxis: valueAxis(p, { axisLabel: { color: p.muted, formatter: (v: number) => `${v > 0 ? '+' : ''}${v}★` } }),
    series: QUADS.map((q, i) => ({
      name: q, type: 'scatter', symbolSize: 15, itemStyle: { color: qcol[q], borderColor: p.surface, borderWidth: 2 },
      data: rated.filter(r => quad(r) === q).map(r => [r.pct_diff, r.rating_diff, r.label]),
      // Draw the 0-lines once (on the first series) instead of once per series.
      markLine: i === 0 ? { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: p.neutral, type: 'solid', width: 1 }, data: [{ xAxis: 0 }, { yAxis: 0 }] } : undefined,
    })),
  }), [rated, p])

  // Value map: price (x) vs rating (y) for every product of the selected category in both stores. Top-left = best value (cheap and well rated).
  const vmOpt = useMemo(() => ({
    grid: grid({ top: 44, bottom: 36 }), legend: legend(p), tooltip: tooltip(p, { trigger: 'item', formatter: (x: any) => `<b>${x.value[2]}</b><br/>${money(x.value[0])} · ${x.value[1]?.toFixed(1)}★` }),
    xAxis: valueAxis(p, { name: 'Price', nameLocation: 'middle', nameGap: 28, axisLabel: { color: p.muted, formatter: (v: number) => money(v, 0) } }), yAxis: valueAxis(p, { min: 0, max: 5, axisLabel: { color: p.muted, formatter: '{value}★' } }),
    series: [meta.our_name, meta.comp_name].map((s, i) => ({ name: s, type: 'scatter', symbol: i ? 'diamond' : 'circle', symbolSize: 11, itemStyle: { color: i ? p.comp : p.ours, opacity: 0.8 },
      data: ratings.filter(r => r.store === s && r.category === vmCat && r.rating != null).map(r => [r.price, r.rating, r.name]) })),
  }), [ratings, vmCat, meta, p])

  // Number of pairs per quadrant for the summary tiles.
  const counts = rated.reduce<Record<string, number>>((a, r) => ((a[quad(r)] = (a[quad(r)] ?? 0) + 1), a), {})
  return (
    <>
      <PageHeader title="Quality & value" subtitle="Does a price premium (or discount) come with better customer ratings?" />
      <Card title="Price vs customer rating" subtitle="Matched products — each dot is a pair">
        {!rated.length ? <EmptyState title="No rated matches at the current filters" /> : (
          <>
            <Grid cols={4} className="mb-4">{QUADS.map(q => <KpiCard key={q} label={q} value={counts[q] ?? 0} sub={QDESC[q]} tone={q === 'At risk' ? 'bad' : q === 'Strong value' ? 'good' : q === 'Under-priced' ? 'warn' : ''} />)}</Grid>
            <Chart option={quadOpt} height={380} />
          </>
        )}
      </Card>
      {shared.length > 0 && (
        <>
          <Card className="mt-4" title={`Value map — ${vmCat}`} subtitle="Top-left = best value (low price, high rating)" actions={<Select value={vmCat} onChange={setCat} options={shared} />}><Chart option={vmOpt} height={380} /></Card>
        </>
      )}
    </>
  )
}
