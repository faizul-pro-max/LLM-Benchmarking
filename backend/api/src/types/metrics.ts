export interface GpuMetrics {
  ts: number
  gpu_util: number
  vram_used_mb: number
  vram_total_mb: number
  power_w: number
  temp_c: number
  gpu_name: string
}

export interface VllmMetrics {
  kv_cache_pct: number
  requests_running: number
  requests_waiting: number
  requests_swapped: number
  tokens_per_sec: number
  ttft_p50_ms: number
  ttft_p99_ms: number
}

// Observer agent GET /kv_cache — see KV_CACHE_API_CONTRACT.md §2/§4. All fields
// are independently nullable: capacity (total_*/block_size) and live usage
// (usage_percent + derived used_*/free_*) come from two separate vLLM log/metric
// sources that can each be absent without the other being an error.
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

export interface MetricsSnapshot extends GpuMetrics, VllmMetrics {
  transport_ms: number
  // Set while a chat session is active so the dashboard + persistence can group
  // snapshots by conversation. Absent for idle/benchmark-run snapshots.
  session_id?: string
  // Raw vLLM Prometheus text this snapshot was parsed from. Persisted to SQLite
  // for after-the-fact re-inspection, but stripped before emitting to clients to
  // keep the 500ms broadcast payload small.
  vllm_raw?: string
  // Capacity-aware KV cache reading from the observer agent's /kv_cache endpoint.
  // Absent when GPU_AGENT_URL isn't configured or the agent doesn't serve it yet.
  kv_cache?: KvCacheUsage
}
