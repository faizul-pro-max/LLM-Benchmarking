import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { useChartColors } from '@/utils/chartColors'
import type { WarmupTtft } from '@/types/experiment'

interface WarmupChartProps {
  /** Warmup TTFT stabilisation points. Passed in (rather than read from
   *  runStore) so the component is self-contained and reusable. */
  points: WarmupTtft[]
}

export function WarmupChart({ points }: WarmupChartProps) {
  const c = useChartColors()

  const data = points.map((p) => ({
    t: `#${p.req}`,
    value: p.ttft_ms,
  }))

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-semibold text-fg">Warmup TTFT (ms)</span>
        <span className="text-[10px] text-muted">stabilisation</span>
      </div>
      <ResponsiveContainer width="100%" height={90}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
          <XAxis
            dataKey="t"
            tick={{ fontSize: 9, fill: c.axis }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 9, fill: c.axis }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.grid}`, borderRadius: 6, fontSize: 11 }}
            labelStyle={{ color: c.axis }}
            itemStyle={{ color: '#D97706' }}
            formatter={(v: number) => [`${Math.round(v)}ms`, 'TTFT']}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#D97706"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
