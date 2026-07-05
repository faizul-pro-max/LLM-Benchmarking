// Scenario Controller client (:9200) — see FRONTEND_INTEGRATION.md.
//
// The controller lists/switches inference scenarios and holds the benchmark lock.
// One secret secures the controller, the GPU agent, and vLLM (doc §1), so the
// controller's `x-api-key` reuses GPU_AGENT_API_KEY unless overridden. All calls
// are best-effort and time-bounded; callers must tolerate `configured === false`.

// ---------- types ----------

export interface ScenarioSummary {
  name: string
  description?: string
  backend?: string
  model?: string
  summary?: string
  launch_command?: string[]
  tunable_flags?: string[]
  config?: Record<string, unknown>
}

export interface ScenarioList {
  current: string
  scenarios: ScenarioSummary[]
  versions?: Record<string, string>
}

export interface BenchmarkLock {
  id: string
  started_at: number
  last_heartbeat?: number
  label?: string
}

export interface CurrentStatus {
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

export interface SwitchJob {
  id: string
  state: 'switching' | 'done' | 'failed' | 'idle'
  phase?: 'validate' | 'teardown' | 'download' | 'start' | 'health' | 'warmup' | 'done' | 'failed'
  message?: string
  from?: string
  to?: string
  started_at?: number
  finished_at?: number | null
  error?: string | null
  rolled_back?: boolean
  timings?: Record<string, number>
}

/** Discriminated result of POST /run/scenario, mirroring the controller's 4 cases. */
export type RunScenarioResult =
  | { kind: 'ready'; scenario?: string; rerun: true }
  | { kind: 'switching'; job_id: string; scenario?: string }
  | { kind: 'busy'; benchmark_id?: string; message?: string }
  | { kind: 'switch_in_progress'; message?: string }
  | { kind: 'invalid'; message: string }

export interface ControllerError {
  configured: boolean
  reachable: boolean
  error?: string
}

// ---------- config ----------

function controllerUrl(): string {
  return process.env.GPU_CONTROLLER_URL ?? ''
}

function controllerKey(): string {
  // Doc §1: the controller shares the agent's x-api-key. Allow an explicit
  // override for boxes that separate them.
  return process.env.GPU_CONTROLLER_API_KEY ?? process.env.GPU_AGENT_API_KEY ?? ''
}

export function isControllerConfigured(): boolean {
  return Boolean(controllerUrl())
}

// ---------- transport ----------

function authHeaders(json = false): Record<string, string> {
  const h: Record<string, string> = {}
  const key = controllerKey()
  if (key) h['x-api-key'] = key
  if (json) h['content-type'] = 'application/json'
  return h
}

interface RequestOpts {
  method?: 'GET' | 'POST'
  body?: unknown
  timeoutMs?: number
}

/** Raw controller request. Returns the parsed JSON body and HTTP status, or
 *  throws on a network/timeout failure (caller decides how to surface it). */
async function request<T = unknown>(
  path: string,
  { method = 'GET', body, timeoutMs = 5000 }: RequestOpts = {},
): Promise<{ status: number; data: T }> {
  const base = controllerUrl()
  if (!base) throw new Error('controller not configured')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fetch = require('node-fetch') as typeof import('node-fetch').default
  const res = await fetch(`${base}${path}`, {
    method,
    headers: authHeaders(body !== undefined),
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  })
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    data = null
  }
  return { status: res.status, data: data as T }
}

// ---------- endpoints ----------

export async function getScenarios(): Promise<ScenarioList> {
  const { data } = await request<ScenarioList>('/scenarios')
  return data
}

export async function getCurrent(): Promise<CurrentStatus> {
  const { data } = await request<CurrentStatus>('/current')
  return data
}

export async function getControllerHealth(): Promise<{
  status: string
  scenario?: string
  switching?: boolean
  busy?: boolean
  ts?: number
}> {
  const { data } = await request('/health', { timeoutMs: 2500 })
  return data as { status: string }
}

export async function runScenario(
  scenario: string,
  overrides?: Record<string, unknown>,
  force?: boolean,
): Promise<RunScenarioResult> {
  const { status, data } = await request<Record<string, unknown>>('/run/scenario', {
    method: 'POST',
    body: { scenario, overrides, force: force ?? false },
    timeoutMs: 8000,
  })

  if (status === 200) {
    return { kind: 'ready', scenario: (data.scenario as string) ?? scenario, rerun: true }
  }
  if (status === 202) {
    return { kind: 'switching', job_id: String(data.job_id), scenario: (data.scenario as string) ?? scenario }
  }
  if (status === 409) {
    const detail = (data.detail ?? {}) as Record<string, unknown>
    if (detail.state === 'switching') {
      return { kind: 'switch_in_progress', message: (detail.message as string) ?? 'A switch is already running.' }
    }
    return {
      kind: 'busy',
      benchmark_id: detail.benchmark_id as string | undefined,
      message: (detail.message as string) ?? 'A benchmark is in progress.',
    }
  }
  // 400 (or anything else) — surface the message.
  const detail = data.detail
  const message = typeof detail === 'string' ? detail : `Scenario request failed (status ${status})`
  return { kind: 'invalid', message }
}

export async function getSwitchStatus(jobId: string): Promise<SwitchJob> {
  const { data } = await request<{ job: SwitchJob }>(`/switch/status?id=${encodeURIComponent(jobId)}`)
  return data.job
}

export async function benchmarkStart(label: string): Promise<BenchmarkLock> {
  const { data } = await request<BenchmarkLock>('/benchmark/start', { method: 'POST', body: { label } })
  return data
}

export async function benchmarkHeartbeat(benchmarkId: string): Promise<boolean> {
  const { status } = await request('/benchmark/heartbeat', { method: 'POST', body: { benchmark_id: benchmarkId } })
  return status === 200
}

export async function benchmarkEnd(benchmarkId: string): Promise<boolean> {
  const { status } = await request('/benchmark/end', { method: 'POST', body: { benchmark_id: benchmarkId } })
  return status === 200
}
