import { StatCards } from './StatCards'
import { GpuChart } from './GpuChart'
import { TpsChart } from './TpsChart'
import { TtftChart } from './TtftChart'
import { QueueBars } from './QueueBars'
import { NetworkBadge } from './NetworkBadge'
import { ComparisonTable } from '@/components/comparison/ComparisonTable'
import { useMetrics } from '@/hooks/useMetrics'
import { useRunStore } from '@/store/runStore'

interface MetricsPanelProps {
  /** 'chat' trims the panel to live signals only — scheduler state and the
   *  experiment comparison table are benchmark-only and hidden in chat mode. */
  mode?: 'benchmark' | 'chat'
  /** Socket round-trip latency (ms), surfaced in the NetworkBadge. */
  rtt?: number | null
}

export function MetricsPanel({ mode = 'benchmark', rtt = null }: MetricsPanelProps = {}) {
  const showBenchmarkOnly = mode === 'benchmark'
  const { latest } = useMetrics()
  const phase = useRunStore((s) => s.phase)
  const isRunActive = phase === 'warmup' || phase === 'benchmarking'

  // Server-side TTFT (vLLM P50) vs the network round trip — NetworkBadge shows
  // the gap so client overhead is visible.
  const serverTtft = latest?.ttft_p50_ms != null ? Math.round(latest.ttft_p50_ms) : undefined

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-bg">
      <StatCards />

      {/* Charts side by side */}
      <div className="grid grid-cols-2 gap-4 px-4 py-2">
        <div className="bg-panel border border-border rounded-lg p-3">
          <GpuChart />
        </div>
        <div className="bg-panel border border-border rounded-lg p-3">
          <TpsChart />
        </div>
      </div>

      {showBenchmarkOnly && (
        <div className="grid grid-cols-2 gap-4 px-4 py-2">
          <div className="bg-panel border border-border rounded-lg p-3">
            <TtftChart />
          </div>
        </div>
      )}

      {/* Network transparency: server TTFT vs RTT */}
      <div className="px-4 py-2">
        <NetworkBadge rtt={rtt} serverTtft={serverTtft} />
      </div>

      {showBenchmarkOnly && isRunActive && <QueueBars />}

      {showBenchmarkOnly && (
        <div className="px-4 pb-4">
          <ComparisonTable />
        </div>
      )}
    </div>
  )
}
