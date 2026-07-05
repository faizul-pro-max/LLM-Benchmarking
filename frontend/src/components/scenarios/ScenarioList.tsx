import clsx from 'clsx'
import type { Scenario } from '@/types/scenario'

interface ScenarioListProps {
  scenarios: Scenario[]
  current: string | null
  selected: string | null
  onSelect: (name: string) => void
  disabled?: boolean
}

/** Vertical list of switchable scenarios. The current one is badged "Active";
 *  clicking a row selects it (detail + overrides render alongside). */
export function ScenarioList({
  scenarios,
  current,
  selected,
  onSelect,
  disabled,
}: ScenarioListProps) {
  if (scenarios.length === 0) {
    return <p className="text-xs text-muted italic px-1">No scenarios available.</p>
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {scenarios.map((s) => {
        const isActive = s.name === current
        const isSelected = s.name === selected
        return (
          <li key={s.name}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelect(s.name)}
              aria-pressed={isSelected}
              className={clsx(
                'w-full text-left rounded-lg border px-3 py-2 transition-colors',
                isSelected
                  ? 'border-blue-accent bg-blue-accent/10'
                  : 'border-border bg-card hover:border-blue-accent/40 hover:bg-blue-accent/5',
                disabled && 'opacity-60 cursor-not-allowed'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-fg truncate">{s.name}</span>
                {isActive && (
                  <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase bg-green-accent/20 text-green-accent">
                    Active
                  </span>
                )}
              </div>

              {s.description && (
                <p className="mt-0.5 text-[11px] text-muted line-clamp-2">
                  {s.description}
                </p>
              )}

              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {s.backend && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-card border border-blue-accent/40 text-blue-accent">
                    {s.backend}
                  </span>
                )}
                {s.model && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-card border border-border text-muted truncate max-w-[180px]">
                    {s.model}
                  </span>
                )}
                {s.summary && (
                  <span className="text-[9px] text-muted font-mono truncate">
                    {s.summary}
                  </span>
                )}
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
