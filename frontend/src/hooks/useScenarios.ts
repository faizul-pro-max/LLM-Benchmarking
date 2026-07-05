import { useCallback, useEffect, useRef } from 'react'
import { useScenarioStore } from '@/store/scenarioStore'
import type {
  ScenariosResponse,
  CurrentStatus,
  RunScenarioResult,
  SwitchJob,
} from '@/types/scenario'

/** Poll cadence for /current while the panel is open. */
const CURRENT_POLL_MS = 5000
/** Poll cadence for an in-flight switch job. */
const SWITCH_POLL_MS = 1000

/**
 * Data + action layer for the Scenario Controller panel.
 *
 * Fetches the scenario catalog and live status, drives scenario switches, and
 * polls an in-flight switch job to completion. All controller calls go through
 * the backend proxy under `/api/controller/*` (the backend attaches auth).
 *
 * Pass `open` = whether the panel is visible; current status is polled every
 * ~5s only while open. All timers are cleaned up on unmount / close.
 */
export function useScenarios(open: boolean) {
  const store = useScenarioStore
  // Track live timers so we can always clean up, even across re-renders.
  const currentPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const switchPollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (switchPollRef.current) clearTimeout(switchPollRef.current)
    }
  }, [])

  const fetchScenarios = useCallback(async () => {
    try {
      const res = await fetch('/api/controller/scenarios')
      if (!res.ok) throw new Error(String(res.status))
      const data: ScenariosResponse = await res.json()
      if (!mountedRef.current) return
      const s = store.getState()
      if ('configured' in data && data.configured === false) {
        s.setConfigured(false)
        s.setReachable(false)
        return
      }
      if ('reachable' in data && data.reachable === false) {
        s.setConfigured(true)
        s.setReachable(false)
        return
      }
      if ('current' in data && Array.isArray(data.scenarios)) {
        s.setCatalog({
          current: data.current,
          scenarios: data.scenarios,
          versions: data.versions,
        })
      }
    } catch {
      if (!mountedRef.current) return
      // Network/proxy error — treat as unreachable but keep any known catalog.
      const s = store.getState()
      if (s.configured) s.setReachable(false)
    }
  }, [store])

  const fetchCurrent = useCallback(async () => {
    try {
      const res = await fetch('/api/controller/current')
      if (!res.ok) throw new Error(String(res.status))
      const data: CurrentStatus = await res.json()
      if (!mountedRef.current) return
      const s = store.getState()
      if ('configured' in data && data.configured === false) {
        s.setConfigured(false)
        s.setReachable(false)
        s.setStatus(null)
        return
      }
      if ('reachable' in data && data.reachable === false) {
        s.setConfigured(true)
        s.setReachable(false)
        s.setStatus(data)
        return
      }
      if ('scenario' in data) {
        s.setConfigured(true)
        s.setReachable(true)
        s.setStatus(data)
        s.setCurrent(data.scenario)
      }
    } catch {
      if (!mountedRef.current) return
      const s = store.getState()
      if (s.configured) s.setReachable(false)
    }
  }, [store])

  const selectScenario = useCallback(
    (name: string) => {
      const s = store.getState()
      s.selectScenario(name)
      s.setBanner(null)
    },
    [store]
  )

  const setOverride = useCallback(
    (field: string, value: unknown) => {
      store.getState().setOverride(field, value)
    },
    [store]
  )

  const resetOverrides = useCallback(() => {
    store.getState().resetOverrides()
  }, [store])

  /** Poll a switch job until it reaches a terminal state. */
  const pollSwitch = useCallback(
    (jobId: string) => {
      const tick = async () => {
        if (!mountedRef.current) return
        try {
          const res = await fetch(
            `/api/controller/switch/status?id=${encodeURIComponent(jobId)}`
          )
          if (!res.ok) throw new Error(String(res.status))
          const data: { job: SwitchJob } = await res.json()
          if (!mountedRef.current) return
          const job = data.job
          const s = store.getState()
          s.setSwitchJob(job)

          if (job.state === 'done') {
            s.setRunning(false)
            s.setSwitchJob(null)
            s.setBanner({
              kind: 'info',
              message: `Switched to "${job.to ?? s.selectedScenario ?? 'scenario'}" — ready to run`,
            })
            await fetchCurrent()
            await fetchScenarios()
            return
          }
          if (job.state === 'failed') {
            s.setRunning(false)
            s.setSwitchJob(null)
            const base = job.error || job.message || 'Switch failed'
            const msg = job.rolled_back
              ? `${base} — rolled back to ${job.from ?? 'the previous scenario'}`
              : base
            s.setBanner({ kind: 'error', message: msg })
            await fetchCurrent()
            return
          }
          // Still switching — schedule the next poll.
          switchPollRef.current = setTimeout(tick, SWITCH_POLL_MS)
        } catch {
          if (!mountedRef.current) return
          // Transient error mid-switch — keep polling rather than give up.
          switchPollRef.current = setTimeout(tick, SWITCH_POLL_MS)
        }
      }
      switchPollRef.current = setTimeout(tick, SWITCH_POLL_MS)
    },
    [store, fetchCurrent, fetchScenarios]
  )

  /** Run the selected scenario. `force` bypasses a benchmark lock. */
  const runSelected = useCallback(
    async (force = false) => {
      const s = store.getState()
      if (s.running) return
      const scenario = s.selectedScenario
      if (!scenario) {
        s.setBanner({ kind: 'invalid', message: 'Select a scenario first' })
        return
      }

      s.setRunning(true)
      s.setBanner(null)

      // Only send overrides the user actually changed.
      const overrides =
        Object.keys(s.overrides).length > 0 ? s.overrides : undefined

      try {
        const res = await fetch('/api/controller/run/scenario', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scenario, overrides, force }),
        })
        if (!res.ok) throw new Error(String(res.status))
        const result: RunScenarioResult = await res.json()
        if (!mountedRef.current) return
        const st = store.getState()

        switch (result.kind) {
          case 'ready':
            st.setRunning(false)
            st.setBanner({
              kind: 'info',
              message: 'Scenario already active — ready to run',
            })
            await fetchCurrent()
            break

          case 'switching':
            st.setSwitchJob({
              id: result.job_id,
              state: 'switching',
              to: result.scenario ?? scenario,
            })
            pollSwitch(result.job_id)
            break

          case 'busy':
            st.setRunning(false)
            st.setBanner({
              kind: 'busy',
              message:
                result.message ??
                'A benchmark is running — wait for it to finish or stop it',
            })
            await fetchCurrent()
            break

          case 'switch_in_progress':
            st.setRunning(false)
            st.setBanner({
              kind: 'info',
              message: result.message ?? 'Another switch is running — please wait',
            })
            await fetchCurrent()
            break

          case 'invalid':
            st.setRunning(false)
            st.setBanner({ kind: 'invalid', message: result.message })
            break
        }
      } catch {
        if (!mountedRef.current) return
        const st = store.getState()
        st.setRunning(false)
        st.setBanner({
          kind: 'error',
          message: 'Could not reach the scenario controller',
        })
      }
    },
    [store, fetchCurrent, pollSwitch]
  )

  // Poll /current every ~5s while the panel is open (skip while a switch is
  // being polled on its own faster cadence — pollSwitch refreshes current).
  useEffect(() => {
    if (!open) {
      if (currentPollRef.current) {
        clearInterval(currentPollRef.current)
        currentPollRef.current = null
      }
      return
    }
    fetchCurrent()
    currentPollRef.current = setInterval(() => {
      if (!store.getState().switchJob) fetchCurrent()
    }, CURRENT_POLL_MS)
    return () => {
      if (currentPollRef.current) {
        clearInterval(currentPollRef.current)
        currentPollRef.current = null
      }
    }
  }, [open, fetchCurrent, store])

  return {
    fetchScenarios,
    fetchCurrent,
    selectScenario,
    setOverride,
    resetOverrides,
    runSelected,
  }
}
