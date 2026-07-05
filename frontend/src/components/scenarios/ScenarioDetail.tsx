import type { Scenario, CurrentStatus } from '@/types/scenario'
import { OverridesForm } from './OverridesForm'

interface ScenarioDetailProps {
  scenario: Scenario
  activeStatus: CurrentStatus | null
  overrides: Record<string, unknown>
  onSet: (field: string, value: unknown) => void
  onReset: () => void
  disabled?: boolean
}

/** Detail view for the selected scenario: launch/config summary + the tunable
 *  overrides form. Shows both what's actively running and the scenario default. */
export function ScenarioDetail({
  scenario,
  activeStatus,
  overrides,
  onSet,
  onReset,
  disabled,
}: ScenarioDetailProps) {
  const configEntries = scenario.config ? Object.entries(scenario.config) : []
  const activeConfigEntries =
    activeStatus && 'config' in activeStatus && activeStatus.config
      ? Object.entries(activeStatus.config)
      : []

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-fg">{scenario.name}</h3>
        {scenario.description && (
          <p className="mt-0.5 text-xs text-muted">{scenario.description}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {scenario.backend && (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-card border border-blue-accent/40 text-blue-accent">
            {scenario.backend}
          </span>
        )}
        {scenario.model && (
          <span
            className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-card border border-border text-muted"
            title="Model is fixed for this scenario and cannot be overridden"
          >
            {scenario.model}
          </span>
        )}
      </div>

      {/* Launch command */}
      {scenario.launch_command && scenario.launch_command.length > 0 && (
        <div>
          <h4 className="text-[10px] uppercase tracking-wider text-muted mb-1">
            Launch command
          </h4>
          <pre className="max-h-32 overflow-auto rounded border border-border bg-card p-2 text-[10px] font-mono text-fg whitespace-pre-wrap break-words">
            {scenario.launch_command.join(' ')}
          </pre>
        </div>
      )}

      {/* Active config (what's actually running) */}
      {activeConfigEntries.length > 0 && (
        <div>
          <h4 className="text-[10px] uppercase tracking-wider text-green-accent font-semibold mb-1">
            ✓ Active config (running now)
          </h4>
          <div className="grid grid-cols-2 gap-1">
            {activeConfigEntries.map(([k, v]) => (
              <div
                key={k}
                className="flex items-center justify-between gap-2 rounded border border-green-accent/30 bg-green-accent/10 px-2 py-1"
              >
                <span className="text-[10px] text-muted font-mono truncate">{k}</span>
                <span className="text-[10px] text-fg font-mono truncate">
                  {v == null ? '—' : String(v)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scenario's declared config */}
      {configEntries.length > 0 && (
        <div>
          <h4 className="text-[10px] uppercase tracking-wider text-muted mb-1">
            {activeConfigEntries.length > 0 ? 'Scenario default config' : 'Config'}
          </h4>
          <div className="grid grid-cols-2 gap-1">
            {configEntries.map(([k, v]) => {
              const activeVal = activeConfigEntries.find(([ak]) => ak === k)?.[1]
              const isDifferent = activeVal !== v && activeConfigEntries.length > 0
              return (
                <div
                  key={k}
                  className={`flex items-center justify-between gap-2 rounded border px-2 py-1 ${
                    isDifferent
                      ? 'border-amber-accent/30 bg-amber-accent/10'
                      : 'border-border bg-card'
                  }`}
                >
                  <span className="text-[10px] text-muted font-mono truncate">{k}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-fg font-mono truncate">
                      {v == null ? '—' : String(v)}
                    </span>
                    {isDifferent && (
                      <span className="text-[9px] text-amber-accent font-semibold shrink-0">
                        (active: {activeVal == null ? '—' : String(activeVal)})
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Tunable overrides */}
      <OverridesForm
        scenario={scenario}
        overrides={overrides}
        onSet={onSet}
        onReset={onReset}
        disabled={disabled}
      />
    </div>
  )
}
