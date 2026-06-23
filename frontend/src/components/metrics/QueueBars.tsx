import { useMetrics } from '@/hooks/useMetrics'
import { fmtMs } from '@/utils/formatters'

interface BarRowProps {
  label: string
  value: number
  max: number
  display: string
  color: string
}

function BarRow({ label, value, max, display, color }: BarRowProps) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-muted w-36 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-border rounded overflow-hidden">
        <div
          className="h-full rounded transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[11px] font-mono text-fg w-16 text-right shrink-0">{display}</span>
    </div>
  )
}

export function QueueBars() {
  const { latest } = useMetrics()

  const running = latest?.requests_running ?? 0
  const waiting = latest?.requests_waiting ?? 0
  const kv      = latest?.kv_cache_pct ?? 0
  const ttft    = latest?.ttft_p50_ms ?? 0

  return (
    <div className="px-4 py-3 border-t border-border">
      <h3 className="text-[11px] font-semibold text-fg mb-2">Scheduler State</h3>
      <div className="flex flex-col gap-2">
        <BarRow
          label="Requests Running"
          value={running}
          max={16}
          display={`${running} / 16`}
          color="#2563EB"
        />
        <BarRow
          label="Requests Waiting"
          value={waiting}
          max={32}
          display={String(waiting)}
          color="#D97706"
        />
        <BarRow
          label="KV Cache Pages"
          value={kv}
          max={100}
          display={`${Math.round(kv)}%`}
          color="#059669"
        />
        <BarRow
          label="KV TTFT / P50"
          value={ttft}
          max={1000}
          display={fmtMs(ttft)}
          color="#8B5CF6"
        />
      </div>
    </div>
  )
}
