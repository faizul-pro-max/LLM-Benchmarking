import { useEffect } from 'react'
import clsx from 'clsx'
import { useScenarioStore } from '@/store/scenarioStore'
import { useScenarios } from '@/hooks/useScenarios'
import { ScenarioList } from './ScenarioList'
import { ScenarioDetail } from './ScenarioDetail'
import { SwitchProgress } from './SwitchProgress'
import type { ScenarioBanner, CurrentStatus } from '@/types/scenario'

interface ScenarioPanelProps {
  open: boolean
  onClose: () => void
}

/** Compact one-line render of the versions map: `vllm 0.6.3 · torch 2.4.0`. */
function VersionsLine({ versions }: { versions: Record<string, string> }) {
  const entries = Object.entries(versions)
  if (entries.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] text-muted font-mono">
      {entries.map(([k, v], i) => (
        <span key={k}>
          {i > 0 && <span className="text-border mr-1.5">·</span>}
          {k} {v}
        </span>
      ))}
    </div>
  )
}

const BANNER_STYLES: Record<ScenarioBanner['kind'], string> = {
  info: 'border-blue-accent/40 bg-blue-accent/10 text-blue-accent',
  busy: 'border-amber-accent/40 bg-amber-accent/10 text-amber-accent',
  invalid: 'border-amber-accent/40 bg-amber-accent/10 text-amber-accent',
  error: 'border-red-accent/40 bg-red-accent/10 text-red-accent',
}

/** Live status widget: current scenario + busy/switching badges + lock label. */
function StatusWidget({
  status,
  current,
}: {
  status: CurrentStatus | null
  current: string | null
}) {
  const isLive =
    status != null && 'scenario' in status ? status : null
  const busy = isLive?.busy ?? false
  const switching = isLive?.switching ?? false
  const lock = isLive?.benchmark ?? null

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
      <span className="text-[10px] uppercase tracking-wider text-muted">Current</span>
      <span className="text-sm font-semibold text-fg">{current ?? '—'}</span>
      {switching && (
        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase bg-blue-accent/20 text-blue-accent animate-pulse">
          Switching
        </span>
      )}
      {busy && (
        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase bg-amber-accent/20 text-amber-accent">
          Benchmark running
        </span>
      )}
      {!busy && !switching && (
        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase bg-green-accent/20 text-green-accent">
          Idle
        </span>
      )}
      {lock && (
        <span className="ml-auto text-[10px] text-muted font-mono truncate">
          lock: {lock.label ?? lock.id}
        </span>
      )}
    </div>
  )
}

export function ScenarioPanel({ open, onClose }: ScenarioPanelProps) {
  const {
    fetchScenarios,
    selectScenario,
    setOverride,
    resetOverrides,
    runSelected,
  } = useScenarios(open)

  const configured = useScenarioStore((s) => s.configured)
  const reachable = useScenarioStore((s) => s.reachable)
  const scenarios = useScenarioStore((s) => s.scenarios)
  const versions = useScenarioStore((s) => s.versions)
  const current = useScenarioStore((s) => s.current)
  const status = useScenarioStore((s) => s.status)
  const selectedScenario = useScenarioStore((s) => s.selectedScenario)
  const overrides = useScenarioStore((s) => s.overrides)
  const switchJob = useScenarioStore((s) => s.switchJob)
  const running = useScenarioStore((s) => s.running)
  const banner = useScenarioStore((s) => s.banner)

  // Fetch the catalog whenever the panel opens.
  useEffect(() => {
    if (open) fetchScenarios()
  }, [open, fetchScenarios])

  // Close on Escape.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const liveStatus = status != null && 'scenario' in status ? status : null
  const busy = liveStatus?.busy ?? false
  const isSwitching = !!switchJob || (liveStatus?.switching ?? false)
  const selectedObj = scenarios.find((s) => s.name === selectedScenario) ?? null
  const hasOverrides = Object.keys(overrides).length > 0
  const isRerun = selectedScenario != null && selectedScenario === current && !hasOverrides
  const runDisabled = running || isSwitching || !selectedScenario

  const runLabel = !selectedScenario
    ? 'Select a scenario'
    : isRerun
      ? 'Re-run'
      : `Switch to ${selectedScenario}`

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex w-full max-w-4xl max-h-[88vh] flex-col rounded-lg border border-border bg-panel shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Scenario controller"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-violet-500"
            >
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
              <line x1="1" y1="14" x2="7" y2="14" />
              <line x1="9" y1="8" x2="15" y2="8" />
              <line x1="17" y1="16" x2="23" y2="16" />
            </svg>
            <div>
              <h2 className="text-base font-semibold text-fg leading-tight">Scenarios</h2>
              <VersionsLine versions={versions} />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-fg text-lg leading-none px-1"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-3 overflow-y-auto px-4 py-3">
          {/* Empty / unreachable states */}
          {!configured ? (
            <div className="rounded-lg border border-border bg-card px-4 py-8 text-center">
              <p className="text-sm font-medium text-fg">Scenario controller not configured</p>
              <p className="mt-1 text-xs text-muted">
                Set the controller URL/key on the backend to switch inference scenarios.
              </p>
            </div>
          ) : !reachable ? (
            <div className="rounded-lg border border-red-accent/40 bg-red-accent/10 px-4 py-8 text-center">
              <p className="text-sm font-medium text-red-accent">GPU box unavailable</p>
              <p className="mt-1 text-xs text-muted">
                The scenario controller is configured but not responding. Retry when the box is back.
              </p>
              <button
                type="button"
                onClick={() => fetchScenarios()}
                className="mt-3 px-3 py-1 rounded border border-border bg-card text-xs text-fg hover:border-blue-accent/40"
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              {/* Live status */}
              <StatusWidget status={status} current={current} />

              {/* Banner */}
              {banner && (
                <div
                  className={clsx(
                    'flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs',
                    BANNER_STYLES[banner.kind]
                  )}
                  role="status"
                >
                  <span className="break-words">{banner.message}</span>
                  {banner.kind === 'busy' && (
                    <button
                      type="button"
                      onClick={() => runSelected(true)}
                      disabled={running || isSwitching}
                      className="shrink-0 px-2 py-1 rounded border border-amber-accent/50 bg-amber-accent/15 text-amber-accent font-medium hover:bg-amber-accent/25 disabled:opacity-50"
                    >
                      Force switch
                    </button>
                  )}
                </div>
              )}

              {/* Switch progress */}
              {switchJob && <SwitchProgress job={switchJob} />}

              {/* List + detail */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="min-w-0">
                  <h3 className="text-[10px] uppercase tracking-wider text-muted mb-1.5">
                    Scenarios
                  </h3>
                  <ScenarioList
                    scenarios={scenarios}
                    current={current}
                    selected={selectedScenario}
                    onSelect={selectScenario}
                    disabled={running || isSwitching}
                  />
                </div>

                <div className="min-w-0">
                  <h3 className="text-[10px] uppercase tracking-wider text-muted mb-1.5">
                    Details
                  </h3>
                  {selectedObj ? (
                    <ScenarioDetail
                      scenario={selectedObj}
                      overrides={overrides}
                      onSet={setOverride}
                      onReset={resetOverrides}
                      disabled={running || isSwitching}
                    />
                  ) : (
                    <p className="text-xs text-muted italic px-1">
                      Select a scenario to see its config and overrides.
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer — run action */}
        {configured && reachable && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border shrink-0">
            <span className="text-[11px] text-muted">
              {busy
                ? 'A benchmark is running — use Force switch to override the lock.'
                : isRerun
                  ? 'Selected scenario is already active.'
                  : hasOverrides
                    ? `${Object.keys(overrides).length} override(s) will be applied.`
                    : 'Switching takes 60–180s.'}
            </span>
            <button
              type="button"
              onClick={() => runSelected(false)}
              disabled={runDisabled}
              title={runLabel}
              className={clsx(
                'px-4 py-1.5 rounded font-medium text-sm transition-colors',
                runDisabled
                  ? 'bg-card border border-border text-muted cursor-not-allowed'
                  : 'bg-blue-accent text-white hover:bg-blue-600'
              )}
            >
              {running || isSwitching ? 'Working…' : runLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
