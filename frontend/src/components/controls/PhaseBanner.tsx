import clsx from 'clsx'
import type { RunPhase } from '@/types/experiment'

interface PhaseBannerProps {
  phase: RunPhase
}

const PHASE_CONFIG: Record<string, { label: string; color: string }> = {
  warmup:       { label: '⚡ Warmup Phase — heating CUDA graphs…',        color: 'border-amber-accent/50 bg-amber-accent/10 text-amber-accent' },
  benchmarking: { label: '🚀 Benchmarking — collecting results…',          color: 'border-blue-accent/50 bg-blue-accent/10 text-blue-accent' },
  complete:     { label: '✓ Benchmark Complete',                             color: 'border-green-accent/50 bg-green-accent/10 text-green-accent' },
  error:        { label: '✗ Benchmark Error — check logs',                  color: 'border-red-accent/50 bg-red-accent/10 text-red-accent' },
}

export function PhaseBanner({ phase }: PhaseBannerProps) {
  const cfg = PHASE_CONFIG[phase]
  if (!cfg) return null

  return (
    <div className={clsx('text-xs font-medium px-3 py-1.5 border rounded mx-4 mt-2 text-center', cfg.color)}>
      {cfg.label}
    </div>
  )
}
