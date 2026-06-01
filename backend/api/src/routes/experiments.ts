import { Router } from 'express'
import db from '../db/connection'

const router = Router()

router.get('/', (_req, res) => {
  const runs = db.prepare(`SELECT * FROM runs ORDER BY created_at DESC`).all()
  res.json(runs)
})

router.get('/compare', (req, res) => {
  const { a, b } = req.query as { a?: string; b?: string }
  if (!a || !b) { res.status(400).json({ error: 'a and b runIds required' }); return }

  const fetchResult = (id: string) =>
    db.prepare(`
      SELECT r.id, r.name, r.phase, ar.*
      FROM runs r LEFT JOIN aggregated_results ar ON ar.run_id = r.id
      WHERE r.id = ?
    `).get(id) as Record<string, number | string> | undefined

  const rowA = fetchResult(a)
  const rowB = fetchResult(b)
  if (!rowA || !rowB) { res.status(404).json({ error: 'one or both runs not found' }); return }

  function pctChange(base: number, next: number) {
    if (!base) return null
    return +((next - base) / base * 100).toFixed(1)
  }

  res.json([
    {
      runId: rowA.id,
      name: rowA.name,
      isBaseline: true,
      isActive: rowA.phase === 'benchmarking',
      ttft_p50_ms: rowA.ttft_p50_ms ?? null,
      ttft_p90_ms: rowA.ttft_p90_ms ?? null,
      tokens_per_sec_avg: rowA.tokens_per_sec_avg ?? null,
      gpu_util_avg: rowA.gpu_util_avg ?? null,
      kv_cache_avg: rowA.kv_cache_avg ?? null,
      tpot_p50_ms: rowA.tpot_p50_ms ?? null,
    },
    {
      runId: rowB.id,
      name: rowB.name,
      isBaseline: false,
      isActive: rowB.phase === 'benchmarking',
      ttft_p50_ms: rowB.ttft_p50_ms ?? null,
      ttft_p90_ms: rowB.ttft_p90_ms ?? null,
      tokens_per_sec_avg: rowB.tokens_per_sec_avg ?? null,
      gpu_util_avg: rowB.gpu_util_avg ?? null,
      kv_cache_avg: rowB.kv_cache_avg ?? null,
      tpot_p50_ms: rowB.tpot_p50_ms ?? null,
      pct_ttft_p50: pctChange(rowA.ttft_p50_ms as number, rowB.ttft_p50_ms as number),
      pct_ttft_p90: pctChange(rowA.ttft_p90_ms as number, rowB.ttft_p90_ms as number),
      pct_tps: pctChange(rowA.tokens_per_sec_avg as number, rowB.tokens_per_sec_avg as number),
      pct_gpu: pctChange(rowA.gpu_util_avg as number, rowB.gpu_util_avg as number),
      pct_kv: pctChange(rowA.kv_cache_avg as number, rowB.kv_cache_avg as number),
    },
  ])
})

export default router
