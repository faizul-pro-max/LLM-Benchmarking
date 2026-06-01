import db from '../connection'
import type { MetricsSnapshot } from '../../types/metrics'

export function insertSnapshot(runId: string, s: MetricsSnapshot) {
  db.prepare(`
    INSERT INTO metric_snapshots
      (run_id, ts, transport_ms, gpu_util, vram_used_mb, vram_total_mb,
       power_w, temp_c, gpu_name, kv_cache_pct, requests_running,
       requests_waiting, requests_swapped, tokens_per_sec, ttft_p50_ms, ttft_p99_ms)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    runId, s.ts, s.transport_ms, s.gpu_util, s.vram_used_mb, s.vram_total_mb,
    s.power_w, s.temp_c, s.gpu_name, s.kv_cache_pct, s.requests_running,
    s.requests_waiting, s.requests_swapped ?? 0, s.tokens_per_sec, s.ttft_p50_ms, s.ttft_p99_ms
  )
}

export function getSnapshotsByRun(runId: string) {
  return db.prepare(`SELECT * FROM metric_snapshots WHERE run_id = ? ORDER BY ts`).all(runId)
}
