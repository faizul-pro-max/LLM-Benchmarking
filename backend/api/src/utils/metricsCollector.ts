import { Server } from 'socket.io'
import { parseVllmMetrics } from './prometheusParser'
import { insertSnapshot, insertChatSnapshot } from '../db/queries/snapshots'
import type { MetricsSnapshot } from '../types/metrics'
import type { ServerToClientEvents, ClientToServerEvents } from '../types/socket'

const GPU_AGENT_URL     = process.env.GPU_AGENT_URL     ?? ''
const GPU_AGENT_API_KEY = process.env.GPU_AGENT_API_KEY ?? ''
const VLLM_URL          = process.env.VLLM_URL          ?? ''
const POLL_INTERVAL     = 500

let activeRunId: string | null = null
// Active chat session (mirrors activeRunId). When set, snapshots are tagged with
// session_id and persisted tied to the session.
let activeChatSessionId: string | null = null
let polling = false
let timer: ReturnType<typeof setInterval> | null = null

// State for deriving tokens/sec from the vllm:generation_tokens_total counter.
// prevGenTokens / prevGenTs hold the last poll's counter + wall-clock so we can
// compute a per-second rate from the delta. lastNonzeroTps + its timestamp let us
// briefly hold the last real throughput so short decode bursts (which can read 0
// on a given 500ms tick) don't flap the chart to zero.
let prevGenTokens: number | null = null
let prevGenTs = 0
let lastNonzeroTps = 0
let lastNonzeroTpsTs = 0
// How long to keep showing the last non-zero tok/s before decaying to 0 (ms).
const TPS_HOLD_MS = 1500

function mockSnapshot(): MetricsSnapshot {
  // Represent a believable IDLE GPU: a model is loaded (modest resident VRAM) but
  // no requests are in flight, so util/throughput sit near zero. Kept calm and
  // non-jittery so idle charts don't look misleadingly busy. gpu_name is clearly
  // marked as mock.
  return {
    ts: Date.now(),
    transport_ms: 15,
    gpu_util: 2,
    vram_used_mb: 16384,   // ~16 GB resident for a loaded-but-idle 7B model
    vram_total_mb: 81920,
    power_w: 60,           // near-idle draw
    temp_c: 38,
    gpu_name: 'Mock A100-SXM4-80GB (idle)',
    kv_cache_pct: 0,
    requests_running: 0,
    requests_waiting: 0,
    requests_swapped: 0,
    tokens_per_sec: 0,
    ttft_p50_ms: 0,
    ttft_p99_ms: 0,
  }
}

async function fetchWithTimeout(url: string, ms = 2000, headers?: Record<string, string>): Promise<Response> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fetch = require('node-fetch') as typeof import('node-fetch').default
  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { signal: ctrl.signal, headers }) as unknown as Response
  } finally {
    clearTimeout(id)
  }
}

// GPU agent requires an x-api-key header; vLLM /metrics does not
const agentHeaders = GPU_AGENT_API_KEY ? { 'x-api-key': GPU_AGENT_API_KEY } : undefined

async function collectSnapshot(): Promise<MetricsSnapshot> {
  if (!GPU_AGENT_URL) return mockSnapshot()

  const t0 = Date.now()
  const [gpuRes, vllmRes] = await Promise.allSettled([
    fetchWithTimeout(`${GPU_AGENT_URL}/gpu`, 2000, agentHeaders),
    fetchWithTimeout(`${VLLM_URL}/metrics`),
  ])

  let gpuData: Partial<MetricsSnapshot> = {}
  let vllmData: ReturnType<typeof parseVllmMetrics> = {
    kv_cache_pct: 0, requests_running: 0, requests_waiting: 0,
    requests_swapped: 0, tokens_per_sec: 0, generation_tokens_total: 0,
    ttft_p50_ms: 0, ttft_p99_ms: 0,
  }

  if (gpuRes.status === 'fulfilled' && gpuRes.value.ok) {
    const raw = await (gpuRes.value as unknown as { json(): Promise<unknown> }).json() as Record<string, unknown>
    const ts = typeof raw.ts === 'number' ? raw.ts * 1000 : Date.now()
    gpuData = {
      ts,
      transport_ms: Date.now() - ts,
      gpu_util: raw.gpu_util as number ?? 0,
      vram_used_mb: raw.vram_used_mb as number ?? 0,
      vram_total_mb: raw.vram_total_mb as number ?? 0,
      power_w: raw.power_w as number ?? 0,
      temp_c: raw.temp_c as number ?? 0,
      gpu_name: raw.gpu_name as string ?? '',
    }
  }

  if (vllmRes.status === 'fulfilled' && vllmRes.value.ok) {
    const text = await (vllmRes.value as unknown as { text(): Promise<string> }).text()
    vllmData = parseVllmMetrics(text)
  }

  // Derive tokens/sec from the generation_tokens_total counter delta between polls.
  // Robustness rules:
  //   - Counter reset (vLLM restart): new total < prev → don't emit a negative
  //     rate; reset the baseline and report 0 for this tick.
  //   - Real rate over actual elapsed time (not assumed 500ms — ticks can skew).
  //   - Short bursts: a single 500ms tick can land between counter increments and
  //     read 0. Hold the last non-zero rate for TPS_HOLD_MS so the chart doesn't
  //     flap to zero mid-decode, then decay cleanly to 0 once truly idle.
  const { generation_tokens_total, ...vllmRest } = vllmData
  const now = Date.now()
  let tokens_per_sec = 0
  if (prevGenTokens !== null && prevGenTs > 0) {
    if (generation_tokens_total < prevGenTokens) {
      // Counter reset — treat as a fresh baseline, emit 0 this tick.
      tokens_per_sec = 0
    } else {
      const dt = (now - prevGenTs) / 1000
      if (dt > 0) tokens_per_sec = (generation_tokens_total - prevGenTokens) / dt
    }
  }
  prevGenTokens = generation_tokens_total
  prevGenTs = now

  if (tokens_per_sec > 0) {
    lastNonzeroTps = tokens_per_sec
    lastNonzeroTpsTs = now
  } else if (lastNonzeroTpsTs > 0 && now - lastNonzeroTpsTs <= TPS_HOLD_MS) {
    // Within the hold window — surface the last real throughput instead of 0 so a
    // brief gap between counter increments doesn't read as "idle".
    tokens_per_sec = lastNonzeroTps
  }

  return {
    ts: gpuData.ts ?? t0,
    transport_ms: gpuData.transport_ms ?? Date.now() - t0,
    gpu_util: gpuData.gpu_util ?? 0,
    vram_used_mb: gpuData.vram_used_mb ?? 0,
    vram_total_mb: gpuData.vram_total_mb ?? 0,
    power_w: gpuData.power_w ?? 0,
    temp_c: gpuData.temp_c ?? 0,
    gpu_name: gpuData.gpu_name ?? '',
    ...vllmRest,
    tokens_per_sec: Math.round(tokens_per_sec),
  }
}

// Always-on metrics loop. Starts a single 500ms interval that ALWAYS emits a
// `metrics:snapshot` so the dashboard stays live even when no run is active.
// Snapshots are only persisted to SQLite while a run is active (activeRunId set).
// Idempotent: if the loop is already running, this is a no-op.
export function startMetricsLoop(io: Server<ClientToServerEvents, ServerToClientEvents>) {
  if (timer) return

  // Reset tokens/sec derivation state for a clean baseline.
  prevGenTokens = null
  prevGenTs = 0

  timer = setInterval(async () => {
    if (polling) return
    polling = true
    try {
      const snapshot = await collectSnapshot()
      // Tag the snapshot with the active chat session (if any) so the dashboard
      // can group live metrics by conversation.
      if (activeChatSessionId) snapshot.session_id = activeChatSessionId
      io.emit('metrics:snapshot', snapshot)
      // Persist: benchmark-run snapshots key on run_id; chat-session snapshots key
      // on chat_session_id (run_id NULL). A run takes precedence if both are set.
      if (activeRunId) insertSnapshot(activeRunId, snapshot)
      else if (activeChatSessionId) insertChatSnapshot(activeChatSessionId, snapshot)
    } catch (err) {
      console.log({ msg: 'metrics poll error', err: String(err), ts: Date.now() })
    } finally {
      polling = false
    }
  }, POLL_INTERVAL)
}

// Marks a run as active so snapshots get persisted. Ensures the always-on loop
// is running but never creates a second interval.
export function startMetricsCollector(io: Server<ClientToServerEvents, ServerToClientEvents>, runId: string) {
  activeRunId = runId
  startMetricsLoop(io)
}

// Clears the active run so snapshots stop being persisted. The interval keeps
// running so live metrics continue to flow to the idle/chat dashboard.
export function stopMetricsCollector() {
  activeRunId = null
}

// Sets (or clears, with null) the active chat session. While set, emitted
// snapshots are tagged with session_id and persisted tied to the session.
// Mirrors the activeRunId pattern.
export function setChatSession(sessionId: string | null) {
  activeChatSessionId = sessionId
}

// Convenience clear, symmetric with setChatSession(null).
export function clearChatSession() {
  activeChatSessionId = null
}
