import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { StatCards } from '@/components/metrics/StatCards'
import { GpuChart } from '@/components/metrics/GpuChart'
import { TpsChart } from '@/components/metrics/TpsChart'
import { QueueBars } from '@/components/metrics/QueueBars'
import { fmtMs, fmtTps, fmtPct, fmtDuration, fmtNumber } from '@/utils/formatters'
import type { MetricsSnapshot } from '@/types/metrics'
import type { Run, AggregatedResult, RunConfig, RunPhase } from '@/types/experiment'
import {
  parseRunConfig,
  RunConfigPanel,
  ServerConfigPanel,
  DescriptionPanel,
} from './RunConfigPanels'
import { RequestsTable } from './RequestsTable'
import type { PersistedRequest } from './RequestResultModal'

/** A past run as returned by GET /api/experiments — may carry headline metrics. */
interface ExperimentRow extends Run {
  ttft_p50_ms?: number | null
  tokens_per_sec_avg?: number | null
  gpu_util_avg?: number | null
  kv_cache_avg?: number | null
}

function fmtDate(ms: number): string {
  try {
    return new Date(ms).toLocaleString()
  } catch {
    return '—'
  }
}

function StatusBadge({ phase }: { phase: RunPhase }) {
  const config = (() => {
    switch (phase) {
      case 'complete':
        return { label: 'Complete', bgClass: 'bg-green-500/15', textClass: 'text-green-600' }
      case 'stopped':
        return { label: 'Stopped', bgClass: 'bg-amber-500/15', textClass: 'text-amber-600' }
      case 'error':
        return { label: 'Error', bgClass: 'bg-red-500/15', textClass: 'text-red-600' }
      case 'warmup':
      case 'benchmarking':
      case 'pending':
        return { label: 'Running', bgClass: 'bg-blue-500/15', textClass: 'text-blue-600' }
      default:
        return { label: phase, bgClass: 'bg-slate-500/15', textClass: 'text-slate-600' }
    }
  })()

  return (
    <span
      className={clsx(
        'inline-flex px-2 py-1 rounded-full text-[9px] font-semibold uppercase tracking-wider',
        config.bgClass,
        config.textClass
      )}
    >
      {config.label}
    </span>
  )
}

function ExperimentListItem({
  run,
  active,
  onClick,
}: {
  run: ExperimentRow
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full text-left px-3 py-2.5 rounded-lg border transition-colors',
        active
          ? 'bg-blue-accent/10 border-blue-accent/50'
          : 'bg-card border-border hover:bg-card/70'
      )}
    >
      <div className={clsx('text-[13px] font-medium truncate', active ? 'text-blue-accent' : 'text-fg')}>
        {run.name}
      </div>
      <div className="flex items-center gap-2 mt-0.5">
        <div className="text-[10px] text-muted flex-1">{fmtDate(run.created_at)}</div>
        <StatusBadge phase={run.phase} />
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[10px] font-mono text-muted">
        {run.ttft_p50_ms != null && <span>TTFT {fmtMs(run.ttft_p50_ms)}</span>}
        {run.tokens_per_sec_avg != null && <span>{fmtTps(run.tokens_per_sec_avg)} tok/s</span>}
        {run.gpu_util_avg != null && <span>GPU {fmtPct(run.gpu_util_avg)}</span>}
        {run.kv_cache_avg != null && <span>KV {fmtPct(run.kv_cache_avg)}</span>}
      </div>
    </button>
  )
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-3 flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</span>
      <span className="text-lg font-bold text-fg leading-none">{value}</span>
    </div>
  )
}

export function BenchmarksView() {
  const [experiments, setExperiments] = useState<ExperimentRow[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [snapshots, setSnapshots] = useState<MetricsSnapshot[]>([])
  const [result, setResult] = useState<AggregatedResult | null>(null)
  const [requests, setRequests] = useState<PersistedRequest[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [loadingRequests, setLoadingRequests] = useState(false)

  // Load the experiment list on mount.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch('/api/experiments')
        if (!res.ok) throw new Error(String(res.status))
        const data: ExperimentRow[] = await res.json()
        if (!alive) return
        const rows = Array.isArray(data) ? data : []
        setExperiments(rows)
        if (rows.length > 0) setSelectedId(rows[0].id)
      } catch {
        if (alive) setExperiments([])
      } finally {
        if (alive) setLoadingList(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // Load the selected run's history + aggregated result.
  useEffect(() => {
    if (!selectedId) {
      setSnapshots([])
      setResult(null)
      setRequests([])
      return
    }
    let alive = true
    setLoadingDetail(true)
    setLoadingRequests(true)
    ;(async () => {
      try {
        const [snapRes, aggRes, reqRes] = await Promise.all([
          fetch(`/api/results/${selectedId}/snapshots`),
          fetch(`/api/results/${selectedId}`),
          fetch(`/api/results/${selectedId}/requests`),
        ])
        const snaps: MetricsSnapshot[] = snapRes.ok ? await snapRes.json() : []
        const agg: AggregatedResult | null = aggRes.ok ? await aggRes.json() : null
        const reqs: PersistedRequest[] = reqRes.ok ? await reqRes.json() : []
        if (!alive) return
        setSnapshots(Array.isArray(snaps) ? snaps : [])
        setResult(agg)
        setRequests(Array.isArray(reqs) ? reqs : [])
      } catch {
        if (!alive) return
        setSnapshots([])
        setResult(null)
        setRequests([])
      } finally {
        if (alive) {
          setLoadingDetail(false)
          setLoadingRequests(false)
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [selectedId])

  const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null
  const selectedRun = experiments.find((r) => r.id === selectedId) ?? null
  const runConfig: RunConfig | null = selectedRun ? parseRunConfig(selectedRun.config) : null
  // Prefer the row's top-level description; fall back to the parsed config's.
  const descriptionHtml = selectedRun?.description ?? runConfig?.description ?? null

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Sidebar — list of past experiments */}
      <div className="w-[320px] min-w-[280px] shrink-0 flex flex-col border-r border-border bg-panel overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border shrink-0">
          <div className="text-fg text-sm font-semibold leading-tight">Benchmarks</div>
          <div className="text-muted text-[10px] leading-tight">Past runs · newest first</div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
          {loadingList ? (
            <div className="text-center text-xs text-muted py-8">Loading experiments…</div>
          ) : experiments.length === 0 ? (
            <div className="text-center text-xs text-muted py-8">
              No past runs yet. Completed benchmarks will appear here.
            </div>
          ) : (
            experiments.map((run) => (
              <ExperimentListItem
                key={run.id}
                run={run}
                active={run.id === selectedId}
                onClick={() => setSelectedId(run.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Detail — selected run's metrics */}
      <div className="flex-1 overflow-y-auto bg-bg">
        {!selectedId ? (
          <div className="flex items-center justify-center h-full text-xs text-muted">
            Select an experiment to view its metrics.
          </div>
        ) : (
          <>
            {/* Run header with name and status */}
            {selectedRun && (
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <div className="text-sm font-semibold text-fg">{selectedRun.name}</div>
                <StatusBadge phase={selectedRun.phase} />
              </div>
            )}

            <StatCards snapshots={snapshots} latest={latest} />

            <div className="grid grid-cols-2 gap-4 px-4 py-2">
              <div className="bg-panel border border-border rounded-lg p-3">
                <GpuChart snapshots={snapshots} />
              </div>
              <div className="bg-panel border border-border rounded-lg p-3">
                <TpsChart snapshots={snapshots} />
              </div>
            </div>

            <QueueBars latest={latest} />

            {/* Aggregated results */}
            <div className="px-4 py-3 border-t border-border">
              <h3 className="text-[11px] font-semibold text-fg mb-2">Aggregated Results</h3>
              {loadingDetail && !result ? (
                <div className="text-xs text-muted">Loading…</div>
              ) : result ? (
                <>
                  {/* Timing info */}
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    {result.started_at && (
                      <SummaryStat label="Started" value={fmtDate(result.started_at)} />
                    )}
                    {result.ended_at && (
                      <SummaryStat label="Ended" value={fmtDate(result.ended_at)} />
                    )}
                    {result.started_at && result.ended_at && (
                      <SummaryStat label="Duration" value={fmtDuration(result.ended_at - result.started_at)} />
                    )}
                  </div>
                  {result.total_tokens_generated && (
                    <div className="mb-3">
                      <SummaryStat label="Total Tokens Generated" value={fmtNumber(result.total_tokens_generated)} />
                    </div>
                  )}
                  {/* Performance metrics */}
                  <div className="grid grid-cols-4 gap-3">
                    <SummaryStat label="TTFT P50" value={fmtMs(result.ttft_p50_ms)} />
                    <SummaryStat label="TTFT P90" value={fmtMs(result.ttft_p90_ms)} />
                    <SummaryStat label="TTFT P99" value={fmtMs(result.ttft_p99_ms)} />
                    <SummaryStat label="TPOT P50" value={fmtMs(result.tpot_p50_ms)} />
                    <SummaryStat label="Tok/s Avg" value={fmtTps(result.tokens_per_sec_avg)} />
                    <SummaryStat label="Tok/s Peak" value={fmtTps(result.tokens_per_sec_peak)} />
                    <SummaryStat label="GPU Util Avg" value={fmtPct(result.gpu_util_avg)} />
                    <SummaryStat label="KV Cache Avg" value={fmtPct(result.kv_cache_avg)} />
                  </div>
                </>
              ) : (
                <div className="text-xs text-muted">No aggregated results for this run.</div>
              )}
            </div>

            {/* Description (task 3) */}
            <DescriptionPanel html={descriptionHtml} />

            {/* Run config (task 1.2) */}
            <RunConfigPanel config={runConfig} />

            {/* LLM server snapshot (task 1.1) */}
            <ServerConfigPanel server={runConfig?.server} />

            {/* Per-prompt request results (task 1.3) */}
            <RequestsTable requests={requests} loading={loadingRequests} />
          </>
        )}
      </div>
    </div>
  )
}
