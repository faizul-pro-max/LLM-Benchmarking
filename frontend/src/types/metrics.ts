// Observer agent GET /kv_cache — see KV_CACHE_API_CONTRACT.md §2/§4. Render a
// dash/loading state for any null field rather than treating it as an error —
// the agent still returns 200 while vLLM is starting or its log format wasn't
// recognised for one of the two independent capacity/usage sources.
export interface KvCacheUsage {
  total_tokens: number | null
  block_size: number | null
  total_gb: number | null
  usage_percent: number | null
  used_tokens: number | null
  free_tokens: number | null
  used_gb: number | null
  free_gb: number | null
}

export interface MetricsSnapshot {
  ts: number
  /** Optional chat session tag — present once the backend persists per-session
   *  snapshots. Used to scope charts to the active chat session. */
  session_id?: string
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
  /** Capacity-aware KV cache reading from the observer agent — absent when the
   *  agent isn't configured or doesn't serve /kv_cache yet. */
  kv_cache?: KvCacheUsage
}

export type RequestState = 'queued' | 'prefilling' | 'decoding' | 'done' | 'error'
export type RequestCategory = 'random' | 'shared_prefix' | 'exact_repeat'
export type RequestPhase = 'warmup' | 'benchmark'

export interface RequestResult {
  id: string
  /** 1-based, monotonically increasing per run — the authoritative "Req #"
   *  to display (matches the per-run debug log's `req=` tag on the backend). */
  seq?: number
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

/** Emitted by the load generator's own concurrency limiter while a run's
 *  warmup/benchmark loop is active. Scoped to the current run (unlike
 *  MetricsSnapshot's requests_running/requests_waiting, which are vLLM's
 *  server-wide Prometheus gauges) and phase-aware. */
export interface SchedulerUpdate {
  runId: string
  phase: 'warmup' | 'benchmark'
  running: number
  waiting: number
  concurrency: number
}

export interface RequestUpdate {
  id: string
  seq?: number
  state: RequestState
  prompt_text?: string
  prompt_id?: string
  category?: RequestCategory
  ttft_ms?: number
  prefill_ms?: number
  token_count?: number
  tokens_text?: string
  tpot_ms?: number
  total_ms?: number
  finish_reason?: string
  error?: string
}
