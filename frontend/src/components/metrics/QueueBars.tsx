import { useRunStore } from '@/store/runStore'
import type { MetricsSnapshot } from '@/types/metrics'

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
  /** Optional historical snapshot, passed by BenchmarksView when rendering a
   *  past (already-finished) run loaded from SQLite. That view has no live
   *  scheduler running/waiting data — the run's load-generator loop is long
   *  gone — so when this prop is present we just show static placeholders
   *  instead of live scheduler:update-derived bars. */
  latest?: MetricsSnapshot | null
}

export function QueueBars({ latest: historicalOverride }: QueueBarsProps = {}) {
  const isHistorical = historicalOverride !== undefined
  const concurrency = useRunStore((s) => s.concurrency)
  const promptCount = useRunStore((s) => s.promptCount)
  const schedulerRunning = useRunStore((s) => s.schedulerRunning)
  const schedulerWaiting = useRunStore((s) => s.schedulerWaiting)

  const running = isHistorical ? null : schedulerRunning
  const waiting = isHistorical ? null : schedulerWaiting
  const maxRunning = Math.max(concurrency, 1)
  const maxWaiting = Math.max(promptCount - concurrency, 1)

  return (
    <div className="px-4 py-3 border-t border-border">
      <h3 className="text-[11px] font-semibold text-fg mb-2">Scheduler State</h3>
      <div className="flex flex-col gap-2">
        <BarRow
          label="Requests Running"
          value={running ?? 0}
          max={maxRunning}
          display={running === null ? '—' : `${running} / ${maxRunning}`}
          color="#2563EB"
        />
        <BarRow
          label="Requests Waiting"
          value={waiting ?? 0}
          max={maxWaiting}
          display={waiting === null ? '—' : String(waiting)}
          color="#D97706"
        />
      </div>
    </div>
  )
}
