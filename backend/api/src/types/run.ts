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

/** Which prompt pool drives the run — orthogonal to `category` (which only
 *  ever governs the local/Sheets pool's prefix-cache-testing structure).
 *  'short'/'long' source from a HuggingFace dataset when one has been loaded
 *  (see hfDatasetLoader.ts), falling back to the local/Sheets pool otherwise.
 *  'qa' always sources multi-turn conversations from a HuggingFace dataset. */
export type Workload = 'short' | 'long' | 'qa'

/** Only meaningful when workload === 'qa'. 'sequential' runs each
 *  conversation's turns in order with real chat history (see
 *  loadGenerator.ts runQaConversations); 'flattened' bakes prior turns into
 *  independent prompts and reuses the existing single-turn engine. */
export type QaMode = 'sequential' | 'flattened'

export interface RunConfig {
  name: string
  concurrency: number
  category: RequestCategory
  promptCount: number
  /** Prompt source workload. Defaults to 'short'. */
  workload?: Workload
  /** Q&A execution mode. Only meaningful when workload === 'qa'. Defaults to 'sequential'. */
  qaMode?: QaMode
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
  /** Prompt source workload this request was drawn from. */
  workload?: Workload
  /** Multi-turn Q&A (workload === 'qa', sequential mode): id shared by every
   *  turn of the same conversation. Absent for short/long and for flattened
   *  qa mode (each turn is an independent request there). */
  conversation_id?: string
  /** 0-based position of this turn within its conversation. */
  turn_index?: number
}

export interface AggregatedResult {
  run_id: string
  /** Client-measured TTFT (t2 - t0) — includes network transit both ways. */
  ttft_p50_ms: number
  ttft_p90_ms: number
  ttft_p99_ms: number
  ttft_stddev_ms: number
  ttft_p50_random: number
  ttft_p50_shared_prefix: number
  ttft_p50_exact_repeat: number
  /** Median RTT to the vLLM server, probed once at run start (see networkProbe.ts).
   *  Null when vLLM isn't configured or every probe failed — in that case the
   *  ttft_*_no_network_ms fields below are also null. */
  network_rtt_ms: number | null
  /** ttft_p50/p90/p99_ms with network_rtt_ms subtracted per request — an estimate
   *  of server-only (compute) TTFT, not a direct vLLM-side measurement. */
  ttft_p50_no_network_ms: number | null
  ttft_p90_no_network_ms: number | null
  ttft_p99_no_network_ms: number | null
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
