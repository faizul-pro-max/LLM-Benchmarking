export type RunPhase = 'pending' | 'warmup' | 'benchmarking' | 'complete' | 'stopped' | 'error'
export type RequestState = 'queued' | 'prefilling' | 'decoding' | 'done' | 'error'
export type RequestCategory = 'random' | 'shared_prefix' | 'exact_repeat'

export interface RunConfig {
  name: string
  concurrency: number
  category: RequestCategory
  promptCount: number
}

export interface RequestResult {
  id: string
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
