import { useMetrics } from '@/hooks/useMetrics'
import { fmtGB, fmtTps, fmtPct } from '@/utils/formatters'

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
        <span className="text-2xl font-bold text-white leading-none">{value}</span>
        {sparkData && <Sparkline data={sparkData} color={color} />}
      </div>
      {sub && <span className="text-[10px] text-muted">{sub}</span>}
    </div>
  )
}

export function StatCards() {
  const { snapshots, latest } = useMetrics()

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
        value={latest ? fmtPct(latest.kv_cache_pct) : '—'}
        color="#D97706"
        sparkData={kvData.slice(-20)}
      />
    </div>
  )
}
