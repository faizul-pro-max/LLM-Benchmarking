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
  const workload = useRunStore((s) => s.workload)
  const qaMode = useRunStore((s) => s.qaMode)
  const description = useRunStore((s) => s.description)
  const summary = useRunStore((s) => s.summary)
  const { startRun, setConcurrency, setCategory, setPromptCount, setWorkload, setQaMode, setDescription } =
    useRunStore.getState()

  const start = async (name: string) => {
    const { description } = useRunStore.getState()
    const config: RunConfig = { name, concurrency, category, promptCount, workload, qaMode, description }
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
    // Don't reset here — the backend halts the pipeline, aggregates the partial
    // results, and emits run:complete. Resetting would discard that summary. The
    // incoming phase:change ('stopped'/'complete') + run:complete drive the UI.
    // Optimistically flip to 'stopping' so the UI reacts instantly on click —
    // the real phase:change event overwrites this once the backend actually
    // drains the pipeline.
    useRunStore.getState().setPhase('stopping')
    await fetch('/api/run/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId }),
    })
  }

  return {
    runId,
    phase,
    requests,
    warmupTtfts,
    concurrency,
    category,
    promptCount,
    workload,
    qaMode,
    description,
    summary,
    start,
    stop,
    setConcurrency,
    setCategory,
    setPromptCount,
    setWorkload,
    setQaMode,
    setDescription,
  }
}
