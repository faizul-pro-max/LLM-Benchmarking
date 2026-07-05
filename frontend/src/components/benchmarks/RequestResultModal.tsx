import { useEffect } from 'react'
import clsx from 'clsx'
import { fmtMs } from '@/utils/formatters'

/** A persisted request row as returned by GET /api/results/:runId/requests.
 *  Mirrors the `requests` SQLite table — timings only, no streamed output text. */
export interface PersistedRequest {
  id: string
  run_id: string
  run_number: number
  prompt_id: string
  category: 'random' | 'shared_prefix' | 'exact_repeat'
  phase: 'warmup' | 'benchmark'
  prompt_text: string
  t0: number | null
  t1: number | null
  t2: number | null
  t3: number | null
  ttft_ms: number | null
  prefill_ms: number | null
  decode_ms: number | null
  total_ms: number | null
  token_count: number | null
  tpot_ms: number | null
  finish_reason: string | null
  error: string | null
}

const CATEGORY_LABELS: Record<string, string> = {
  random: 'random',
  shared_prefix: 'shared prefix',
  exact_repeat: 'exact repeat',
}

export function categoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] ?? cat
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-card px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-wider text-muted">{label}</div>
      <div className="text-sm font-mono text-fg mt-0.5">{value}</div>
    </div>
  )
}

interface RequestResultModalProps {
  req: PersistedRequest
  index: number
  onClose: () => void
}

export function RequestResultModal({ req, index, onClose }: RequestResultModalProps) {
  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const tps =
    req.tpot_ms != null && req.tpot_ms > 0 ? Math.round(1000 / req.tpot_ms) : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-lg border border-border bg-panel shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm text-fg">
              Req #{String(index + 1).padStart(3, '0')}
            </span>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase bg-card border border-border text-muted">
              {categoryLabel(req.category)}
            </span>
            <span
              className={clsx(
                'px-1.5 py-0.5 rounded text-[9px] font-semibold capitalize',
                req.phase === 'warmup'
                  ? 'bg-amber-accent/20 text-amber-accent'
                  : 'bg-blue-accent/20 text-blue-accent'
              )}
            >
              {req.phase}
            </span>
            {req.error && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-red-accent/20 text-red-accent">
                error
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-fg text-lg leading-none px-1"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-4 py-3 flex flex-col gap-4">
          {/* Prompt */}
          <section>
            <h3 className="text-[10px] uppercase tracking-wider text-muted mb-1">
              Prompt {req.prompt_id ? `· ${req.prompt_id}` : ''}
            </h3>
            <p className="text-xs text-fg whitespace-pre-wrap rounded border border-border bg-card p-2.5">
              {req.prompt_text || '—'}
            </p>
          </section>

          {/* Metrics grid */}
          <section>
            <h3 className="text-[10px] uppercase tracking-wider text-muted mb-1.5">Metrics</h3>
            <div className="grid grid-cols-3 gap-2">
              <Metric label="TTFT" value={fmtMs(req.ttft_ms ?? undefined)} />
              <Metric label="Prefill" value={fmtMs(req.prefill_ms ?? undefined)} />
              <Metric label="Decode" value={fmtMs(req.decode_ms ?? undefined)} />
              <Metric label="Total" value={fmtMs(req.total_ms ?? undefined)} />
              <Metric
                label="Tokens"
                value={req.token_count != null ? String(req.token_count) : '—'}
              />
              <Metric label="Throughput" value={tps != null ? `${tps} tok/s` : '—'} />
              <Metric
                label="TPOT"
                value={req.tpot_ms != null ? `${req.tpot_ms.toFixed(1)}ms` : '—'}
              />
              <Metric label="Finish" value={req.finish_reason ?? '—'} />
              <Metric label="Phase" value={req.phase} />
            </div>
          </section>

          {/* Error, if any — no streamed response text is persisted for benchmark runs */}
          {req.error && (
            <section>
              <h3 className="text-[10px] uppercase tracking-wider text-muted mb-1">Error</h3>
              <p className="text-xs text-red-accent whitespace-pre-wrap rounded border border-red-accent/40 bg-red-accent/10 p-2.5">
                {req.error}
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
