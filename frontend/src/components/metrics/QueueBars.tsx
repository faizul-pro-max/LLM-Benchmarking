import { useMetrics } from '@/hooks/useMetrics'
import { fmtMs } from '@/utils/formatters'
import type { MetricsSnapshot } from '@/types/metrics'

// Bar-scaling constants. These are *display* assumptions used only to size the
// progress bars — they are NOT real scheduler limits. They roughly approximate
// vLLM scheduler bounds (e.g. --max-num-seqs) so the bars look meaningful, but
// ideally they should be derived from the actual server config rather than
// hardcoded here.
const MAX_RUNNING = 16   // approx vLLM max concurrently-running sequences (max-num-seqs)
const MAX_WAITING = 32   // approx upper bound for the waiting queue length
const MAX_TTFT_MS = 1000 // approx TTFT P50 ceiling (ms) used only for bar scaling

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

interface QueueBarsProps {
  /** Optional historical latest snapshot; when omitted the live store is used. */
  latest?: MetricsSnapshot | null
}

export function QueueBars({ latest: latestOverride }: QueueBarsProps = {}) {
  const live = useMetrics()
  const latest = latestOverride !== undefined ? latestOverride : live.latest

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
          max={MAX_RUNNING}
          display={`${running} / ${MAX_RUNNING}`}
          color="#2563EB"
        />
        <BarRow
          label="Requests Waiting"
          value={waiting}
          max={MAX_WAITING}
          display={String(waiting)}
          color="#D97706"
        />
        <BarRow
          label="KV Cache %"
          value={kv}
          max={100}
          display={`${Math.round(kv)}%`}
          color="#059669"
        />
        <BarRow
          label="TTFT P50"
          value={ttft}
          max={MAX_TTFT_MS}
          display={fmtMs(ttft)}
          color="#8B5CF6"
        />
      </div>
    </div>
  )
}
