import { create } from 'zustand'
import type {
  Scenario,
  CurrentStatus,
  SwitchJob,
  ScenarioBanner,
} from '@/types/scenario'

interface ScenarioStore {
  /** Controller has a configured URL/key on the backend. */
  configured: boolean
  /** GPU box responded to the last catalog/status fetch. */
  reachable: boolean
  /** Scenario name the controller is currently serving. */
  current: string | null
  scenarios: Scenario[]
  versions: Record<string, string>
  /** Live status from /current (busy/switching/benchmark lock). */
  status: CurrentStatus | null
  /** Scenario the user has selected in the picker. */
  selectedScenario: string | null
  /** Only fields the user actually changed (subset of tunable_flags). */
  overrides: Record<string, unknown>
  /** Active switch job being polled, or null. */
  switchJob: SwitchJob | null
  /** Guard against overlapping run/switch requests. */
  running: boolean
  /** In-panel status banner, or null. */
  banner: ScenarioBanner | null

  setConfigured: (configured: boolean) => void
  setReachable: (reachable: boolean) => void
  setCatalog: (payload: {
    current: string
    scenarios: Scenario[]
    versions?: Record<string, string>
  }) => void
  setStatus: (status: CurrentStatus | null) => void
  setCurrent: (current: string | null) => void
  selectScenario: (name: string | null) => void
  setOverride: (field: string, value: unknown) => void
  clearOverride: (field: string) => void
  resetOverrides: () => void
  setSwitchJob: (job: SwitchJob | null) => void
  setRunning: (running: boolean) => void
  setBanner: (banner: ScenarioBanner | null) => void
}

export const useScenarioStore = create<ScenarioStore>((set) => ({
  configured: false,
  reachable: false,
  current: null,
  scenarios: [],
  versions: {},
  status: null,
  selectedScenario: null,
  overrides: {},
  switchJob: null,
  running: false,
  banner: null,

  setConfigured: (configured) => set({ configured }),
  setReachable: (reachable) => set({ reachable }),

  setCatalog: ({ current, scenarios, versions }) =>
    set((state) => ({
      configured: true,
      reachable: true,
      current,
      scenarios,
      versions: versions ?? {},
      // Default the selection to the current scenario on first load.
      selectedScenario: state.selectedScenario ?? current,
    })),

  setStatus: (status) => set({ status }),
  setCurrent: (current) => set({ current }),

  selectScenario: (name) =>
    set((state) =>
      state.selectedScenario === name
        ? {}
        : { selectedScenario: name, overrides: {} }
    ),

  setOverride: (field, value) =>
    set((state) => ({ overrides: { ...state.overrides, [field]: value } })),

  clearOverride: (field) =>
    set((state) => {
      if (!(field in state.overrides)) return {}
      const next = { ...state.overrides }
      delete next[field]
      return { overrides: next }
    }),

  resetOverrides: () => set({ overrides: {} }),
  setSwitchJob: (switchJob) => set({ switchJob }),
  setRunning: (running) => set({ running }),
  setBanner: (banner) => set({ banner }),
}))
