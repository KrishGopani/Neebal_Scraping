import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { BarChart, BoxplotChart, CustomChart, GaugeChart, LineChart, PieChart, ScatterChart } from 'echarts/charts'
import { DataZoomComponent, GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { useTheme } from '../lib/theme'

echarts.use([BarChart, BoxplotChart, CustomChart, GaugeChart, LineChart, PieChart, ScatterChart, DataZoomComponent, GridComponent,
  LegendComponent, MarkAreaComponent, MarkLineComponent, TooltipComponent, CanvasRenderer])

export function Chart({ option, height = 320, onClick }: { option: Record<string, any>; height?: number; onClick?: (p: any) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const inst = useRef<echarts.ECharts | null>(null)
  const { palette } = useTheme()

  useEffect(() => {
    if (!ref.current) return
    const c = echarts.init(ref.current, undefined, { renderer: 'canvas' })
    inst.current = c
    const ro = new ResizeObserver(() => c.resize())
    ro.observe(ref.current)
    return () => { ro.disconnect(); c.dispose(); inst.current = null }
  }, [])

  useEffect(() => {
    const c = inst.current
    if (!c) return
    c.setOption({ backgroundColor: 'transparent', animationDuration: 350, textStyle: { fontFamily: 'Inter, system-ui, sans-serif', color: palette.fg }, ...option }, true)
    c.off('click')
    if (onClick) c.on('click', onClick)
  }, [option, palette, onClick])

  return <div ref={ref} style={{ height, width: '100%' }} />
}
