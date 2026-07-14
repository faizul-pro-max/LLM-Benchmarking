import db from '../db/connection'
import type { AggregatedResult } from '../types/run'

function pct(arr: number[], p: number): number {
  if (!arr.length) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)]
}

function stddev(arr: number[]): number {
  if (arr.length < 2) return 0
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length
  return Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length)
}

function avg(arr: number[]): number {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0
}

/** @param networkRttMs Median vLLM RTT probed at run start (see networkProbe.ts).
 *  Null when unavailable — the *_no_network_ms fields are then also null rather
 *  than silently computed against a zero baseline. */
export function computeAggregatedResult(runId: string, networkRttMs: number | null = null): AggregatedResult {
  const requests = db
    .prepare(`SELECT * FROM requests WHERE run_id = ? AND phase = 'benchmark'`)
    .all(runId) as Array<Record<string, number | string>>

  const snapshots = db
    .prepare(`SELECT * FROM metric_snapshots WHERE run_id = ?`)
    .all(runId) as Array<Record<string, number>>

  const ttfts      = requests.map((r) => r.ttft_ms as number).filter(Boolean)
  const tpots      = requests.map((r) => r.tpot_ms as number).filter(Boolean)
  const tpsValues  = snapshots.map((s) => s.tokens_per_sec)
  const gpuValues  = snapshots.map((s) => s.gpu_util)
  const vramValues = snapshots.map((s) => s.vram_used_mb)
  const kvValues   = snapshots.map((s) => s.kv_cache_pct)

  const byCategory = (cat: string) =>
    requests.filter((r) => r.category === cat).map((r) => r.ttft_ms as number).filter(Boolean)

  // Network-excluded TTFT: subtract the measured baseline RTT from each
  // request's client TTFT before taking percentiles, rather than subtracting
  // from the percentile after the fact — preserves the correct distribution
  // shape instead of just shifting a single summary number.
  const ttftsNoNetwork = networkRttMs != null
    ? ttfts.map((t) => Math.max(0, t - networkRttMs))
    : []

  return {
    run_id: runId,
    ttft_p50_ms: pct(ttfts, 50),
    ttft_p90_ms: pct(ttfts, 90),
    ttft_p99_ms: pct(ttfts, 99),
    ttft_stddev_ms: stddev(ttfts),
    ttft_p50_random:        pct(byCategory('random'), 50),
    ttft_p50_shared_prefix: pct(byCategory('shared_prefix'), 50),
    ttft_p50_exact_repeat:  pct(byCategory('exact_repeat'), 50),
    network_rtt_ms: networkRttMs,
    ttft_p50_no_network_ms: ttftsNoNetwork.length ? pct(ttftsNoNetwork, 50) : null,
    ttft_p90_no_network_ms: ttftsNoNetwork.length ? pct(ttftsNoNetwork, 90) : null,
    ttft_p99_no_network_ms: ttftsNoNetwork.length ? pct(ttftsNoNetwork, 99) : null,
    tpot_p50_ms: pct(tpots, 50),
    tpot_p90_ms: pct(tpots, 90),
    tokens_per_sec_avg:  avg(tpsValues),
    tokens_per_sec_peak: Math.max(0, ...tpsValues),
    gpu_util_avg:  avg(gpuValues),
    gpu_util_peak: Math.max(0, ...gpuValues),
    vram_peak_mb:  Math.max(0, ...vramValues),
    kv_cache_avg:  avg(kvValues),
    kv_cache_peak: Math.max(0, ...kvValues),
    total_requests: requests.length,
    warmup_excluded: 1,
    run_count: 3,
  }
}

export function saveAggregatedResult(result: AggregatedResult) {
  db.prepare(`
    INSERT OR REPLACE INTO aggregated_results VALUES (
      @run_id, @ttft_p50_ms, @ttft_p90_ms, @ttft_p99_ms, @ttft_stddev_ms,
      @ttft_p50_random, @ttft_p50_shared_prefix, @ttft_p50_exact_repeat,
      @tpot_p50_ms, @tpot_p90_ms, @tokens_per_sec_avg, @tokens_per_sec_peak,
      @gpu_util_avg, @gpu_util_peak, @vram_peak_mb, @kv_cache_avg, @kv_cache_peak,
      @total_requests, @warmup_excluded, @run_count,
      @network_rtt_ms, @ttft_p50_no_network_ms, @ttft_p90_no_network_ms, @ttft_p99_no_network_ms
    )
  `).run(result)
}
