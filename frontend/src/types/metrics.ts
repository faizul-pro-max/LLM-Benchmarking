export interface MetricsSnapshot {
  ts: number
  transport_ms: number
  gpu_util: number
  vram_used_mb: number
  vram_total_mb: number
  power_w: number
  temp_c: number
  gpu_name: string
  kv_cache_pct: number
  requests_running: number
  requests_waiting: number
  tokens_per_sec: number
  ttft_p50_ms: number
  ttft_p99_ms: number
}

export type RequestState = 'queued' | 'prefilling' | 'decoding' | 'done' | 'error'
export type RequestCategory = 'random' | 'shared_prefix' | 'exact_repeat'
export type RequestPhase = 'warmup' | 'benchmark'

export interface RequestResult {
  id: string
  run_id: string
  prompt_id: string
  category: RequestCategory
  phase: RequestPhase
  prompt_text: string
  state: RequestState
  ttft_ms?: number
  prefill_ms?: number
  decode_ms?: number
  total_ms?: number
  token_count?: number
  tokens_text?: string
  tpot_ms?: number
  finish_reason?: string
  error?: string
}

export interface RequestUpdate {
  id: string
  state: RequestState
  ttft_ms?: number
  prefill_ms?: number
  token_count?: number
  tokens_text?: string
  tpot_ms?: number
  total_ms?: number
  finish_reason?: string
  error?: string
}
