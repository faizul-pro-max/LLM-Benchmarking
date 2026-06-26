export type RunPhase = 'idle' | 'pending' | 'warmup' | 'benchmarking' | 'complete' | 'stopped' | 'error'

export interface RunConfig {
  name: string
  concurrency: number
  category: 'random' | 'shared_prefix' | 'exact_repeat'
  promptCount: number
}

export interface Run {
  id: string
  name: string
  config: string
  phase: RunPhase
  started_at: number | null
  ended_at: number | null
  created_at: number
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

export interface Experiment {
  run: Run
  result: AggregatedResult | null
}

export interface ComparisonRow {
  runId: string
  name: string
  isBaseline: boolean
  isActive: boolean
  ttft_p50_ms: number | null
  ttft_p90_ms: number | null
  ttft_p99_ms?: number | null
  tokens_per_sec_avg: number | null
  gpu_util_avg: number | null
  kv_cache_avg: number | null
  tpot_p50_ms: number | null
  pct_ttft_p50?: number
  pct_ttft_p90?: number
  pct_ttft_p99?: number
  pct_tps?: number
  pct_gpu?: number
  pct_kv?: number
  pct_tpot?: number
}

export interface WarmupTtft {
  req: number
  ttft_ms: number
}
