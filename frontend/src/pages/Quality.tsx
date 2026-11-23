import { useMemo, useState } from 'react'
import { Chart } from '../components/Chart'
import { Card, EmptyState, Grid, KpiCard, PageHeader, Select } from '../components/ui'
import { useAnalysis } from '../lib/queries'
import { useTheme } from '../lib/theme'
import { catAxis, grid, legend, tooltip, valueAxis } from '../lib/chartKit'
import { boxStats, groupBy, money, pct } from '../lib/utils'

const QUADS = ['At risk', 'Premium', 'Strong value', 'Under-priced'] as const
const QDESC: Record<string, string> = { 'At risk': 'pricier & lower-rated', Premium: 'pricier & better-rated', 'Strong value': 'cheaper & better-rated', 'Under-priced': 'cheaper & lower-rated' }

export default function Quality() {
  const { pairs, ratings, meta } = useAnalysis()
  const { palette: p } = useTheme()
  const shared = useMemo(() => Array.from(new Set(ratings.map(r => r.category))).sort(), [ratings])
  const [cat, setCat] = useState('')
  const vmCat = cat || shared[0] || ''
  const qcol: Record<string, string> = { 'At risk': p.bad, Premium: p.ours, 'Strong value': p.good, 'Under-priced': p.warn }

  const quad = (r: (typeof pairs)[number]) => (r.pct_diff > 0 ? ((r.rating_diff ?? 0) < 0 ? 'At risk' : 'Premium') : (r.rating_diff ?? 0) >= 0 ? 'Strong value' : 'Under-priced')
  const rated = useMemo(() => pairs.filter(r => r.rating_diff != null), [pairs])
  const quadOpt = useMemo(() => ({
    grid: grid({ top: 44, bottom: 36 }), legend: legend(p), tooltip: tooltip(p, { trigger: 'item', formatter: (x: any) => `<b>${x.value[2]}</b><br/>Price ${pct(x.value[0])} · Rating ${x.value[1] > 0 ? '+' : ''}${x.value[1].toFixed(1)}★` }),
    xAxis: valueAxis(p, { name: 'Price gap vs competitor (%)', nameLocation: 'middle', nameGap: 28, axisLabel: { color: p.muted, formatter: '{value}%' } }), yAxis: valueAxis(p, { axisLabel: { color: p.muted, formatter: (v: number) => `${v > 0 ? '+' : ''}${v}★` } }),
    series: QUADS.map((q, i) => ({
      name: q, type: 'scatter', symbolSize: 15, itemStyle: { color: qcol[q], borderColor: p.surface, borderWidth: 2 },
      data: rated.filter(r => quad(r) === q).map(r => [r.pct_diff, r.rating_diff, r.label]),
      markLine: i === 0 ? { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: p.neutral, type: 'solid', width: 1 }, data: [{ xAxis: 0 }, { yAxis: 0 }] } : undefined,
    })),
  }), [rated, p])

  const boxOpt = useMemo(() => {
    const g = groupBy(ratings.filter(r => r.rating != null), r => `${r.store}|${r.category}`)
    const series = [meta.our_name, meta.comp_name].map((s, i) => ({
      name: s, type: 'boxplot', itemStyle: { color: 'transparent', borderColor: i ? p.comp : p.ours, borderWidth: 2 },
      data: shared.map(c => boxStats((g[`${s}|${c}`] ?? []).map(r => r.rating!)) ?? []),
    }))
    return { grid: grid({ top: 44 }), legend: legend(p), tooltip: tooltip(p, { trigger: 'item' }), xAxis: catAxis(p, shared), yAxis: valueAxis(p, { min: 0, max: 5, axisLabel: { color: p.muted, formatter: '{value}★' } }), series }
  }, [ratings, shared, meta, p])

  const reviewOpt = useMemo(() => {
    const g = groupBy(ratings, r => `${r.store}|${r.category}`)
    const avg = (s: string, c: string) => { const v = (g[`${s}|${c}`] ?? []).map(r => r.review_count ?? 0); return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : 0 }
    return { grid: grid({ top: 44 }), legend: legend(p), tooltip: tooltip(p, { trigger: 'axis', axisPointer: { type: 'shadow' } }), xAxis: catAxis(p, shared), yAxis: valueAxis(p),
      series: [meta.our_name, meta.comp_name].map((s, i) => ({ name: s, type: 'bar', barMaxWidth: 30, itemStyle: { color: i ? p.comp : p.ours, borderRadius: [4, 4, 0, 0] }, data: shared.map(c => avg(s, c)) })) }
  }, [ratings, shared, meta, p])

  const vmOpt = useMemo(() => ({
    grid: grid({ top: 44, bottom: 36 }), legend: legend(p), tooltip: tooltip(p, { trigger: 'item', formatter: (x: any) => `<b>${x.value[2]}</b><br/>${money(x.value[0])} · ${x.value[1]?.toFixed(1)}★` }),
    xAxis: valueAxis(p, { name: 'Price', nameLocation: 'middle', nameGap: 28, axisLabel: { color: p.muted, formatter: (v: number) => money(v, 0) } }), yAxis: valueAxis(p, { min: 0, max: 5, axisLabel: { color: p.muted, formatter: '{value}★' } }),
    series: [meta.our_name, meta.comp_name].map((s, i) => ({ name: s, type: 'scatter', symbol: i ? 'diamond' : 'circle', symbolSize: 11, itemStyle: { color: i ? p.comp : p.ours, opacity: 0.8 },
      data: ratings.filter(r => r.store === s && r.category === vmCat && r.rating != null).map(r => [r.price, r.rating, r.name]) })),
  }), [ratings, vmCat, meta, p])

  const counts = rated.reduce<Record<string, number>>((a, r) => ((a[quad(r)] = (a[quad(r)] ?? 0) + 1), a), {})
  return (
    <>
      <PageHeader title="Quality & value" subtitle="Does a price premium (or discount) come with better customer ratings?" />
      <Card title="Price vs customer rating" subtitle="Matched products — each dot is a pair">
        {!rated.length ? <EmptyState title="No rated matches at the current settings" /> : (
          <>
            <Grid cols={4} className="mb-4">{QUADS.map(q => <KpiCard key={q} label={q} value={counts[q] ?? 0} sub={QDESC[q]} tone={q === 'At risk' ? 'bad' : q === 'Strong value' ? 'good' : q === 'Under-priced' ? 'warn' : ''} />)}</Grid>
            <Chart option={quadOpt} height={380} />
          </>
        )}
      </Card>
      {shared.length > 0 && (
        <>
          <Grid cols={2} className="mt-4">
            <Card title="Rating distribution by category" subtitle="Box = interquartile range, line = median"><Chart option={boxOpt} height={340} /></Card>
            <Card title="Average reviews per product" subtitle="Social proof"><Chart option={reviewOpt} height={340} /></Card>
          </Grid>
          <Card className="mt-4" title={`Value map — ${vmCat}`} subtitle="Top-left = best value (low price, high rating)" actions={<Select value={vmCat} onChange={setCat} options={shared} />}><Chart option={vmOpt} height={380} /></Card>
        </>
      )}
    </>
  )
}
