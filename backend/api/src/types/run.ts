export type RunPhase = 'pending' | 'warmup' | 'benchmarking' | 'complete' | 'stopped' | 'error'
export type RequestState = 'queued' | 'prefilling' | 'decoding' | 'done' | 'error'
export type RequestCategory = 'random' | 'shared_prefix' | 'exact_repeat'

/** LLM server config snapshotted at run start (best-effort). Persisted inside
 *  runs.config JSON as `server`, so a past benchmark records which server it
 *  ran against (model, vLLM version, GPU, key runtime flags). */
export interface ServerConfigSnapshot {
  model_name?: string | null
  vllm_url?: string | null
  gpu_agent_url?: string | null
  vllm_version?: string | null
  served_model_id?: string | null
  max_model_len?: number | null
  gpu_name?: string | null
  vram_total_mb?: number | null
  runtime?: {
    enable_prefix_caching?: boolean | null
    gpu_memory_utilization?: number | null
    block_size?: number | null
    kv_cache_dtype?: string | null
  }
}

export interface RunConfig {
  name: string
  concurrency: number
  category: RequestCategory
  promptCount: number
  /** Optional rich-text (HTML) notes attached when starting the run. */
  description?: string
  /** LLM server snapshot recorded at run start. */
  server?: ServerConfigSnapshot
}

export interface RequestResult {
  id: string
  /** 1-based, monotonically increasing per run — matches the "Req #" shown in
   *  the UI and the per-run debug log's `req=` tag (see runLogger.ts). */
  seq?: number
  run_id: string
  run_number: number
  prompt_id: string
  category: RequestCategory
  phase: 'warmup' | 'benchmark'
  prompt_text: string
  t0?: number
  t1?: number
  t2?: number
  t3?: number
  ttft_ms?: number
  prefill_ms?: number
  decode_ms?: number
  total_ms?: number
  token_count: number
  tpot_ms?: number
  finish_reason?: string
  error?: string
}

export interface AggregatedResult {
  run_id: string
  ttft_p50_ms: number
  ttft_p90_ms: number
  ttft_p99_ms: number
  ttft_stddev_ms: number
  ttft_p50_random: number
  ttft_p50_shared_prefix: number
  ttft_p50_exact_repeat: number
  tpot_p50_ms: number
  tpot_p90_ms: number
  tokens_per_sec_avg: number
  tokens_per_sec_peak: number
  gpu_util_avg: number
  gpu_util_peak: number
  vram_peak_mb: number
  kv_cache_avg: number
  kv_cache_peak: number
  total_requests: number
  warmup_excluded: number
  run_count: number
}
