import { useMemo, useState } from 'react'
import { RunControls } from './RunControls'
import { RequestCard } from './RequestCard'
import { RequestDetailModal } from './RequestDetailModal'
import { CategoryPills } from './CategoryPills'
import { WorkloadPills } from './WorkloadPills'
import { PhaseBanner } from '@/components/controls/PhaseBanner'
import type { RunPhase, Workload, QaMode } from '@/types/experiment'
import type { RequestResult } from '@/types/metrics'
import type { DatasetStatus } from '@/hooks/useDatasetStatus'

interface ChatPanelProps {
  phase: RunPhase
  concurrency: number
  category: 'random' | 'shared_prefix' | 'exact_repeat'
  promptSource: 'sheets' | 'local'
  promptsByCategory: Record<string, number>
  promptCount: number
  workload: Workload
  qaMode: QaMode
  datasetStatus: DatasetStatus
  onDatasetLoaded: () => void
  description: string
  requests: Map<string, RequestResult>
  onStart: () => void
  onStop: () => void
  onConcurrencyChange: (v: number) => void
  onPromptCountChange: (n: number) => void
  onDescriptionChange: (html: string) => void
  onCategoryChange: (c: 'random' | 'shared_prefix' | 'exact_repeat') => void
  onWorkloadChange: (w: Workload) => void
  onQaModeChange: (m: QaMode) => void
}

export function ChatPanel({
  phase,
  concurrency,
  category,
  promptSource,
  promptsByCategory,
  promptCount,
  workload,
  qaMode,
  datasetStatus,
  onDatasetLoaded,
  description,
  requests,
  onStart,
  onStop,
  onConcurrencyChange,
  onPromptCountChange,
  onDescriptionChange,
  onCategoryChange,
  onWorkloadChange,
  onQaModeChange,
}: ChatPanelProps) {
  // Category (random/shared_prefix/exact_repeat) only ever governs the local/
  // Sheets pool — qa never touches that pool at all, and short/long stop
  // touching it once an HF dataset is loaded (see routes/run.ts) — so hide
  // the pills whenever category plays no role in prompt selection, to avoid
  // implying it still does something.
  const showCategoryPills = workload !== 'qa' && !datasetStatus[workload].loaded
  const reqArray = useMemo(() => Array.from(requests.values()), [requests])
  const activeCount = reqArray.filter((r) => r.state === 'decoding' || r.state === 'prefilling').length

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedIndex = reqArray.findIndex((r) => r.id === selectedId)
  const selected = selectedIndex >= 0 ? reqArray[selectedIndex] : null

  return (
    <div className="flex flex-col h-full border-r border-border bg-panel">
      {/* Panel header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-fg">Concurrent Requests</h2>
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
        promptCount={promptCount}
        onPromptCountChange={onPromptCountChange}
        workload={workload}
        description={description}
        onDescriptionChange={onDescriptionChange}
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
              <RequestCard
                key={req.id}
                req={req}
                index={i}
                onClick={() => setSelectedId(req.id)}
              />
            ))}
          </div>
        )}
      </div>

      <WorkloadPills
        value={workload}
        onChange={onWorkloadChange}
        qaMode={qaMode}
        onQaModeChange={onQaModeChange}
        datasetStatus={datasetStatus}
        onDatasetLoaded={onDatasetLoaded}
      />

      {showCategoryPills && (
        <CategoryPills
          value={category}
          onChange={onCategoryChange}
          source={promptSource}
          byCategory={promptsByCategory}
        />
      )}

      {selected && (
        <RequestDetailModal
          req={selected}
          index={selectedIndex}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}
