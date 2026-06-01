import { useRunStore } from '@/store/runStore'
import type { Socket } from 'socket.io-client'
import type { RunConfig } from '@/types/experiment'

export function useRun(socket: Socket | null) {
  const runId = useRunStore((s) => s.runId)
  const phase = useRunStore((s) => s.phase)
  const requests = useRunStore((s) => s.requests)
  const warmupTtfts = useRunStore((s) => s.warmupTtfts)
  const concurrency = useRunStore((s) => s.concurrency)
  const category = useRunStore((s) => s.category)
  const promptCount = useRunStore((s) => s.promptCount)
  const summary = useRunStore((s) => s.summary)
  const { startRun, reset, setConcurrency, setCategory, setPromptCount } = useRunStore.getState()

  const start = (name: string) => {
    if (!socket) return
    const config: RunConfig = { name, concurrency, category, promptCount }
    socket.emit('run:start', config, (id: string) => {
      startRun({ ...config, runId: id })
    })
  }

  const stop = () => {
    if (!socket || !runId) return
    socket.emit('run:stop', { runId })
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
