import clsx from 'clsx'
import type { RequestResult } from '@/types/metrics'
import { fmtMs } from '@/utils/formatters'

interface RequestCardProps {
  req: RequestResult
  index: number
  onClick?: () => void
}

const STATE_STYLES = {
  queued:     { border: 'border-border',              badge: 'bg-muted/20 text-muted',              label: 'Queued' },
  prefilling: { border: 'border-amber-accent animate-pulse', badge: 'bg-amber-accent/20 text-amber-accent', label: 'Prefilling' },
  decoding:   { border: 'border-blue-accent animate-pulse',  badge: 'bg-blue-accent/20 text-blue-accent',  label: 'Decoding' },
  done:       { border: 'border-green-accent/40',     badge: 'bg-green-accent/15 text-green-accent', label: 'Done' },
  error:      { border: 'border-red-accent',          badge: 'bg-red-accent/20 text-red-accent',    label: 'Error' },
}

const CATEGORY_LABELS = {
  random:        'random',
  shared_prefix: 'shared',
  exact_repeat:  'repeat',
}

export function RequestCard({ req, index, onClick }: RequestCardProps) {
  const style = STATE_STYLES[req.state]

  return (
    <button
      type="button"
      onClick={onClick}
      title="Click to view full request details"
      className={clsx(
        'text-left rounded border-l-2 bg-card p-2 flex flex-col gap-1 text-[11px]',
        'cursor-pointer hover:ring-1 hover:ring-blue-accent/50 transition-shadow',
        style.border,
        req.state === 'done' && 'opacity-80'
      )}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-1">
        <span className="font-mono text-muted">Req #{String(index + 1).padStart(3, '0')}</span>
        <div className="flex items-center gap-1">
          <span className={clsx('px-1 py-0.5 rounded text-[9px] font-semibold uppercase', 'bg-card border border-border text-muted')}>
            {CATEGORY_LABELS[req.category]}
          </span>
          <span className={clsx('px-1.5 py-0.5 rounded text-[9px] font-semibold', style.badge)}>
            {style.label}
          </span>
        </div>
      </div>

      {/* Prompt preview */}
      <p className="text-muted leading-tight truncate" title={req.prompt_text}>
        {req.prompt_text || 'Waiting for prompt…'}
      </p>

      {/* Streaming tokens */}
      {(req.state === 'decoding' || req.state === 'done') && req.tokens_text && (
        <p className="text-fg/70 leading-tight line-clamp-2 font-mono text-[10px]">
          {req.tokens_text.slice(-100)}
        </p>
      )}

      {/* Error */}
      {req.state === 'error' && req.error && (
        <p className="text-red-accent text-[10px]">{req.error}</p>
      )}

      {/* Metrics row */}
      <div className="flex items-center gap-2 text-muted mt-0.5">
        {req.ttft_ms != null && (
          <span>TTFT: <span className="text-fg">{fmtMs(req.ttft_ms)}</span></span>
        )}
        {req.token_count != null && (
          <span>Tokens: <span className="text-fg">{req.token_count}</span></span>
        )}
        {req.tpot_ms != null && req.token_count != null && req.tpot_ms > 0 && (
          <span><span className="text-fg">{Math.round(1000 / req.tpot_ms)}</span> tok/s</span>
        )}
      </div>

      {/* Token progress bar (decoding) */}
      {req.state === 'decoding' && req.token_count != null && (
        <div className="h-0.5 bg-border rounded overflow-hidden">
          <div
            className="h-full bg-blue-accent transition-all duration-300"
            style={{ width: `${Math.min(100, (req.token_count / 200) * 100)}%` }}
          />
        </div>
      )}
    </button>
  )
}
