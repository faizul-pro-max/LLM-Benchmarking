import { useRunStore } from '@/store/runStore'
import type { Socket } from 'socket.io-client'
import type { RunConfig } from '@/types/experiment'

export function useRun(_socket: Socket | null) {
  const runId = useRunStore((s) => s.runId)
  const phase = useRunStore((s) => s.phase)
  const requests = useRunStore((s) => s.requests)
  const warmupTtfts = useRunStore((s) => s.warmupTtfts)
  const concurrency = useRunStore((s) => s.concurrency)
  const category = useRunStore((s) => s.category)
  const promptCount = useRunStore((s) => s.promptCount)
  const summary = useRunStore((s) => s.summary)
  const { startRun, reset, setConcurrency, setCategory, setPromptCount } = useRunStore.getState()

  const start = async (name: string) => {
    const config: RunConfig = { name, concurrency, category, promptCount }
    // Backend has no run:start socket listener — the pipeline is a REST route.
    // Start via REST, then the socket streams phase/metrics/request updates.
    const res = await fetch('/api/run/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    if (!res.ok) return
    const { runId: id } = (await res.json()) as { runId: string }
    startRun({ ...config, runId: id })
  }

  const stop = async () => {
    if (!runId) return
    await fetch('/api/run/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId }),
    })
    reset()
  }

  return {
    runId,
    phase,
    requests,
    warmupTtfts,
    concurrency,
    category,
    promptCount,
    summary,
    start,
    stop,
    setConcurrency,
    setCategory,
    setPromptCount,
  }
}
