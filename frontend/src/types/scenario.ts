/**
 * Scenario Controller types — mirror the backend proxy REST contract under
 * `/api/controller/*`. The controller runs on the GPU box, lists/switches
 * inference scenarios (vLLM/SGLang launch configs) and holds a benchmark lock.
 *
 * All requests are plain fetch to the proxy paths — the backend attaches the
 * controller key, so the frontend never sends auth headers.
 */

/** A single inference scenario the controller can switch to. */
export interface Scenario {
  name: string
  description?: string
  backend?: string
  model?: string
  summary?: string
  /** Full launch argv the controller would run for this scenario. */
  launch_command?: string[]
  /** Flag names the user is allowed to override before a switch. */
  tunable_flags?: string[]
  config?: Record<string, unknown>
}

/** The subset of scenario flags the UI knows how to render as inputs.
 *  Booleans → toggles; numbers/strings → text/number inputs. */
export type TunableFlag =
  | 'enable_prefix_caching'
  | 'enable_chunked_prefill'
  | 'speculative_model'
  | 'num_speculative_tokens'
  | 'max_num_seqs'
  | 'max_model_len'
  | 'gpu_memory_utilization'
  | 'quantization'
  | 'dtype'

/** How each tunable flag renders in the overrides form. */
export type TunableKind = 'boolean' | 'number' | 'string'

export const TUNABLE_FLAG_KINDS: Record<TunableFlag, TunableKind> = {
  enable_prefix_caching: 'boolean',
  enable_chunked_prefill: 'boolean',
  speculative_model: 'string',
  num_speculative_tokens: 'number',
  max_num_seqs: 'number',
  max_model_len: 'number',
  gpu_memory_utilization: 'number',
  quantization: 'string',
  dtype: 'string',
}

/** Human labels for the tunable flags shown in the overrides form. */
export const TUNABLE_FLAG_LABELS: Record<TunableFlag, string> = {
  enable_prefix_caching: 'Prefix caching',
  enable_chunked_prefill: 'Chunked prefill',
  speculative_model: 'Speculative model',
  num_speculative_tokens: 'Speculative tokens',
  max_num_seqs: 'Max num seqs',
  max_model_len: 'Max model len',
  gpu_memory_utilization: 'GPU memory utilization',
  quantization: 'Quantization',
  dtype: 'dtype',
}

export function isTunableFlag(name: string): name is TunableFlag {
  return name in TUNABLE_FLAG_KINDS
}

/** Active benchmark lock held by the controller while a run is in flight. */
export interface BenchmarkLock {
  id: string
  started_at: number
  last_heartbeat?: number
  label?: string
}

/** GET /api/controller/scenarios — the scenario catalog. */
export type ScenariosResponse =
  | { configured: false }
  | { configured: true; reachable: false; error?: string }
  | {
      configured?: true
      reachable?: true
      current: string
      scenarios: Scenario[]
      versions?: Record<string, string>
    }

/** Phases a switch job moves through (controller side). */
export type SwitchPhase =
  | 'validate'
  | 'teardown'
  | 'download'
  | 'start'
  | 'health'
  | 'warmup'
  | 'done'
  | 'failed'

export type SwitchState = 'switching' | 'done' | 'failed' | 'idle'

/** GET /api/controller/switch/status?id=<jobId> → { job: SwitchJob }. */
export interface SwitchJob {
  id: string
  state: SwitchState
  phase?: SwitchPhase
  message?: string
  from?: string
  to?: string
  error?: string | null
  rolled_back?: boolean
}

/** GET /api/controller/current — live controller status. */
export type CurrentStatus =
  | { configured: false }
  | { configured: true; reachable: false; error?: string }
  | {
      configured?: true
      reachable?: true
      scenario: string
      backend?: string
      summary?: string
      config?: Record<string, unknown>
      since?: number
      switching: boolean
      busy: boolean
      benchmark?: BenchmarkLock | null
      job?: SwitchJob | null
    }

/** POST /api/controller/run/scenario body. */
export interface RunScenarioRequest {
  scenario: string
  overrides?: Record<string, unknown>
  force?: boolean
}

/** POST /api/controller/run/scenario — discriminated result (always HTTP 200). */
export type RunScenarioResult =
  | { kind: 'ready'; scenario?: string; rerun: true }
  | { kind: 'switching'; job_id: string; scenario?: string }
  | { kind: 'busy'; benchmark_id?: string; message?: string }
  | { kind: 'switch_in_progress'; message?: string }
  | { kind: 'invalid'; message: string }

/** In-panel banner shown for busy / invalid / error / info states. */
export interface ScenarioBanner {
  kind: 'busy' | 'invalid' | 'error' | 'info'
  message: string
}

/** Friendly labels for switch phases (doc §4) — switches take 60–180s so the
 *  UI is indeterminate; these describe *what* the controller is doing. */
export const SWITCH_PHASE_LABELS: Record<SwitchPhase, string> = {
  validate: 'Validating scenario',
  teardown: 'Tearing down current server',
  download: 'Downloading model weights',
  start: 'Starting inference server',
  health: 'Waiting for health check',
  warmup: 'Warming up',
  done: 'Done',
  failed: 'Failed',
}

/** Ordered phases for a step/progress UI. Excludes terminal states. */
export const SWITCH_PHASE_ORDER: SwitchPhase[] = [
  'validate',
  'teardown',
  'download',
  'start',
  'health',
  'warmup',
]

export function switchPhaseLabel(phase?: SwitchPhase): string {
  return phase ? SWITCH_PHASE_LABELS[phase] : 'Working…'
}
