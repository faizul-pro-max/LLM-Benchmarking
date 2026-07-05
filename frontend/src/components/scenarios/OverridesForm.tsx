import clsx from 'clsx'
import type { Scenario, TunableFlag } from '@/types/scenario'
import {
  TUNABLE_FLAG_KINDS,
  TUNABLE_FLAG_LABELS,
  isTunableFlag,
} from '@/types/scenario'

interface OverridesFormProps {
  scenario: Scenario
  overrides: Record<string, unknown>
  onSet: (field: string, value: unknown) => void
  onReset: () => void
  disabled?: boolean
}

/** Simple on/off switch styled with tailwind tokens. */
function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-blue-accent' : 'bg-border',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <span
        className={clsx(
          'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0.5'
        )}
      />
    </button>
  )
}

/** Resolve the value to render: user override wins, else the scenario's
 *  configured default. */
function baseValue(scenario: Scenario, overrides: Record<string, unknown>, field: string): unknown {
  if (field in overrides) return overrides[field]
  return scenario.config?.[field]
}

/** Overrides form built from a scenario's `tunable_flags`. Booleans render as
 *  toggles; numbers/strings as inputs. `model` is intentionally never editable. */
export function OverridesForm({
  scenario,
  overrides,
  onSet,
  onReset,
  disabled,
}: OverridesFormProps) {
  const flags = (scenario.tunable_flags ?? []).filter(
    (f): f is TunableFlag => isTunableFlag(f) && f !== ('model' as string)
  )

  if (flags.length === 0) {
    return (
      <p className="text-xs text-muted italic">
        This scenario exposes no tunable flags.
      </p>
    )
  }

  const changedCount = flags.filter((f) => f in overrides).length

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted">
          Overrides{changedCount > 0 ? ` · ${changedCount} changed` : ''}
        </span>
        {changedCount > 0 && (
          <button
            type="button"
            onClick={onReset}
            disabled={disabled}
            className="text-[10px] text-blue-accent hover:underline disabled:opacity-50"
          >
            Reset
          </button>
        )}
      </div>

      {flags.map((flag) => {
        const kind = TUNABLE_FLAG_KINDS[flag]
        const label = TUNABLE_FLAG_LABELS[flag]
        const changed = flag in overrides
        const val = baseValue(scenario, overrides, flag)

        return (
          <div
            key={flag}
            className={clsx(
              'flex items-center justify-between gap-3 rounded border px-2.5 py-1.5',
              changed ? 'border-blue-accent/40 bg-blue-accent/5' : 'border-border bg-card'
            )}
          >
            <div className="flex flex-col min-w-0">
              <span className="text-xs text-fg font-medium truncate">{label}</span>
              <span className="text-[9px] text-muted font-mono truncate">{flag}</span>
            </div>

            {kind === 'boolean' ? (
              <Toggle
                label={label}
                disabled={disabled}
                checked={val === true || val === 'true'}
                onChange={(v) => onSet(flag, v)}
              />
            ) : (
              <input
                type={kind === 'number' ? 'number' : 'text'}
                aria-label={label}
                disabled={disabled}
                value={val == null ? '' : String(val)}
                step={kind === 'number' ? 'any' : undefined}
                onChange={(e) => {
                  const raw = e.target.value
                  if (kind === 'number') {
                    onSet(flag, raw === '' ? '' : Number(raw))
                  } else {
                    onSet(flag, raw)
                  }
                }}
                className={clsx(
                  'w-32 rounded border bg-panel px-2 py-1 text-xs text-fg font-mono',
                  'border-border focus:border-blue-accent focus:outline-none',
                  disabled && 'opacity-50 cursor-not-allowed'
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
