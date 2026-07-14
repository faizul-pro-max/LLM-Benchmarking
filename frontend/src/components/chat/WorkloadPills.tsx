import { useState } from 'react'
import clsx from 'clsx'
import type { Workload, QaMode } from '@/types/experiment'
import type { DatasetStatus } from '@/hooks/useDatasetStatus'

interface WorkloadPillsProps {
  value: Workload
  onChange: (w: Workload) => void
  qaMode: QaMode
  onQaModeChange: (m: QaMode) => void
  datasetStatus: DatasetStatus
  /** Called after a successful POST /api/datasets/load so the caller can
   *  refetch status (see useDatasetStatus's reload()). */
  onDatasetLoaded: () => void
}

const PILLS: { value: Workload; label: string }[] = [
  { value: 'short', label: 'Short' },
  { value: 'long', label: 'Long' },
  { value: 'qa', label: 'Q&A' },
]

const QA_MODE_PILLS: { value: QaMode; label: string }[] = [
  { value: 'sequential', label: 'Sequential' },
  { value: 'flattened', label: 'Flattened' },
]

export function WorkloadPills({ value, onChange, qaMode, onQaModeChange, datasetStatus, onDatasetLoaded }: WorkloadPillsProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const active = datasetStatus[value]

  const loadDataset = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/datasets/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workload: value }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ? JSON.stringify(body.error) : `HTTP ${res.status}`)
      }
      onDatasetLoaded()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="px-3 py-2 border-t border-border shrink-0">
      <div className="flex gap-1.5 mb-1.5">
        {PILLS.map((p) => (
          <button
            key={p.value}
            onClick={() => onChange(p.value)}
            className={clsx(
              'px-2.5 py-1 rounded text-xs font-medium transition-colors',
              value === p.value
                ? 'bg-blue-accent text-white'
                : 'bg-card border border-border text-muted hover:text-fg hover:border-blue-accent/50'
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {value === 'qa' && (
        <div className="flex gap-1.5 mb-1.5">
          {QA_MODE_PILLS.map((p) => (
            <button
              key={p.value}
              onClick={() => onQaModeChange(p.value)}
              className={clsx(
                'px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
                qaMode === p.value
                  ? 'bg-blue-accent/80 text-white'
                  : 'bg-card border border-border text-muted hover:text-fg'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] text-muted">
          {active.loaded
            ? `${active.count} ${value} prompt${active.count === 1 ? '' : 's'} · huggingface (${active.repoId})`
            : active.cachedOnDisk
              ? `cached on disk (${active.repoId}) — not loaded yet`
              : 'no dataset loaded — falls back to local pool'}
        </p>
        <button
          onClick={loadDataset}
          disabled={loading}
          className={clsx(
            'px-2 py-0.5 text-[10px] font-medium rounded border shrink-0 transition-colors',
            loading
              ? 'border-border/40 text-muted/40 cursor-not-allowed'
              : 'border-border text-muted hover:text-fg hover:border-blue-accent/50'
          )}
        >
          {loading ? 'Loading…' : active.loaded ? 'Reload' : 'Load dataset'}
        </button>
      </div>
      {error && <p className="text-[10px] text-red-accent mt-1">{error}</p>}
    </div>
  )
}
