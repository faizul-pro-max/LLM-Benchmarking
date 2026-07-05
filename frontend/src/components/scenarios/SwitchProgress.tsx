import clsx from 'clsx'
import type { SwitchJob } from '@/types/scenario'
import {
  SWITCH_PHASE_ORDER,
  switchPhaseLabel,
} from '@/types/scenario'

/** Indeterminate step/phase progress for an in-flight scenario switch.
 *  Switches take 60–180s, so this shows *which* phase we're in, never a
 *  seconds countdown. */
export function SwitchProgress({ job }: { job: SwitchJob }) {
  const activeIdx = job.phase ? SWITCH_PHASE_ORDER.indexOf(job.phase) : -1

  return (
    <div className="rounded-lg border border-blue-accent/40 bg-blue-accent/10 p-3">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="w-2 h-2 rounded-full bg-blue-accent animate-pulse" />
        <span className="text-sm font-semibold text-fg">
          Switching scenario
          {job.to ? (
            <span className="text-muted font-normal"> → {job.to}</span>
          ) : null}
        </span>
      </div>

      {/* Indeterminate bar */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-card mb-3">
        <div className="h-full w-1/3 rounded-full bg-blue-accent animate-pulse" />
      </div>

      {/* Phase steps */}
      <ol className="flex flex-col gap-1.5">
        {SWITCH_PHASE_ORDER.map((phase, i) => {
          const done = activeIdx > -1 && i < activeIdx
          const active = activeIdx > -1 && i === activeIdx
          return (
            <li key={phase} className="flex items-center gap-2 text-xs">
              <span
                className={clsx(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold',
                  done && 'bg-green-accent text-white',
                  active && 'bg-blue-accent text-white animate-pulse',
                  !done && !active && 'bg-card text-muted border border-border'
                )}
              >
                {done ? '✓' : i + 1}
              </span>
              <span
                className={clsx(
                  active ? 'text-fg font-medium' : done ? 'text-muted' : 'text-muted/70'
                )}
              >
                {switchPhaseLabel(phase)}
              </span>
            </li>
          )
        })}
      </ol>

      {job.message && (
        <p className="mt-2.5 text-[11px] text-muted font-mono break-words">
          {job.message}
        </p>
      )}
    </div>
  )
}
