import { useEffect } from 'react'
import clsx from 'clsx'
import type { RequestResult } from '@/types/metrics'
import { fmtMs } from '@/utils/formatters'
import { useRunStore } from '@/store/runStore'

interface RequestDetailModalProps {
  req: RequestResult
  index: number
  onClose: () => void
}

const STATE_BADGE: Record<RequestResult['state'], string> = {
  queued:     'bg-muted/20 text-muted',
  prefilling: 'bg-amber-accent/20 text-amber-accent',
  decoding:   'bg-blue-accent/20 text-blue-accent',
  done:       'bg-green-accent/15 text-green-accent',
  error:      'bg-red-accent/20 text-red-accent',
}

const CATEGORY_LABELS: Record<RequestResult['category'], string> = {
  random:        'random',
  shared_prefix: 'shared prefix',
  exact_repeat:  'exact repeat',
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-card px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-wider text-muted">{label}</div>
      <div className="text-sm font-mono text-fg mt-0.5">{value}</div>
    </div>
  )
}

export function RequestDetailModal({ req, index, onClose }: RequestDetailModalProps) {
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

  // Network-excluded TTFT estimate: subtract the run's measured vLLM RTT
  // baseline (probed once at run start — see backend networkProbe.ts) from
  // this request's client-measured TTFT. Falls back to the completed run's
  // summary if the live 'warmup' phase event that carries it was missed
  // (e.g. page reload mid-run).
  const networkRttMs = useRunStore((s) => s.networkRttMs ?? s.summary?.network_rtt_ms ?? null)
  const ttftNoNetworkMs =
    req.ttft_ms != null && networkRttMs != null ? Math.max(0, req.ttft_ms - networkRttMs) : null

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
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-fg">
              Req #{String(req.seq ?? index + 1).padStart(3, '0')}
            </span>
            {req.workload === 'qa' && req.conversation_id != null && req.turn_index != null && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-card border border-border text-muted whitespace-nowrap">
                conv {req.conversation_id.slice(-5)} · turn {req.turn_index + 1}
              </span>
            )}
            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase bg-card border border-border text-muted">
              {CATEGORY_LABELS[req.category]}
            </span>
            <span
              className={clsx(
                'px-1.5 py-0.5 rounded text-[9px] font-semibold capitalize',
                STATE_BADGE[req.state]
              )}
            >
              {req.state}
            </span>
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
            <h3 className="text-[10px] uppercase tracking-wider text-muted mb-1.5">
              Metrics
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <Metric label="TTFT" value={fmtMs(req.ttft_ms)} />
              <Metric
                label="TTFT (No Network)"
                value={ttftNoNetworkMs != null ? fmtMs(ttftNoNetworkMs) : '—'}
              />
              <Metric label="Prefill" value={fmtMs(req.prefill_ms)} />
              <Metric label="Decode" value={fmtMs(req.decode_ms)} />
              <Metric label="Total" value={fmtMs(req.total_ms)} />
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

          {/* LLM output */}
          <section>
            <h3 className="text-[10px] uppercase tracking-wider text-muted mb-1">
              LLM Response
            </h3>
            {req.error ? (
              <p className="text-xs text-red-accent whitespace-pre-wrap rounded border border-red-accent/40 bg-red-accent/10 p-2.5">
                {req.error}
              </p>
            ) : (
              <p className="text-xs text-fg/90 font-mono leading-relaxed whitespace-pre-wrap rounded border border-border bg-card p-2.5 min-h-[3rem]">
                {req.tokens_text || (req.state === 'done' ? '(empty response)' : 'Waiting for output…')}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
