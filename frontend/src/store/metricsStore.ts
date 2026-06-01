import { create } from 'zustand'
import type { MetricsSnapshot } from '@/types/metrics'

const MAX_SNAPSHOTS = 120

interface MetricsStore {
  snapshots: MetricsSnapshot[]
  latest: MetricsSnapshot | null
  addSnapshot: (s: MetricsSnapshot) => void
  clear: () => void
}

export const useMetricsStore = create<MetricsStore>((set) => ({
  snapshots: [],
  latest: null,
  addSnapshot: (s) =>
    set((state) => {
      const next = state.snapshots.length >= MAX_SNAPSHOTS
        ? [...state.snapshots.slice(1), s]
        : [...state.snapshots, s]
      return { snapshots: next, latest: s }
    }),
  clear: () => set({ snapshots: [], latest: null }),
}))
