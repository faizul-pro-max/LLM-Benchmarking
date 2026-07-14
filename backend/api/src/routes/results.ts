import { Router } from 'express'
import db from '../db/connection'
import { getRequestsByRun } from '../db/queries/requests'
import { getSnapshotsByRun } from '../db/queries/snapshots'

const router = Router()

router.get('/:runId', (req, res) => {
  const row = db.prepare(`SELECT * FROM aggregated_results WHERE run_id = ?`).get(req.params.runId)
  if (!row) { res.status(404).json({ error: 'not found' }); return }

  const run: any = db.prepare(`SELECT id, started_at, ended_at FROM runs WHERE id = ?`).get(req.params.runId)
  const totalTokens = db.prepare(`
    SELECT COALESCE(SUM(token_count), 0) as total FROM requests
    WHERE run_id = ? AND phase = 'benchmark'
  `).get(req.params.runId) as { total: number }

  res.json({
    ...row,
    started_at: run?.started_at,
    ended_at: run?.ended_at,
    total_tokens_generated: totalTokens?.total ?? 0,
  })
})

router.get('/:runId/requests', (req, res) => {
  res.json(getRequestsByRun(req.params.runId))
})

router.get('/:runId/snapshots', (req, res) => {
  res.json(getSnapshotsByRun(req.params.runId))
})

router.get('/:runId/export', (req, res) => {
  const run      = db.prepare(`SELECT * FROM runs WHERE id = ?`).get(req.params.runId)
  const result   = db.prepare(`SELECT * FROM aggregated_results WHERE run_id = ?`).get(req.params.runId)
  const requests = getRequestsByRun(req.params.runId)
  const snapshots = getSnapshotsByRun(req.params.runId)

  if (!run) { res.status(404).json({ error: 'not found' }); return }

  res.setHeader('Content-Disposition', `attachment; filename="${req.params.runId}.json"`)
  res.json({ run, result, requests, snapshots })
})

export default router
