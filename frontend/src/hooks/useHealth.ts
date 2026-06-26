import { useEffect, useRef, useState } from 'react'

/** Active benchmark experiment the GPU agent reports via /experiment,
 *  surfaced through the backend /health summary. */
export interface ActiveExperiment {
  name: string
  backend?: string
  model?: string
  summary?: string
  started_at?: number
}

export interface HealthInfo {
  /** True when the model is reachable. Only flips to false after several
   *  consecutive failed polls so transient network/health blips don't hide UI. */
  vllmOk: boolean
  gpuOk: boolean
  model: string | null
  /** Live benchmark experiment config, or null when none is active. */
  experiment: ActiveExperiment | null
}

/** Number of consecutive failed polls before we treat the model as offline.
 *  At the default 5s interval this is ~15s of sustained failure. */
const FAILURE_THRESHOLD = 3

/** Polls /api/health so the UI knows when a GPU instance + model are connected.
 *  vllmOk is debounced — it stays true through transient single-poll failures and
 *  only flips false after FAILURE_THRESHOLD consecutive failures. */
export function useHealth(intervalMs = 5000): HealthInfo {
  const [info, setInfo] = useState<HealthInfo>({ vllmOk: false, gpuOk: false, model: null, experiment: null })
  const failures = useRef(0)

  useEffect(() => {
    let alive = true

    const poll = async () => {
      try {
        const res = await fetch('/api/health')
        if (!res.ok) throw new Error(String(res.status))
        const d = await res.json()
        if (!alive) return
        const vllmReachable = d?.checks?.vllm?.status === 'ok'
        if (vllmReachable) failures.current = 0
        else failures.current += 1
        setInfo({
          vllmOk: failures.current < FAILURE_THRESHOLD,
          gpuOk: d?.checks?.gpu_agent?.status === 'ok',
          model: d?.summary?.model_name ?? null,
          experiment: (d?.summary?.experiment as ActiveExperiment | null) ?? null,
        })
      } catch {
        if (!alive) return
        failures.current += 1
        // Keep the last-known model + experiment; only the reachability flag debounces.
        setInfo((prev) => ({
          vllmOk: failures.current < FAILURE_THRESHOLD,
          gpuOk: false,
          model: prev.model,
          experiment: prev.experiment,
        }))
      }
    }

    poll()
    const id = setInterval(poll, intervalMs)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [intervalMs])

  return info
}
