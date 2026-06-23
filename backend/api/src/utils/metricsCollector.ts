import { Server } from 'socket.io'
import { parseVllmMetrics } from './prometheusParser'
import { insertSnapshot } from '../db/queries/snapshots'
import type { MetricsSnapshot } from '../types/metrics'
import type { ServerToClientEvents, ClientToServerEvents } from '../types/socket'

const GPU_AGENT_URL     = process.env.GPU_AGENT_URL     ?? ''
const GPU_AGENT_API_KEY = process.env.GPU_AGENT_API_KEY ?? ''
const VLLM_URL          = process.env.VLLM_URL          ?? ''
const POLL_INTERVAL     = 500

let activeRunId: string | null = null
let polling = false
let timer: ReturnType<typeof setInterval> | null = null

// State for deriving tokens/sec from the vllm:generation_tokens_total counter
let prevGenTokens: number | null = null
let prevGenTs = 0

function mockSnapshot(): MetricsSnapshot {
  const rand = (min: number, max: number) => Math.random() * (max - min) + min
  return {
    ts: Date.now(),
    transport_ms: Math.round(rand(10, 50)),
    gpu_util: Math.round(rand(85, 99)),
    vram_used_mb: Math.round(rand(68000, 74000)),
    vram_total_mb: 81920,
    power_w: Math.round(rand(300, 400)),
    temp_c: Math.round(rand(60, 75)),
    gpu_name: 'Mock A100-SXM4-80GB',
    kv_cache_pct: Math.round(rand(70, 95)),
    requests_running: Math.round(rand(5, 16)),
    requests_waiting: Math.round(rand(0, 8)),
    requests_swapped: 0,
    tokens_per_sec: Math.round(rand(1200, 1800)),
    ttft_p50_ms: Math.round(rand(250, 350)),
    ttft_p99_ms: Math.round(rand(400, 600)),
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

  // Derive tokens/sec from the generation_tokens_total counter delta between polls
  const { generation_tokens_total, ...vllmRest } = vllmData
  const now = Date.now()
  let tokens_per_sec = 0
  if (prevGenTokens !== null && generation_tokens_total >= prevGenTokens && prevGenTs > 0) {
    const dt = (now - prevGenTs) / 1000
    if (dt > 0) tokens_per_sec = (generation_tokens_total - prevGenTokens) / dt
  }
  prevGenTokens = generation_tokens_total
  prevGenTs = now

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

export function startMetricsCollector(io: Server<ClientToServerEvents, ServerToClientEvents>, runId: string) {
  activeRunId = runId
  prevGenTokens = null
  prevGenTs = 0

  timer = setInterval(async () => {
    if (polling) return
    polling = true
    try {
      const snapshot = await collectSnapshot()
      io.emit('metrics:snapshot', snapshot)
      if (activeRunId) insertSnapshot(activeRunId, snapshot)
    } catch (err) {
      console.log({ msg: 'metrics poll error', err: String(err), ts: Date.now() })
    } finally {
      polling = false
    }
  }, POLL_INTERVAL)
}

export function stopMetricsCollector() {
  activeRunId = null
  if (timer) { clearInterval(timer); timer = null }
}
