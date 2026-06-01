export const fmtMs = (ms: number | undefined): string =>
  ms == null ? '—' : ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`

export const fmtGB = (mb: number | undefined): string =>
  mb == null ? '—' : `${(mb / 1024).toFixed(2)} GB`

export const fmtTps = (tps: number | undefined): string =>
  tps == null ? '—' : tps >= 1000 ? `${(tps / 1000).toFixed(1)}k` : `${Math.round(tps)}`

export const fmtPct = (v: number | undefined): string =>
  v == null ? '—' : `${Math.round(v)}%`

export const fmtDiff = (pct: number | undefined): string => {
  if (pct == null) return '—'
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}
