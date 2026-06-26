import { create } from 'zustand'
import type { MetricsSnapshot } from '@/types/metrics'

const MAX_SNAPSHOTS = 120

interface MetricsStore {
  snapshots: MetricsSnapshot[]
  latest: MetricsSnapshot | null
  /** Active chat session the charts are scoped to, or null (benchmark / all). */
  session: string | null
  addSnapshot: (s: MetricsSnapshot) => void
  /** Set the active chat session. Clearing the buffer on a NEW session is the
   *  primary scoping mechanism; when set, snapshots tagged with a different
   *  session_id are also filtered out (once the backend tags them). */
  setSession: (id: string | null) => void
  clear: () => void
}

export const useMetricsStore = create<MetricsStore>((set) => ({
  snapshots: [],
  latest: null,
  session: null,
  addSnapshot: (s) =>
    set((state) => {
      // When scoped to a chat session, drop snapshots that the backend tagged
      // with a different session. Untagged snapshots always pass through.
      if (state.session != null && s.session_id != null && s.session_id !== state.session) {
        return state
      }
      const next = state.snapshots.length >= MAX_SNAPSHOTS
        ? [...state.snapshots.slice(1), s]
        : [...state.snapshots, s]
      return { snapshots: next, latest: s }
    }),
  setSession: (id) => set({ session: id }),
  clear: () => set({ snapshots: [], latest: null }),
}))
