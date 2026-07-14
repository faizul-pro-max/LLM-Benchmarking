import db from '../connection'
import { logKvCacheDebug } from '../../utils/kvCacheDebugLogger'
import type { MetricsSnapshot } from '../../types/metrics'

export function insertSnapshot(runId: string, s: MetricsSnapshot) {
  const kv = s.kv_cache
  const values = {
    runId, ts: s.ts, transport_ms: s.transport_ms, gpu_util: s.gpu_util, vram_used_mb: s.vram_used_mb, vram_total_mb: s.vram_total_mb,
    power_w: s.power_w, temp_c: s.temp_c, gpu_name: s.gpu_name, kv_cache_pct: s.kv_cache_pct, requests_running: s.requests_running,
    requests_waiting: s.requests_waiting, requests_swapped: s.requests_swapped ?? 0, tokens_per_sec: s.tokens_per_sec, ttft_p50_ms: s.ttft_p50_ms, ttft_p99_ms: s.ttft_p99_ms, vllm_raw: s.vllm_raw ?? null,
    kv_total_tokens: kv?.total_tokens ?? null, kv_block_size: kv?.block_size ?? null, kv_total_gb: kv?.total_gb ?? null,
    kv_used_tokens: kv?.used_tokens ?? null, kv_free_tokens: kv?.free_tokens ?? null, kv_used_gb: kv?.used_gb ?? null, kv_free_gb: kv?.free_gb ?? null
  }

  logKvCacheDebug('insert_db', runId, {
    table: 'metric_snapshots',
    action: 'INSERT',
    kv_cache_pct: s.kv_cache_pct,
    kv_cache_object: kv,
    all_values: values,
  })

  db.prepare(`
    INSERT INTO metric_snapshots
      (run_id, ts, transport_ms, gpu_util, vram_used_mb, vram_total_mb,
       power_w, temp_c, gpu_name, kv_cache_pct, requests_running,
       requests_waiting, requests_swapped, tokens_per_sec, ttft_p50_ms, ttft_p99_ms, vllm_raw,
       kv_total_tokens, kv_block_size, kv_total_gb, kv_used_tokens, kv_free_tokens, kv_used_gb, kv_free_gb)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    runId, s.ts, s.transport_ms, s.gpu_util, s.vram_used_mb, s.vram_total_mb,
    s.power_w, s.temp_c, s.gpu_name, s.kv_cache_pct, s.requests_running,
    s.requests_waiting, s.requests_swapped ?? 0, s.tokens_per_sec, s.ttft_p50_ms, s.ttft_p99_ms, s.vllm_raw ?? null,
    kv?.total_tokens ?? null, kv?.block_size ?? null, kv?.total_gb ?? null,
    kv?.used_tokens ?? null, kv?.free_tokens ?? null, kv?.used_gb ?? null, kv?.free_gb ?? null
  )
}

// Persist a snapshot tied to a chat session instead of a benchmark run.
// run_id is left NULL; chat_session_id carries the grouping key.
export function insertChatSnapshot(sessionId: string, s: MetricsSnapshot) {
  const kv = s.kv_cache
  logKvCacheDebug('insert_db', null, {
    table: 'metric_snapshots',
    action: 'INSERT (chat session)',
    chat_session_id: sessionId,
    kv_cache_pct: s.kv_cache_pct,
    kv_cache_object: kv,
  })

  db.prepare(`
    INSERT INTO metric_snapshots
      (run_id, chat_session_id, ts, transport_ms, gpu_util, vram_used_mb, vram_total_mb,
       power_w, temp_c, gpu_name, kv_cache_pct, requests_running,
       requests_waiting, requests_swapped, tokens_per_sec, ttft_p50_ms, ttft_p99_ms, vllm_raw,
       kv_total_tokens, kv_block_size, kv_total_gb, kv_used_tokens, kv_free_tokens, kv_used_gb, kv_free_gb)
    VALUES
      (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sessionId, s.ts, s.transport_ms, s.gpu_util, s.vram_used_mb, s.vram_total_mb,
    s.power_w, s.temp_c, s.gpu_name, s.kv_cache_pct, s.requests_running,
    s.requests_waiting, s.requests_swapped ?? 0, s.tokens_per_sec, s.ttft_p50_ms, s.ttft_p99_ms, s.vllm_raw ?? null,
    kv?.total_tokens ?? null, kv?.block_size ?? null, kv?.total_gb ?? null,
    kv?.used_tokens ?? null, kv?.free_tokens ?? null, kv?.used_gb ?? null, kv?.free_gb ?? null
  )
}

// Raw column shape read straight off metric_snapshots — the kv_* capacity
// columns are flat (SQLite has no nested types); reshapeKvCache() below folds
// them back into the nested `kv_cache` object the wire/MetricsSnapshot type uses.
interface RawSnapshotRow {
  kv_total_tokens: number | null
  kv_block_size: number | null
  kv_total_gb: number | null
  kv_used_tokens: number | null
  kv_free_tokens: number | null
  kv_used_gb: number | null
  kv_free_gb: number | null
  kv_cache_pct: number | null
  [key: string]: unknown
}

function reshapeKvCache<T extends RawSnapshotRow>(row: T) {
  const {
    kv_total_tokens, kv_block_size, kv_total_gb,
    kv_used_tokens, kv_free_tokens, kv_used_gb, kv_free_gb,
    ...rest
  } = row
  return {
    ...rest,
    kv_cache: {
      total_tokens: kv_total_tokens,
      block_size: kv_block_size,
      total_gb: kv_total_gb,
      usage_percent: row.kv_cache_pct,
      used_tokens: kv_used_tokens,
      free_tokens: kv_free_tokens,
      used_gb: kv_used_gb,
      free_gb: kv_free_gb,
    },
  }
}

export function getSnapshotsByRun(runId: string) {
  const rows = db.prepare(`SELECT * FROM metric_snapshots WHERE run_id = ? ORDER BY ts`).all(runId) as RawSnapshotRow[]
  return rows.map(reshapeKvCache)
}

export function getSnapshotsByChatSession(sessionId: string) {
  const rows = db.prepare(`SELECT * FROM metric_snapshots WHERE chat_session_id = ? ORDER BY ts`).all(sessionId) as RawSnapshotRow[]
  return rows.map(reshapeKvCache)
}
