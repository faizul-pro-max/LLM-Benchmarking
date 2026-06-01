import type { RequestResult } from '../types/run'

const STABILITY_WINDOW  = 3
const STABILITY_THRESHOLD = 0.20

export function isWarm(results: RequestResult[]): boolean {
  if (results.length < STABILITY_WINDOW) return false
  const last = results.slice(-STABILITY_WINDOW).map((r) => r.ttft_ms ?? Infinity)
  const mean = last.reduce((s, v) => s + v, 0) / last.length
  return last.every((v) => Math.abs(v - mean) / mean <= STABILITY_THRESHOLD)
}

export function warmupSummary(results: RequestResult[]) {
  const ttfts = results.map((r) => r.ttft_ms ?? 0).filter(Boolean)
  return {
    count: results.length,
    warm: isWarm(results),
    ttft_last3_avg: ttfts.slice(-3).reduce((s, v) => s + v, 0) / Math.min(3, ttfts.length),
  }
}
