/**
 * Reusable ECharts building blocks, so every chart in the app looks consistent in light and dark mode.
 *
 * Pages build an ECharts "option" object (a declarative description of the chart) and pass it to <Chart /> (src/components/Chart.tsx).
 * The helpers here produce the repeated pieces of those options — tooltips, axes, legends, grid margins — each taking
 * the current `Palette` (src/lib/theme.tsx) so colours follow the theme. `dumbbell()` builds the two-dot comparison chart
 * used by the Price ladder and Categories pages.
 */
import type { Palette } from './theme'
import { money } from './utils'

/** Colour for each price position: Cheaper = green, At par = grey, Pricier = red. */
export const POS_COLOR = (p: Palette) => ({ Cheaper: p.good, 'At par': p.neutral, Pricier: p.bad }) as Record<string, string>

/** Hover tooltip styled to match the theme (card background, border, soft shadow). `extra` overrides/extends options. */
export const tooltip = (p: Palette, extra: object = {}) => ({
  backgroundColor: p.surface, borderColor: p.line, textStyle: { color: p.fg, fontSize: 12 }, extraCssText: 'box-shadow:0 8px 24px rgba(0,0,0,.15);border-radius:10px;', ...extra,
})
/** A numeric axis: no axis line/ticks, muted labels and dashed grid lines. `extra` lets a chart set min/max, formatter, log type... */
export const valueAxis = (p: Palette, extra: object = {}) => ({
  type: 'value', axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: p.muted },
  splitLine: { lineStyle: { color: p.line, type: 'dashed' } }, nameTextStyle: { color: p.muted }, ...extra,
})
/** A category axis (text labels such as category or product names) from the `data` array. */
export const catAxis = (p: Palette, data: string[], extra: object = {}) => ({
  type: 'category', data, axisLine: { lineStyle: { color: p.line } }, axisTick: { show: false }, axisLabel: { color: p.muted }, ...extra,
})
/** Compact round-dot legend pinned top-left, above the plot area. */
export const legend = (p: Palette, extra: object = {}) => ({ top: 0, left: 0, icon: 'circle', itemWidth: 8, itemHeight: 8, textStyle: { color: p.muted }, ...extra })
/**
 * Plot-area margins. `containLabel` makes ECharts reserve room for axis labels so they are never clipped.
 * Top leaves space for the legend; charts with an x-axis title pass a larger `bottom`.
 */
export const grid = (extra: object = {}) => ({ left: 8, right: 24, top: 40, bottom: 8, containLabel: true, ...extra })
/**
 * Axis min/max functions that pad the data range by factor `m` (rounded to a multiple of 10) so bar labels placed
 * outside the bars (e.g. "-26%") aren't cut off. Zero stays the anchor on the side that has no data.
 */
export const padded = (m = 1.25) => ({
  min: (v: { min: number }) => (v.min < 0 ? Math.floor((v.min * m) / 10) * 10 : 0),
  max: (v: { max: number }) => (v.max > 0 ? Math.ceil((v.max * m) / 10) * 10 : 0),
})
/** Readable tick values (1, 3, 10, 30, 100 ...) within a data range; used for log axes, whose default ticks are cluttered. */
export const logTicks = (lo: number, hi: number) => [1, 3, 10, 30, 100, 300, 1000, 3000, 10000, 30000].filter(t => t >= lo * 0.6 && t <= hi * 1.7)

/** One row of a dumbbell chart: a label plus two values (a = yours, b = competitor's) and optional product counts for tooltips. */
export interface DumbbellItem { label: string; a: number | null; b: number | null; color?: string; aN?: number | null; bN?: number | null }
/**
 * Dumbbell chart option: one row per item, a blue dot (you) and an amber diamond (competitor) joined by a line.
 * `log` selects a logarithmic x axis; `colorLine` optionally colours each connecting line (e.g. green when you're cheaper).
 * Good for comparing two values per row when the rows have very different magnitudes.
 */
export function dumbbell(p: Palette, items: DumbbellItem[], aName: string, bName: string, log: boolean, colorLine?: (i: DumbbellItem) => string) {
  // Y axis shows one row per item, in the order given (the caller sorts).
  const labels = items.map(i => i.label)
  // Range of all values, needed to choose a sensible log-axis minimum.
  const vals = items.flatMap(i => [i.a, i.b]).filter((v): v is number => v != null && v > 0)
  const lo = Math.min(...vals), hi = Math.max(...vals)
  return {
    grid: grid({ top: 44, left: 8 }),
    legend: legend(p),
    tooltip: tooltip(p, { trigger: 'item' }),
    xAxis: valueAxis(p, {
      // On a log axis the lower bound must sit below the smallest value (a nice tick at or under 90% of it), or the lowest dot is clipped.
      // Log scale keeps cheap and expensive items readable together; the caller turns it on only when the spread is large.
      type: log ? 'log' : 'value', min: log ? ([1, 3, 10, 30, 100, 300, 1000, 3000].filter(t => t <= lo * 0.9).pop() ?? lo * 0.5) : undefined,
      axisLabel: { color: p.muted, formatter: (v: number) => money(v, 0) },
    }),
    yAxis: catAxis(p, labels, { inverse: true, axisLine: { show: false }, axisLabel: { color: p.fg, width: 240, overflow: 'truncate' } }),
    series: [
      {
        // Series 1 — the connecting line. ECharts has no built-in "line between two points on a category axis", so a custom
        // series draws one segment per row from a's x-position to b's. `silent` = not hoverable (the dots carry the tooltips).
        type: 'custom', silent: true, z: 1, data: items.map((it, i) => [it.a, it.b, i]),
        renderItem: (_: unknown, api: any) => {
          // Convert the two data values into pixel positions on the chart, then draw a thick semi-transparent line between them.
          // A row missing one side draws nothing.
          const a = api.value(0), b = api.value(1)
          if (a == null || b == null) return { type: 'group', children: [] }
          const p1 = api.coord([a, api.value(2)]), p2 = api.coord([b, api.value(2)])
          return { type: 'line', shape: { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1] }, style: { stroke: colorLine ? colorLine(items[api.value(2)]) : p.line, lineWidth: 4, opacity: 0.55 } }
        },
      },
      // Series 2 and 3 — the dots: circles for your store, diamonds for the competitor, drawn above the line (z: 3).
      { name: aName, type: 'scatter', symbolSize: 13, itemStyle: { color: p.ours }, z: 3, data: items.map((it, i) => (it.a == null ? null : [it.a, i, it.label, it.aN])),
        tooltip: { formatter: (x: any) => `<b>${x.value[2]}</b><br/>${aName}: ${money(x.value[0])}${x.value[3] ? ` · ${x.value[3]} products` : ''}` } },
      { name: bName, type: 'scatter', symbol: 'diamond', symbolSize: 15, itemStyle: { color: p.comp }, z: 3, data: items.map((it, i) => (it.b == null ? null : [it.b, i, it.label, it.bN])),
        tooltip: { formatter: (x: any) => `<b>${x.value[2]}</b><br/>${bName}: ${money(x.value[0])}${x.value[3] ? ` · ${x.value[3]} products` : ''}` } },
    ],
  }
}
