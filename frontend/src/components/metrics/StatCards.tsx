import { useMetrics } from '@/hooks/useMetrics'
import { fmtGB, fmtTps, fmtPct } from '@/utils/formatters'
import type { MetricsSnapshot } from '@/types/metrics'

interface StatCardProps {
  label: string
  value: string
  sub?: string
  sparkData?: number[]
  color: string
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data) || 1
  const w = 60
  const h = 20
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / (max - min || 1)) * h
    return `${x},${y}`
  }).join(' ')

  return (
    <svg width={w} height={h} className="opacity-70">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

function StatCard({ label, value, sub, sparkData, color }: StatCardProps) {
  return (
    <div className="bg-card border border-border rounded-lg p-3 flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</span>
      <div className="flex items-end justify-between gap-2">
        <span className="text-2xl font-bold text-fg leading-none">{value}</span>
        {sparkData && <Sparkline data={sparkData} color={color} />}
      </div>
      {sub && <span className="text-[10px] text-muted">{sub}</span>}
    </div>
  )
}

// KV_CACHE_API_CONTRACT.md §2: used_gb/total_gb are independently nullable
// (e.g. vLLM's /metrics scrape can be transiently unreachable while the
// capacity log line is still known) — only show the GB breakdown when both
// are present, otherwise fall back to no sub-label rather than a stray dash.
function kvCacheSub(latest: MetricsSnapshot | null | undefined): string | undefined {
  const kv = latest?.kv_cache
  if (kv?.used_gb == null || kv?.total_gb == null) return undefined
  return `${kv.used_gb.toFixed(2)} of ${kv.total_gb.toFixed(2)} GB`
}

interface StatCardsProps {
  /** Optional historical snapshots; when omitted the live metrics store is used. */
  snapshots?: MetricsSnapshot[]
  latest?: MetricsSnapshot | null
}

export function StatCards({ snapshots: snapOverride, latest: latestOverride }: StatCardsProps = {}) {
  const live = useMetrics()
  const snapshots = snapOverride ?? live.snapshots
  const latest = latestOverride !== undefined ? latestOverride : live.latest

  const gpuData = snapshots.map((s) => s.gpu_util)
  const vramData = snapshots.map((s) => s.vram_used_mb)
  const tpsData  = snapshots.map((s) => s.tokens_per_sec)
  const kvData   = snapshots.map((s) => s.kv_cache_pct)

  return (
    <div className="grid grid-cols-4 gap-3 px-4 pt-4 pb-2 shrink-0">
      <StatCard
        label="GPU Utilization"
        value={latest ? `${latest.gpu_util}%` : '—'}
        color="#2563EB"
        sparkData={gpuData.slice(-20)}
      />
      <StatCard
        label="VRAM Used"
        value={latest ? fmtGB(latest.vram_used_mb) : '—'}
        sub={latest ? `of ${fmtGB(latest.vram_total_mb)} total` : undefined}
        color="#8B5CF6"
        sparkData={vramData.slice(-20)}
      />
      <StatCard
        label="Tokens / Sec"
        value={latest ? fmtTps(latest.tokens_per_sec) : '—'}
        color="#059669"
        sparkData={tpsData.slice(-20)}
      />
      <StatCard
        label="KV Cache"
        value={latest ? fmtPct(latest.kv_cache?.usage_percent ?? latest.kv_cache_pct) : '—'}
        sub={kvCacheSub(latest)}
        color="#D97706"
        sparkData={kvData.slice(-20)}
      />
    </div>
  )
}
