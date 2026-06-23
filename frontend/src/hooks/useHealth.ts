import { useEffect, useState } from 'react'

export interface HealthInfo {
  vllmOk: boolean
  gpuOk: boolean
  model: string | null
}

/** Polls /api/health so the UI knows when a GPU instance + model are connected.
 *  vllmOk drives whether the Chat menu appears in the header. */
export function useHealth(intervalMs = 5000): HealthInfo {
  const [info, setInfo] = useState<HealthInfo>({ vllmOk: false, gpuOk: false, model: null })

  useEffect(() => {
    let alive = true

    const poll = async () => {
      try {
        const res = await fetch('/api/health')
        if (!res.ok) throw new Error(String(res.status))
        const d = await res.json()
        if (!alive) return
        setInfo({
          vllmOk: d?.checks?.vllm?.status === 'ok',
          gpuOk: d?.checks?.gpu_agent?.status === 'ok',
          model: d?.summary?.model_name ?? null,
        })
      } catch {
        if (alive) setInfo({ vllmOk: false, gpuOk: false, model: null })
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
