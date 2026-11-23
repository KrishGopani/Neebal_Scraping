/**
 * Thin React wrapper around Apache ECharts — the only place the charting library is initialised.
 *
 * Pages describe a chart as a plain "option" object (see src/lib/chartKit.ts for shared pieces) and render
 * <Chart option={...} />. This component creates the ECharts instance on a <canvas>, keeps it sized to its container, and
 * re-applies the option whenever it (or the theme) changes. ECharts is imported module-by-module (tree-shaking) so only the
 * chart types we use end up in the bundle.
 */
import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { BarChart, BoxplotChart, CustomChart, GaugeChart, LineChart, PieChart, ScatterChart } from 'echarts/charts'
import { DataZoomComponent, GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { useTheme } from '../lib/theme'

// Register ONLY the chart types/components the app uses: bar, box-plot, custom (dumbbell lines), gauge, line, pie, scatter,
// plus grid/legend/tooltip/mark-line/mark-area/data-zoom and the canvas renderer.
echarts.use([BarChart, BoxplotChart, CustomChart, GaugeChart, LineChart, PieChart, ScatterChart, DataZoomComponent, GridComponent,
  LegendComponent, MarkAreaComponent, MarkLineComponent, TooltipComponent, CanvasRenderer])

/**
 * Render an ECharts chart. Props: `option` (ECharts configuration), `height` in px (default 320), and optional `onClick`
 * handler for chart elements. Width is always 100% of the parent.
 */
export function Chart({ option, height = 320, onClick }: { option: Record<string, any>; height?: number; onClick?: (p: any) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  // Holds the live ECharts instance between renders (it is not React state: updating it must not cause a re-render).
  const inst = useRef<echarts.ECharts | null>(null)
  const { palette } = useTheme()

  useEffect(() => {
    if (!ref.current) return
    // Effect 1 (runs once): create the chart, and resize it whenever its container changes size (window resize, sidebar, drawer).
    // The cleanup disposes the chart to avoid memory leaks.
    const c = echarts.init(ref.current, undefined, { renderer: 'canvas' })
    inst.current = c
    const ro = new ResizeObserver(() => c.resize())
    ro.observe(ref.current)
    return () => { ro.disconnect(); c.dispose(); inst.current = null }
  }, [])

  useEffect(() => {
    // Effect 2 (runs when `option`/theme changes): push the new option into the existing chart.
    // `true` = replace the old option entirely instead of merging, so removed series really disappear.
    // Base text style/colour is added here so every chart follows the theme and uses the app font.
    const c = inst.current
    if (!c) return
    c.setOption({ backgroundColor: 'transparent', animationDuration: 350, textStyle: { fontFamily: 'Inter, system-ui, sans-serif', color: palette.fg }, ...option }, true)
    // Re-bind the click handler each time so it never points at a stale callback.
    c.off('click')
    if (onClick) c.on('click', onClick)
  }, [option, palette, onClick])

  return <div ref={ref} style={{ height, width: '100%' }} />
}
