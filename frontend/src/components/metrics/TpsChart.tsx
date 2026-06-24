import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { useMetrics } from '@/hooks/useMetrics'
import { useChartColors } from '@/utils/chartColors'
import type { MetricsSnapshot } from '@/types/metrics'

interface TpsChartProps {
  /** Optional historical snapshots; when omitted the live metrics store is used. */
  snapshots?: MetricsSnapshot[]
}

export function TpsChart({ snapshots: override }: TpsChartProps = {}) {
  const live = useMetrics()
  const snapshots = override ?? live.snapshots
  const c = useChartColors()

  const data = snapshots.map((s, i) => ({
    t: i === snapshots.length - 1 ? 'now' : `-${((snapshots.length - 1 - i) * 0.5).toFixed(0)}s`,
    value: s.tokens_per_sec,
  }))

  const peak = data.length ? Math.max(...data.map((d) => d.value)) : 0

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-semibold text-fg">Tokens / sec</span>
        <span className="text-[10px] text-muted">
          {peak > 0 ? `${Math.round(peak).toLocaleString()} peak` : '60s window'}
        </span>
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
            itemStyle={{ color: '#059669' }}
            formatter={(v: number) => [`${Math.round(v).toLocaleString()}`, 'tok/s']}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#059669"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
