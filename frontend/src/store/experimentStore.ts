import { create } from 'zustand'
import type { Run, AggregatedResult, ComparisonRow } from '@/types/experiment'

interface ExperimentStore {
  experiments: Run[]
  results: Map<string, AggregatedResult>
  selectedIds: [string?, string?]
  comparison: ComparisonRow[] | null

  fetchExperiments: () => Promise<void>
  selectForComparison: (id: string) => void
  fetchComparison: () => Promise<void>
  setMockExperiments: (rows: ComparisonRow[]) => void
}

export const useExperimentStore = create<ExperimentStore>((set, get) => ({
  experiments: [],
  results: new Map(),
  selectedIds: [],
  comparison: null,

  fetchExperiments: async () => {
    try {
      const res = await fetch('/api/experiments')
      if (!res.ok) return
      const data: Run[] = await res.json()
      set({ experiments: data })
    } catch {
      // backend not available — ignore
    }
  },

  selectForComparison: (id) => {
    const [a, b] = get().selectedIds
    if (a === id || b === id) return
    set({ selectedIds: [a ?? id, a ? id : undefined] })
  },

  fetchComparison: async () => {
    const [a, b] = get().selectedIds
    if (!a || !b) return
    try {
      const res = await fetch(`/api/compare?a=${a}&b=${b}`)
      if (!res.ok) return
      const data: ComparisonRow[] = await res.json()
      set({ comparison: data })
    } catch {
      // backend not available
    }
  },

  setMockExperiments: (rows) => set({ comparison: rows }),
}))
