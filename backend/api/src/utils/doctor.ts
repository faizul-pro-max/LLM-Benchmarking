import { parseInfoLabels } from './prometheusParser'

// ---------- types ----------

export interface AppliedConfig {
  model_name: string
  vllm_url: string
  vllm_api_key: string // masked
  gpu_agent_url: string
  gpu_agent_api_key: string // masked
  redis_url: string // password masked
  sqlite_path: string
  port: number
  frontend_url: string
  defaults: {
    concurrency: number
    prompt_count: number
    warmup_request_count: number
  }
}

export interface ModelInfo {
  reachable: boolean
  vllm_version: string | null
  served_model_id: string | null
  max_model_len: number | null
  runtime: {
    enable_prefix_caching: boolean | null
    block_size: number | null
    gpu_memory_utilization: number | null
    num_gpu_blocks: number | null
    cache_dtype: string | null
    kv_cache_dtype: string | null
  }
  error?: string
}

export interface GpuInfo {
  reachable: boolean
  gpu_name: string | null
  gpu_index: number | null
  vram_total_mb: number | null
  vram_used_mb: number | null
  vram_free_mb: number | null
  power_w: number | null
  temp_c: number | null
  gpu_util: number | null
  mem_util: number | null
  hostname: string | null
  error?: string
}

export interface DoctorReport {
  status: 'ok' | 'degraded' | 'unconfigured'
  generated_at: number
  config: AppliedConfig
  model: ModelInfo
  gpu: GpuInfo
}

// ---------- helpers ----------

/** Mask a secret: keep first 3 chars for identification, hide the rest. */
function maskSecret(v: string | undefined): string {
  if (!v) return '(not set)'
  if (v.length <= 4) return '••••'
  return `${v.slice(0, 3)}${'•'.repeat(Math.max(4, v.length - 3))}`
}

/** Mask the password in a redis:// URL. */
function maskRedisUrl(url: string): string {
  try {
    const u = new URL(url)
    if (u.password) u.password = '••••'
    return u.toString()
  } catch {
    return url
  }
}

function fetchJson(url: string, ms: number, headers?: Record<string, string>) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fetch = require('node-fetch') as typeof import('node-fetch').default
  return fetch(url, { signal: AbortSignal.timeout(ms), headers })
}

function toBool(v: string | undefined): boolean | null {
  if (v == null) return null
  const lower = v.toLowerCase()
  if (lower === 'true' || lower === '1') return true
  if (lower === 'false' || lower === '0') return false
  return null
}

function toNum(v: string | undefined): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// ---------- collectors ----------

export function collectConfig(): AppliedConfig {
  return {
    model_name: process.env.MODEL_NAME ?? 'Qwen/Qwen2.5-7B-Instruct',
    vllm_url: process.env.VLLM_URL ?? '',
    vllm_api_key: maskSecret(process.env.VLLM_API_KEY),
    gpu_agent_url: process.env.GPU_AGENT_URL ?? '',
    gpu_agent_api_key: maskSecret(process.env.GPU_AGENT_API_KEY),
    redis_url: maskRedisUrl(process.env.REDIS_URL ?? 'redis://localhost:6379'),
    sqlite_path: process.env.SQLITE_PATH ?? './data/bench.db',
    port: parseInt(process.env.PORT ?? '3001', 10),
    frontend_url: process.env.FRONTEND_URL ?? 'http://localhost:7755',
    defaults: {
      concurrency: parseInt(process.env.DEFAULT_CONCURRENCY ?? '10', 10),
      prompt_count: parseInt(process.env.DEFAULT_PROMPT_COUNT ?? '100', 10),
      warmup_request_count: parseInt(process.env.WARMUP_REQUEST_COUNT ?? '20', 10),
    },
  }
}

const emptyModel = (): ModelInfo => ({
  reachable: false,
  vllm_version: null,
  served_model_id: null,
  max_model_len: null,
  runtime: {
    enable_prefix_caching: null,
    block_size: null,
    gpu_memory_utilization: null,
    num_gpu_blocks: null,
    cache_dtype: null,
    kv_cache_dtype: null,
  },
})

export async function collectModelInfo(): Promise<ModelInfo> {
  const VLLM_URL = process.env.VLLM_URL ?? ''
  const VLLM_API_KEY = process.env.VLLM_API_KEY ?? ''
  const info = emptyModel()
  if (!VLLM_URL) return info

  const headers = VLLM_API_KEY ? { Authorization: `Bearer ${VLLM_API_KEY}` } : undefined

  const [versionRes, modelsRes, metricsRes] = await Promise.allSettled([
    fetchJson(`${VLLM_URL}/version`, 2500, headers),
    fetchJson(`${VLLM_URL}/v1/models`, 2500, headers),
    fetchJson(`${VLLM_URL}/metrics`, 2500),
  ])

  try {
    if (versionRes.status === 'fulfilled' && versionRes.value.ok) {
      const v = (await versionRes.value.json()) as { version?: string }
      info.vllm_version = v.version ?? null
    }

    if (modelsRes.status === 'fulfilled' && modelsRes.value.ok) {
      const d = (await modelsRes.value.json()) as {
        data?: Array<{ id?: string; max_model_len?: number }>
      }
      const m = d.data?.[0]
      if (m) {
        info.reachable = true
        info.served_model_id = m.id ?? null
        info.max_model_len = m.max_model_len ?? null
      }
    }

    if (metricsRes.status === 'fulfilled' && metricsRes.value.ok) {
      const text = await metricsRes.value.text()
      const c = parseInfoLabels(text, 'vllm:cache_config_info')
      info.runtime = {
        enable_prefix_caching: toBool(c.enable_prefix_caching),
        block_size: toNum(c.block_size),
        gpu_memory_utilization: toNum(c.gpu_memory_utilization),
        num_gpu_blocks: toNum(c.num_gpu_blocks),
        cache_dtype: c.cache_dtype ?? null,
        kv_cache_dtype: c.kv_cache_dtype ?? c.cache_dtype ?? null,
      }
      if (info.served_model_id || info.vllm_version) info.reachable = true
    }
  } catch (err) {
    info.error = String(err)
  }

  return info
}

const emptyGpu = (): GpuInfo => ({
  reachable: false,
  gpu_name: null,
  gpu_index: null,
  vram_total_mb: null,
  vram_used_mb: null,
  vram_free_mb: null,
  power_w: null,
  temp_c: null,
  gpu_util: null,
  mem_util: null,
  hostname: null,
})

export async function collectGpuInfo(): Promise<GpuInfo> {
  const GPU_AGENT_URL = process.env.GPU_AGENT_URL ?? ''
  const GPU_AGENT_API_KEY = process.env.GPU_AGENT_API_KEY ?? ''
  const info = emptyGpu()
  if (!GPU_AGENT_URL) return info

  const headers = GPU_AGENT_API_KEY ? { 'x-api-key': GPU_AGENT_API_KEY } : undefined
  try {
    const res = await fetchJson(`${GPU_AGENT_URL}/gpu`, 2500, headers)
    if (!res.ok) {
      info.error = `status ${res.status}`
      return info
    }
    const d = (await res.json()) as Record<string, unknown>
    info.reachable = true
    info.gpu_name = (d.gpu_name as string) ?? null
    info.gpu_index = (d.gpu_index as number) ?? null
    info.vram_total_mb = (d.vram_total_mb as number) ?? null
    info.vram_used_mb = (d.vram_used_mb as number) ?? null
    info.vram_free_mb = (d.vram_free_mb as number) ?? null
    info.power_w = (d.power_w as number) ?? null
    info.temp_c = (d.temp_c as number) ?? null
    info.gpu_util = (d.gpu_util as number) ?? null
    info.mem_util = (d.mem_util as number) ?? null
    info.hostname = (d.hostname as string) ?? null
  } catch (err) {
    info.error = String(err)
  }
  return info
}

export async function buildDoctorReport(): Promise<DoctorReport> {
  const config = collectConfig()
  const [model, gpu] = await Promise.all([collectModelInfo(), collectGpuInfo()])

  const configured = Boolean(config.vllm_url || config.gpu_agent_url)
  const status: DoctorReport['status'] = !configured
    ? 'unconfigured'
    : model.reachable && gpu.reachable
      ? 'ok'
      : 'degraded'

  return { status, generated_at: Date.now(), config, model, gpu }
}
