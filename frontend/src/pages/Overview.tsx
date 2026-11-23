/**
 * Overview page (route "/") — the executive summary.
 *
 * Shows the headline KPIs (price index, win rate, average gap, matches, catalogue size), three charts (price-index gauge, who is
 * cheaper donut, median price gap by category) and the auto-generated business insights. All data comes from the shared Analysis
 * (useAnalysis); the charts are ECharts option objects built in useMemo and rendered by <Chart />.
 */
import { useMemo } from 'react'
import { BadgeDollarSign, Boxes, Link2, Percent, Trophy } from 'lucide-react'
import { Chart } from '../components/Chart'
import { Card, EmptyState, Grid, InsightCard, KpiCard, PageHeader } from '../components/ui'
import { useAnalysis } from '../lib/queries'
import { useTheme } from '../lib/theme'
import { catAxis, grid, legend, padded, tooltip, valueAxis } from '../lib/chartKit'
import { pct } from '../lib/utils'

/** Renders the KPI row, the three charts and the insight cards, or an empty-state message when there are no matched products. */
export default function Overview() {
  const { kpis: k, insights, categories, meta } = useAnalysis()
  const { palette: p } = useTheme()
  // Colour for the big gauge number, taken from the backend's verdict (Price leader = green ... Well above market = red).
  const toneColor = { good: p.good, neutral: p.neutral, warn: p.warn, bad: p.bad, info: p.ours }[k.verdict_tone ?? 'neutral']

  // Gauge: shows the price index on a 40-160 dial. 100 = parity with the competitor; the coloured bands mark leader (<95),
  // at market (95-105), premium (105-120) and well above market (>120).
  const gauge = useMemo(() => k.n ? ({
    series: [{
      type: 'gauge', min: 40, max: 160, startAngle: 200, endAngle: -20, radius: '100%', center: ['50%', '68%'], splitNumber: 6,
      // Each [fraction, colour] pair paints the dial up to that fraction of the 40-160 range: fraction = (value - 40) / 120.
      axisLine: { lineStyle: { width: 16, color: [[(95 - 40) / 120, p.dark ? '#14532d' : '#bbf7d0'], [(105 - 40) / 120, p.dark ? '#334155' : '#e2e8f0'], [(120 - 40) / 120, p.dark ? '#713f12' : '#fde68a'], [1, p.dark ? '#7f1d1d' : '#fecaca']] } },
      pointer: { width: 5, length: '58%', itemStyle: { color: p.fg } }, anchor: { show: true, size: 10, itemStyle: { color: p.fg } },
      axisTick: { show: false }, splitLine: { show: false }, axisLabel: { color: p.muted, distance: 22, fontSize: 11 },
      detail: { formatter: '{value}', fontSize: 38, fontWeight: 700, offsetCenter: [0, '30%'], color: toneColor },
      data: [{ value: Math.round(k.price_index!) }],
    }],
  }) : {}, [k, p, toneColor])

  // Donut of how many matched products are Cheaper / At par / Pricier at your store; the pair count is drawn in the centre.
  const donut = useMemo(() => k.n ? ({
    tooltip: tooltip(p, { trigger: 'item', formatter: '{b}: {c} products ({d}%)' }),
    legend: legend(p, { bottom: 0, top: 'auto', left: 'center' }),
    series: [{
      type: 'pie', radius: ['58%', '80%'], center: ['50%', '45%'], avoidLabelOverlap: true, itemStyle: { borderColor: p.surface, borderWidth: 3, borderRadius: 6 },
      label: { color: p.fg, formatter: '{c}' },
      data: [{ name: 'Cheaper', value: k.n_cheaper, itemStyle: { color: p.good } }, { name: 'At par', value: k.n_par, itemStyle: { color: p.neutral } }, { name: 'Pricier', value: k.n_pricier, itemStyle: { color: p.bad } }],
    }],
    // Text in the middle of the donut hole.
    graphic: [{ type: 'text', left: 'center', top: '36%', style: { text: `${k.n}\npairs`, textAlign: 'center', fill: p.fg, font: '600 20px Inter', lineHeight: 24 } }],
  }) : {}, [k, p])

  // Categories sold by both stores that have a median price gap, sorted most-negative (cheapest for you) first.
  const both = useMemo(() => categories.filter(c => c.coverage === 'Both' && c.median_gap_pct != null).sort((a, b) => a.median_gap_pct! - b.median_gap_pct!), [categories])
  // Horizontal bars of the median price gap per category: green = you're cheaper, red = pricier. Labels sit outside the bar
  // end (left for negative, right for positive); padded() widens the axis so they aren't clipped.
  const gaps = useMemo(() => ({
    grid: grid({ top: 8 }), tooltip: tooltip(p, { trigger: 'item', formatter: (x: any) => `${x.name}<br/>${pct(x.value, 1)} median price gap` }),
    xAxis: valueAxis(p, { ...padded(1.3), axisLabel: { color: p.muted, formatter: '{value}%' } }), yAxis: catAxis(p, both.map(c => c.category), { axisLabel: { color: p.fg } }),
    series: [{ type: 'bar', barMaxWidth: 26, data: both.map(c => ({ value: Math.round(c.median_gap_pct!), itemStyle: { color: c.median_gap_pct! < 0 ? p.good : p.bad, borderRadius: 4 }, label: { show: true, position: c.median_gap_pct! < 0 ? 'left' : 'right', color: p.fg, formatter: '{c}%' } })) }],
  }), [both, p])

  return (
    <>
      <PageHeader title="Overview" subtitle="Where your prices stand against the competitor, and what to do about it." />
      {/* No matched products at the current filters -> explain how to get some, instead of empty charts. */}
      {!k.n ? (
        <div className="mb-5"><EmptyState title="No matched products at the current filters">Open <b>Filters → Match reliability</b> and choose <b>All matches</b>, or widen the category selection.</EmptyState></div>
      ) : (
        <>
          {/* KPI cards. Tone (green/amber/red) reflects whether the number is good news for you. */}
          <Grid cols={5}>
            <KpiCard label="Price index" icon={<BadgeDollarSign size={15} />} value={k.price_index!.toFixed(0)} sub={`${k.verdict} · 100 = parity`} tone={k.verdict_tone === 'neutral' ? '' : (k.verdict_tone as any)} />
            <KpiCard label="Win rate" icon={<Trophy size={15} />} value={`${k.win_rate!.toFixed(0)}%`} sub={`${k.n_cheaper! + k.n_par!} of ${k.n} at/below competitor`} tone={k.win_rate! >= 60 ? 'good' : 'warn'} />
            <KpiCard label="Avg price gap" icon={<Percent size={15} />} value={pct(k.avg_pct_diff)} sub={`median ${pct(k.median_pct_diff)}`} tone={k.avg_pct_diff! < -2 ? 'good' : k.avg_pct_diff! > 2 ? 'bad' : ''} />
            <KpiCard label="Matched products" icon={<Link2 size={15} />} value={k.n} sub={`${k.n_equivalent} exact-model`} />
            <KpiCard label="Catalogue" icon={<Boxes size={15} />} value={`${meta.n_ours} vs ${meta.n_comps}`} sub="your store vs competitor" />
          </Grid>
          {/* The three charts. */}
          <Grid cols={3} className="mt-4">
            <Card title="Price index" subtitle={`${k.verdict} — below 100 means you're cheaper`}><Chart option={gauge} height={250} /></Card>
            <Card title="Who is cheaper" subtitle={`${meta.our_name} vs ${meta.comp_name}`}><Chart option={donut} height={250} /></Card>
            <Card title="Median price gap by category" subtitle="All products, not just matches"><Chart option={gaps} height={250} /></Card>
          </Grid>
        </>
      )}
      {/* Plain-language findings generated by the backend (backend/app/core/insights.py), tinted by importance. */}
      <h2 className="mb-3 mt-7 text-base font-semibold">Business insights</h2>
      <Grid cols={2}>{insights.map((i, n) => <InsightCard key={n} {...i} />)}</Grid>
    </>
  )
}
