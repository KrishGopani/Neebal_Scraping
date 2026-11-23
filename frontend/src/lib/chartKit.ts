/* Shared ECharts building blocks so every chart looks consistent in light & dark. */
import type { Palette } from './theme'
import { money } from './utils'

export const POS_COLOR = (p: Palette) => ({ Cheaper: p.good, 'At par': p.neutral, Pricier: p.bad }) as Record<string, string>

export const tooltip = (p: Palette, extra: object = {}) => ({
  backgroundColor: p.surface, borderColor: p.line, textStyle: { color: p.fg, fontSize: 12 }, extraCssText: 'box-shadow:0 8px 24px rgba(0,0,0,.15);border-radius:10px;', ...extra,
})
export const valueAxis = (p: Palette, extra: object = {}) => ({
  type: 'value', axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: p.muted },
  splitLine: { lineStyle: { color: p.line, type: 'dashed' } }, nameTextStyle: { color: p.muted }, ...extra,
})
export const catAxis = (p: Palette, data: string[], extra: object = {}) => ({
  type: 'category', data, axisLine: { lineStyle: { color: p.line } }, axisTick: { show: false }, axisLabel: { color: p.muted }, ...extra,
})
export const legend = (p: Palette, extra: object = {}) => ({ top: 0, left: 0, icon: 'circle', itemWidth: 8, itemHeight: 8, textStyle: { color: p.muted }, ...extra })
export const grid = (extra: object = {}) => ({ left: 8, right: 24, top: 40, bottom: 8, containLabel: true, ...extra })
/** Pads a value axis so outside labels aren't clipped. */
export const padded = (m = 1.25) => ({
  min: (v: { min: number }) => (v.min < 0 ? Math.floor((v.min * m) / 10) * 10 : 0),
  max: (v: { max: number }) => (v.max > 0 ? Math.ceil((v.max * m) / 10) * 10 : 0),
})
export const logTicks = (lo: number, hi: number) => [1, 3, 10, 30, 100, 300, 1000, 3000, 10000, 30000].filter(t => t >= lo * 0.6 && t <= hi * 1.7)

export interface DumbbellItem { label: string; a: number | null; b: number | null; color?: string; aN?: number | null; bN?: number | null }
/** Two-dot comparison per row (ours vs competitor), connected by a line. */
export function dumbbell(p: Palette, items: DumbbellItem[], aName: string, bName: string, log: boolean, colorLine?: (i: DumbbellItem) => string) {
  const labels = items.map(i => i.label)
  const vals = items.flatMap(i => [i.a, i.b]).filter((v): v is number => v != null && v > 0)
  const lo = Math.min(...vals), hi = Math.max(...vals)
  const ticks = logTicks(lo, hi)
  return {
    grid: grid({ top: 44, left: 8 }),
    legend: legend(p),
    tooltip: tooltip(p, { trigger: 'item' }),
    xAxis: valueAxis(p, {
      type: log ? 'log' : 'value', min: log ? ([1, 3, 10, 30, 100, 300, 1000, 3000].filter(t => t <= lo * 0.9).pop() ?? lo * 0.5) : undefined,
      axisLabel: { color: p.muted, formatter: (v: number) => money(v, 0) },
    }),
    yAxis: catAxis(p, labels, { inverse: true, axisLine: { show: false }, axisLabel: { color: p.fg, width: 240, overflow: 'truncate' } }),
    series: [
      {
        type: 'custom', silent: true, z: 1, data: items.map((it, i) => [it.a, it.b, i]),
        renderItem: (_: unknown, api: any) => {
          const a = api.value(0), b = api.value(1)
          if (a == null || b == null) return { type: 'group', children: [] }
          const p1 = api.coord([a, api.value(2)]), p2 = api.coord([b, api.value(2)])
          return { type: 'line', shape: { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1] }, style: { stroke: colorLine ? colorLine(items[api.value(2)]) : p.line, lineWidth: 4, opacity: 0.55 } }
        },
      },
      { name: aName, type: 'scatter', symbolSize: 13, itemStyle: { color: p.ours }, z: 3, data: items.map((it, i) => (it.a == null ? null : [it.a, i, it.label, it.aN])),
        tooltip: { formatter: (x: any) => `<b>${x.value[2]}</b><br/>${aName}: ${money(x.value[0])}${x.value[3] ? ` · ${x.value[3]} products` : ''}` } },
      { name: bName, type: 'scatter', symbol: 'diamond', symbolSize: 15, itemStyle: { color: p.comp }, z: 3, data: items.map((it, i) => (it.b == null ? null : [it.b, i, it.label, it.bN])),
        tooltip: { formatter: (x: any) => `<b>${x.value[2]}</b><br/>${bName}: ${money(x.value[0])}${x.value[3] ? ` · ${x.value[3]} products` : ''}` } },
    ],
  }
}
