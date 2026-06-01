import { create } from 'zustand'
import type { RequestResult, RequestUpdate } from '@/types/metrics'
import type { RunPhase, RunConfig, AggregatedResult, WarmupTtft } from '@/types/experiment'

interface RunStore {
  runId: string | null
  phase: RunPhase
  requests: Map<string, RequestResult>
  warmupTtfts: WarmupTtft[]
  concurrency: number
  category: 'random' | 'shared_prefix' | 'exact_repeat'
  promptCount: number
  summary: AggregatedResult | null

  startRun: (config: RunConfig & { runId: string }) => void
  updateRequest: (update: RequestUpdate) => void
  addWarmupTtft: (point: WarmupTtft) => void
  setPhase: (phase: RunPhase) => void
  completeRun: (summary: AggregatedResult) => void
  reset: () => void
  setConcurrency: (v: number) => void
  setCategory: (c: 'random' | 'shared_prefix' | 'exact_repeat') => void
  setPromptCount: (n: number) => void
}

export const useRunStore = create<RunStore>((set) => ({
  runId: null,
  phase: 'idle',
  requests: new Map(),
  warmupTtfts: [],
  concurrency: 10,
  category: 'random',
  promptCount: 100,
  summary: null,

  startRun: ({ runId, concurrency, category, promptCount }) =>
    set({
      runId,
      phase: 'pending',
      requests: new Map(),
      warmupTtfts: [],
      summary: null,
      concurrency,
      category,
      promptCount,
    }),

  updateRequest: (update) =>
    set((state) => {
      const next = new Map(state.requests)
      const existing = next.get(update.id)
      if (existing) {
        next.set(update.id, { ...existing, ...update })
      } else {
        next.set(update.id, {
          run_id: state.runId ?? '',
          prompt_id: update.id,
          category: state.category,
          phase: 'benchmark',
          prompt_text: '',
          ...update,
        })
      }
      return { requests: next }
    }),

  addWarmupTtft: (point) =>
    set((state) => ({ warmupTtfts: [...state.warmupTtfts, point] })),

  setPhase: (phase) => set({ phase }),

  completeRun: (summary) => set({ phase: 'complete', summary }),

  reset: () =>
    set({
      runId: null,
      phase: 'idle',
      requests: new Map(),
      warmupTtfts: [],
      summary: null,
    }),

  setConcurrency: (v) => set({ concurrency: v }),
  setCategory: (c) => set({ category: c }),
  setPromptCount: (n) => set({ promptCount: n }),
}))
