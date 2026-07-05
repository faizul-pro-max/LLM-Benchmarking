import clsx from 'clsx'
import type { RunPhase } from '@/types/experiment'
import { RichTextEditor } from './RichTextEditor'

interface RunControlsProps {
  phase: RunPhase
  concurrency: number
  onConcurrencyChange: (v: number) => void
  promptCount: number
  onPromptCountChange: (n: number) => void
  description: string
  onDescriptionChange: (html: string) => void
  onStart: () => void
  onStop: () => void
}

export function RunControls({
  phase,
  concurrency,
  onConcurrencyChange,
  promptCount,
  onPromptCountChange,
  description,
  onDescriptionChange,
  onStart,
  onStop,
}: RunControlsProps) {
  const isRunning =
    phase === 'warmup' || phase === 'benchmarking' || phase === 'pending' || phase === 'stopping'
  const isStopping = phase === 'stopping'

  return (
    <div className="flex flex-col gap-2 px-3 py-2 border-b border-border shrink-0">
      <div className="flex items-center gap-3">
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

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-muted uppercase tracking-wider whitespace-nowrap">
            Prompts
          </span>
          <input
            type="number"
            min={1}
            max={500}
            value={promptCount}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (Number.isNaN(n)) return
              onPromptCountChange(Math.min(500, Math.max(1, n)))
            }}
            disabled={isRunning}
            className="w-16 px-1.5 py-1 text-xs font-mono text-fg bg-card border border-border rounded focus:outline-none focus:border-blue-accent disabled:opacity-40"
          />
        </div>

        <button
          onClick={onStop}
          disabled={!isRunning || isStopping}
          className={clsx(
            'px-3 py-1.5 text-xs font-medium rounded border transition-colors',
            isStopping
              ? 'border-border/40 text-muted/40 cursor-not-allowed'
              : isRunning
                ? 'border-border text-muted hover:border-red-accent hover:text-red-accent'
                : 'border-border/40 text-muted/40 cursor-not-allowed'
          )}
        >
          {isStopping ? 'Stopping…' : 'Stop'}
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

      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">
          Description (optional)
        </span>
        <RichTextEditor
          value={description}
          onChange={onDescriptionChange}
          disabled={isRunning}
          placeholder="Notes about this run — config changes, what you're testing…"
        />
      </div>
    </div>
  )
}
