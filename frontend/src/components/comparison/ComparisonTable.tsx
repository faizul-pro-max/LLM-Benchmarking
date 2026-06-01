import clsx from 'clsx'
import { useExperimentStore } from '@/store/experimentStore'
import { fmtMs, fmtTps, fmtPct, fmtDiff } from '@/utils/formatters'
import type { ComparisonRow } from '@/types/experiment'

function DiffCell({ value, pct, fmt }: { value: number | null; pct?: number; fmt: (v: number) => string }) {
  if (value == null) return <td className="px-3 py-2 text-muted text-center">—</td>

  const isPositive = pct != null && pct > 0
  const isNegative = pct != null && pct < 0

  // For TTFT lower is better; for Tok/s higher is better
  return (
    <td className="px-3 py-2 text-center">
      <span className="text-white font-mono text-xs">{fmt(value)}</span>
      {pct != null && pct !== 0 && (
        <span
          className={clsx(
            'ml-1.5 text-[10px] font-semibold',
            isNegative ? 'text-green-accent' : isPositive ? 'text-red-accent' : 'text-muted'
          )}
        >
          {fmtDiff(pct)}
        </span>
      )}
    </td>
  )
}

function TpsDiffCell({ value, pct }: { value: number | null; pct?: number }) {
  if (value == null) return <td className="px-3 py-2 text-muted text-center">—</td>

  const isPositive = pct != null && pct > 0
  const isNegative = pct != null && pct < 0

  return (
    <td className="px-3 py-2 text-center">
      <span className="text-white font-mono text-xs">{fmtTps(value)}</span>
      {pct != null && pct !== 0 && (
        <span
          className={clsx(
            'ml-1.5 text-[10px] font-semibold',
            isPositive ? 'text-green-accent' : isNegative ? 'text-red-accent' : 'text-muted'
          )}
        >
          {fmtDiff(pct)}
        </span>
      )}
    </td>
  )
}

export function ComparisonTable() {
  const comparison = useExperimentStore((s) => s.comparison)

  if (!comparison || comparison.length === 0) {
    return (
      <div className="border border-border rounded-lg p-4 text-center text-xs text-muted">
        No experiments to compare yet. Run benchmarks to see results here.
      </div>
    )
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <h3 className="text-[11px] font-semibold text-white">Experiment Comparison</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left text-muted font-semibold uppercase text-[10px] tracking-wider">Experiment</th>
              <th className="px-3 py-2 text-center text-muted font-semibold uppercase text-[10px] tracking-wider">TTFT P50</th>
              <th className="px-3 py-2 text-center text-muted font-semibold uppercase text-[10px] tracking-wider">TTFT P90</th>
              <th className="px-3 py-2 text-center text-muted font-semibold uppercase text-[10px] tracking-wider">Tok/s</th>
              <th className="px-3 py-2 text-center text-muted font-semibold uppercase text-[10px] tracking-wider">GPU Util</th>
              <th className="px-3 py-2 text-center text-muted font-semibold uppercase text-[10px] tracking-wider">KV Cache</th>
            </tr>
          </thead>
          <tbody>
            {comparison.map((row: ComparisonRow) => (
              <tr
                key={row.runId}
                className={clsx(
                  'border-b border-border/50 transition-colors',
                  row.isActive && 'bg-blue-accent/10',
                  !row.isActive && 'hover:bg-card/50'
                )}
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    {row.isBaseline && (
                      <span className="w-2 h-2 rounded-full bg-blue-accent shrink-0" />
                    )}
                    <span className={clsx('font-medium', row.isActive ? 'text-blue-accent' : 'text-white')}>
                      {row.name}
                    </span>
                    {row.isBaseline && (
                      <span className="text-[9px] text-muted bg-card border border-border px-1 rounded">baseline</span>
                    )}
                  </div>
                </td>
                <DiffCell value={row.ttft_p50_ms} pct={row.pct_ttft_p50} fmt={(v) => fmtMs(v)} />
                <DiffCell value={row.ttft_p90_ms} pct={row.pct_ttft_p90} fmt={(v) => fmtMs(v)} />
                <TpsDiffCell value={row.tokens_per_sec_avg} pct={row.pct_tps} />
                <DiffCell value={row.gpu_util_avg} pct={row.pct_gpu} fmt={(v) => fmtPct(v)} />
                <DiffCell value={row.kv_cache_avg} pct={row.pct_kv} fmt={(v) => fmtPct(v)} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="px-3 py-2 border-t border-border flex items-center gap-3 flex-wrap">
        <span className="text-[10px] text-green-accent">▼ green = improvement</span>
        <span className="text-[10px] text-red-accent">▲ red = regression</span>
        <span className="text-[10px] text-muted">TTFT: lower is better · Tok/s: higher is better</span>
      </div>
    </div>
  )
}
