import clsx from 'clsx'
import type { RunPhase } from '@/types/experiment'

interface RunControlsProps {
  phase: RunPhase
  concurrency: number
  onConcurrencyChange: (v: number) => void
  onStart: () => void
  onStop: () => void
}

export function RunControls({
  phase,
  concurrency,
  onConcurrencyChange,
  onStart,
  onStop,
}: RunControlsProps) {
  const isRunning = phase === 'warmup' || phase === 'benchmarking' || phase === 'pending'

  return (
    <div className="flex items-center gap-3 px-3 py-2 border-b border-border shrink-0">
      <div className="flex items-center gap-2 flex-1">
        <span className="text-[10px] font-semibold text-muted uppercase tracking-wider whitespace-nowrap">
          Concurrency
        </span>
        <input
          type="range"
          min={1}
          max={50}
          value={concurrency}
          onChange={(e) => onConcurrencyChange(Number(e.target.value))}
          disabled={isRunning}
          className="flex-1 h-1 accent-blue-accent cursor-pointer disabled:opacity-40"
        />
        <span className="text-xs font-mono text-fg w-4 text-right">{concurrency}</span>
      </div>

      <button
        onClick={onStop}
        disabled={!isRunning}
        className={clsx(
          'px-3 py-1.5 text-xs font-medium rounded border transition-colors',
          isRunning
            ? 'border-border text-muted hover:border-red-accent hover:text-red-accent'
            : 'border-border/40 text-muted/40 cursor-not-allowed'
        )}
      >
        Stop
      </button>

      <button
        onClick={onStart}
        disabled={isRunning}
        className={clsx(
          'px-3 py-1.5 text-xs font-semibold rounded transition-colors',
          isRunning
            ? 'bg-green-accent/40 text-white/40 cursor-not-allowed'
            : 'bg-green-accent text-white hover:bg-green-600'
        )}
      >
        Run Test
      </button>
    </div>
  )
}
