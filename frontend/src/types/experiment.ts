export type RunPhase =
  | 'idle'
  | 'pending'
  | 'warmup'
  | 'benchmarking'
  | 'stopping'
  | 'complete'
  | 'stopped'
  | 'error'

/** LLM server config snapshotted at run start (best-effort — fields may be null
 *  when the vLLM / GPU agent was unreachable). Stored inside runs.config JSON as
 *  `server`, so a past benchmark records exactly which server it ran against. */
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

/** Which prompt pool drives the run — orthogonal to `category` (which only
 *  ever governs the local/Sheets pool's prefix-cache-testing structure).
 *  'short'/'long' source from a HuggingFace dataset when one has been loaded,
 *  falling back to the local/Sheets pool otherwise. 'qa' always sources
 *  multi-turn conversations from HuggingFace. */
export type Workload = 'short' | 'long' | 'qa'

/** Only meaningful when workload === 'qa'. 'sequential' runs each
 *  conversation's turns in order with real chat history; 'flattened' bakes
 *  prior turns into independent prompts and reuses the single-turn engine. */
export type QaMode = 'sequential' | 'flattened'

export interface RunConfig {
  name: string
  concurrency: number
  category: 'random' | 'shared_prefix' | 'exact_repeat'
  promptCount: number
  /** Prompt source workload. Defaults to 'short'. */
  workload?: Workload
  /** Q&A execution mode. Only meaningful when workload === 'qa'. Defaults to 'sequential'. */
  qaMode?: QaMode
  /** Optional rich-text (HTML) notes the user attached when starting the run. */
  description?: string
  /** LLM server snapshot recorded at run start (present on stored runs). */
  server?: ServerConfigSnapshot
}

export interface Run {
  id: string
  name: string
  config: string
  /** Rich-text (HTML) description attached at run start. */
  description?: string | null
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
  network_rtt_ms?: number | null
  ttft_p50_no_network_ms?: number | null
  ttft_p90_no_network_ms?: number | null
  ttft_p99_no_network_ms?: number | null
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
  started_at?: number | null
  ended_at?: number | null
  total_tokens_generated?: number
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
