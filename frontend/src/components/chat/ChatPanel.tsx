import { useMemo } from 'react'
import { RunControls } from './RunControls'
import { RequestCard } from './RequestCard'
import { CategoryPills } from './CategoryPills'
import { PhaseBanner } from '@/components/controls/PhaseBanner'
import type { RunPhase } from '@/types/experiment'
import type { RequestResult } from '@/types/metrics'

interface ChatPanelProps {
  phase: RunPhase
  concurrency: number
  category: 'random' | 'shared_prefix' | 'exact_repeat'
  promptCount: number
  requests: Map<string, RequestResult>
  onStart: () => void
  onStop: () => void
  onConcurrencyChange: (v: number) => void
  onCategoryChange: (c: 'random' | 'shared_prefix' | 'exact_repeat') => void
}

export function ChatPanel({
  phase,
  concurrency,
  category,
  promptCount,
  requests,
  onStart,
  onStop,
  onConcurrencyChange,
  onCategoryChange,
}: ChatPanelProps) {
  const reqArray = useMemo(() => Array.from(requests.values()), [requests])
  const activeCount = reqArray.filter((r) => r.state === 'decoding' || r.state === 'prefilling').length

  return (
    <div className="flex flex-col h-full border-r border-border bg-panel">
      {/* Panel header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-white">Concurrent Requests</h2>
          <p className="text-[10px] text-muted">
            {activeCount} / {reqArray.length} active
          </p>
        </div>
      </div>

      <PhaseBanner phase={phase} />

      <RunControls
        phase={phase}
        concurrency={concurrency}
        onConcurrencyChange={onConcurrencyChange}
        onStart={onStart}
        onStop={onStop}
      />

      {/* Request cards grid — scrollable */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {reqArray.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted text-xs">
            Press <span className="mx-1 px-1.5 py-0.5 bg-card border border-border rounded font-mono">Run Test</span> to start
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {reqArray.map((req, i) => (
              <RequestCard key={req.id} req={req} index={i} />
            ))}
          </div>
        )}
      </div>

      <CategoryPills
        value={category}
        onChange={onCategoryChange}
        promptCount={promptCount}
      />
    </div>
  )
}
