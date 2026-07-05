import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { fmtMs } from '@/utils/formatters'
import {
  RequestResultModal,
  categoryLabel,
  type PersistedRequest,
} from './RequestResultModal'

interface RequestsTableProps {
  requests: PersistedRequest[]
  loading: boolean
}

export function RequestsTable({ requests, loading }: RequestsTableProps) {
  const [selected, setSelected] = useState<number | null>(null)

  const benchmark = useMemo(
    () => requests.filter((r) => r.phase === 'benchmark'),
    [requests]
  )
  const warmupCount = requests.length - benchmark.length

  return (
    <div className="px-4 py-3 border-t border-border">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[11px] font-semibold text-fg">Per-Prompt Results</h3>
        <div className="text-[10px] text-muted">
          {benchmark.length} benchmark request{benchmark.length === 1 ? '' : 's'}
          {warmupCount > 0 && <span> · {warmupCount} warmup excluded</span>}
        </div>
      </div>

      {loading ? (
        <div className="text-xs text-muted">Loading requests…</div>
      ) : benchmark.length === 0 ? (
        <div className="text-xs text-muted">No benchmark requests recorded for this run.</div>
      ) : (
        <div className="max-h-[360px] overflow-auto rounded-lg border border-border">
          <table className="w-full text-left text-[11px] font-mono">
            <thead className="sticky top-0 bg-card text-muted">
              <tr className="border-b border-border">
                <th className="px-2.5 py-1.5 font-semibold">#</th>
                <th className="px-2.5 py-1.5 font-semibold">Category</th>
                <th className="px-2.5 py-1.5 font-semibold text-right">TTFT</th>
                <th className="px-2.5 py-1.5 font-semibold text-right">Prefill</th>
                <th className="px-2.5 py-1.5 font-semibold text-right">Decode</th>
                <th className="px-2.5 py-1.5 font-semibold text-right">Total</th>
                <th className="px-2.5 py-1.5 font-semibold text-right">Tokens</th>
                <th className="px-2.5 py-1.5 font-semibold text-right">TPOT</th>
                <th className="px-2.5 py-1.5 font-semibold">Finish</th>
              </tr>
            </thead>
            <tbody>
              {benchmark.map((r, i) => (
                <tr
                  key={r.id}
                  onClick={() => setSelected(i)}
                  className={clsx(
                    'border-b border-border/60 last:border-b-0 cursor-pointer transition-colors',
                    r.error ? 'hover:bg-red-accent/10' : 'hover:bg-card'
                  )}
                >
                  <td className="px-2.5 py-1.5 text-muted">
                    {r.prompt_id || String(i + 1).padStart(3, '0')}
                  </td>
                  <td className="px-2.5 py-1.5 text-fg">{categoryLabel(r.category)}</td>
                  <td className="px-2.5 py-1.5 text-right text-fg">{fmtMs(r.ttft_ms ?? undefined)}</td>
                  <td className="px-2.5 py-1.5 text-right text-fg">{fmtMs(r.prefill_ms ?? undefined)}</td>
                  <td className="px-2.5 py-1.5 text-right text-fg">{fmtMs(r.decode_ms ?? undefined)}</td>
                  <td className="px-2.5 py-1.5 text-right text-fg">{fmtMs(r.total_ms ?? undefined)}</td>
                  <td className="px-2.5 py-1.5 text-right text-fg">
                    {r.token_count != null ? r.token_count : '—'}
                  </td>
                  <td className="px-2.5 py-1.5 text-right text-fg">
                    {r.tpot_ms != null ? `${r.tpot_ms.toFixed(1)}ms` : '—'}
                  </td>
                  <td className="px-2.5 py-1.5">
                    {r.error ? (
                      <span className="text-red-accent">error</span>
                    ) : (
                      <span className="text-muted">{r.finish_reason ?? '—'}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected != null && benchmark[selected] && (
        <RequestResultModal
          req={benchmark[selected]}
          index={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
