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

export interface MetricsSnapshot extends GpuMetrics, VllmMetrics {
  transport_ms: number
  // Set while a chat session is active so the dashboard + persistence can group
  // snapshots by conversation. Absent for idle/benchmark-run snapshots.
  session_id?: string
}
