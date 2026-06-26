import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { useMetrics } from '@/hooks/useMetrics'
import { useChartColors } from '@/utils/chartColors'
import type { MetricsSnapshot } from '@/types/metrics'

interface TtftChartProps {
  /** Optional historical snapshots; when omitted the live metrics store is used. */
  snapshots?: MetricsSnapshot[]
}

export function TtftChart({ snapshots: override }: TtftChartProps = {}) {
  const live = useMetrics()
  const snapshots = override ?? live.snapshots
  const c = useChartColors()

  // Per-request TTFT arrays aren't in this store, so we use the vLLM P50 TTFT
  // from each metrics snapshot — a live distribution of latency over the window.
  const data = snapshots.map((s, i) => ({
    t: i === snapshots.length - 1 ? 'now' : `-${((snapshots.length - 1 - i) * 0.5).toFixed(0)}s`,
    value: s.ttft_p50_ms,
  }))

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-semibold text-fg">TTFT P50 (ms)</span>
        <span className="text-[10px] text-muted">60s window</span>
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
            itemStyle={{ color: '#2563EB' }}
            formatter={(v: number) => [`${Math.round(v)}ms`, 'TTFT']}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#2563EB"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
