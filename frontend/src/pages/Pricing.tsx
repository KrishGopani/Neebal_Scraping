import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Chart } from '../components/Chart'
import { DataTable } from '../components/DataTable'
import { Badge, Card, EmptyState, Grid, PageHeader, Segmented, Toggle } from '../components/ui'
import { useAnalysis } from '../lib/queries'
import { useTheme } from '../lib/theme'
import { POS_COLOR, catAxis, dumbbell, grid, legend, tooltip, valueAxis } from '../lib/chartKit'
import { groupBy, money, pct } from '../lib/utils'

const POS = ['Cheaper', 'At par', 'Pricier'] as const

export default function Pricing() {
  const { pairs, meta } = useAnalysis()
  const { palette: p } = useTheme()
  const [sort, setSort] = useState<'Largest gap' | 'Your price' | 'Match score'>('Largest gap')
  const col = POS_COLOR(p)
  const prices = pairs.flatMap(r => [r.our_price, r.comp_price])
  const [log, setLog] = useState<boolean | null>(null)
  const useLog = log ?? (prices.length ? Math.max(...prices) / Math.min(...prices) > 20 : false)

  const scatter = useMemo(() => {
    const lo = Math.min(...prices) * 0.8, hi = Math.max(...prices) * 1.1
    return {
      grid: grid({ top: 40, bottom: 36 }), legend: legend(p), tooltip: tooltip(p, { trigger: 'item', formatter: (x: any) => x.value[2] ? `<b>${x.value[2]}</b><br/>You ${money(x.value[1])} · Competitor ${money(x.value[0])}<br/>${pct(x.value[3])}` : '' }),
      xAxis: valueAxis(p, { name: `${meta.comp_name} price (x)  ·  ${meta.our_name} price (y)`, nameLocation: 'middle', nameGap: 28, axisLabel: { color: p.muted, formatter: (v: number) => money(v, 0) } }),
      yAxis: valueAxis(p, { axisLabel: { color: p.muted, formatter: (v: number) => money(v, 0) } }),
      series: [
        ...POS.map(pos => ({ name: pos, type: 'scatter', symbolSize: 14, itemStyle: { color: col[pos], borderColor: p.surface, borderWidth: 2 }, data: pairs.filter(r => r.position === pos).map(r => [r.comp_price, r.our_price, r.label, r.pct_diff]) })),
        { name: 'Parity', type: 'line', symbol: 'none', silent: true, lineStyle: { color: p.neutral, type: 'dashed', width: 1.5 }, data: [[lo, lo], [hi, hi]], tooltip: { show: false } },
      ],
    }
  }, [pairs, p, meta])

  const hist = useMemo(() => {
    const v = pairs.map(r => r.pct_diff), mn = Math.min(...v), mx = Math.max(...v), n = 12
    const w = (mx - mn) / n || 1
    const bins = Array.from({ length: n }, (_, i) => ({ lo: mn + i * w, hi: mn + (i + 1) * w }))
    const count = (pos: string, b: { lo: number; hi: number }, last: boolean) => pairs.filter(r => r.position === pos && r.pct_diff >= b.lo && (last ? r.pct_diff <= b.hi : r.pct_diff < b.hi)).length
    return {
      grid: grid({ top: 40, bottom: 36 }), legend: legend(p), tooltip: tooltip(p, { trigger: 'axis', axisPointer: { type: 'shadow' } }),
      xAxis: catAxis(p, bins.map(b => `${b.lo.toFixed(0)}%`), { name: 'Price gap vs competitor', nameLocation: 'middle', nameGap: 28 }),
      yAxis: valueAxis(p, { minInterval: 1 }),
      series: POS.map(pos => ({ name: pos, type: 'bar', stack: 'a', barCategoryGap: '8%', itemStyle: { color: col[pos] }, data: bins.map((b, i) => count(pos, b, i === n - 1)) })),
    }
  }, [pairs, p])

  const sorted = useMemo(() => {
    const key = { 'Largest gap': (r: any) => -r.abs_pct_diff, 'Your price': (r: any) => -r.our_price, 'Match score': (r: any) => -r.score }[sort]
    return [...pairs].sort((a, b) => key(a) - key(b))
  }, [pairs, sort])
  const ladderOpt = useMemo(() => dumbbell(p, sorted.map(r => ({ label: r.label, a: r.our_price, b: r.comp_price })), meta.our_name, meta.comp_name, useLog,
    it => col[sorted.find(r => r.label === it.label)?.position ?? 'At par']), [sorted, p, meta, useLog])

  const byCat = useMemo(() => Object.entries(groupBy(pairs, r => r.category)).map(([category, rs]) => {
    const avg = rs.reduce((s, r) => s + r.pct_diff, 0) / rs.length
    return { category, pairs: rs.length, avg_gap: avg, cheaper: rs.filter(r => r.position === 'Cheaper').length, pricier: rs.filter(r => r.position === 'Pricier').length, verdict: avg < -meta.tol ? `${meta.our_name} cheaper` : avg > meta.tol ? `${meta.comp_name} cheaper` : 'At par' }
  }), [pairs, meta])
  const cols: ColumnDef<(typeof byCat)[number]>[] = [
    { header: 'Category', accessorKey: 'category', cell: c => <b>{c.getValue<string>()}</b> }, { header: 'Matched pairs', accessorKey: 'pairs' },
    { header: 'Avg gap', accessorKey: 'avg_gap', cell: c => <span className={`tabular font-semibold ${c.getValue<number>() > 0 ? 'text-bad' : 'text-good'}`}>{pct(c.getValue<number>())}</span> },
    { header: 'You cheaper', accessorKey: 'cheaper' }, { header: 'You pricier', accessorKey: 'pricier' },
    { header: 'Better prices', accessorKey: 'verdict', cell: c => <Badge tone={String(c.getValue()).startsWith(meta.our_name) ? 'good' : String(c.getValue()).startsWith(meta.comp_name) ? 'bad' : 'neutral'}>{c.getValue<string>()}</Badge> },
  ]

  if (!pairs.length) return <><PageHeader title="Price comparison" /><EmptyState title="No matched products at the current settings">Adjust the matching options in <b>Filters</b>.</EmptyState></>
  return (
    <>
      <PageHeader title="Price comparison" subtitle="Head-to-head prices on matched products." />
      <Grid cols={2}>
        <Card title="Price vs price" subtitle="Points below the dashed line are cheaper at your store"><Chart option={scatter} height={360} /></Card>
        <Card title="Distribution of price gaps" subtitle="Negative = you are cheaper"><Chart option={hist} height={360} /></Card>
      </Grid>
      <Card className="mt-4" title="Price ladder" subtitle="Each row is one matched pair; the line colour shows who wins"
        actions={<><Segmented size="sm" options={['Largest gap', 'Your price', 'Match score'] as const} value={sort} onChange={setSort} /><div className="w-32"><Toggle label="Log axis" checked={useLog} onChange={setLog} /></div></>}>
        <Chart option={ladderOpt} height={Math.max(300, 34 * sorted.length + 100)} />
      </Card>
      <Card className="mt-4" title="Who is cheaper, by category"><DataTable data={byCat} columns={cols} searchable={false} pageSize={20} dense /></Card>
    </>
  )
}
