import { Router } from 'express'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { getIo } from '../server'
import { insertRun, updateRunPhase, getRunById } from '../db/queries/runs'
import { getCachedPrompts } from '../utils/sheetsLoader'
import { startMetricsCollector, stopMetricsCollector } from '../utils/metricsCollector'
import { runWarmup, runBenchmark } from '../utils/loadGenerator'
import { computeAggregatedResult, saveAggregatedResult } from '../utils/aggregator'

const router = Router()

// In-module guard: the pipeline runs in-process via setImmediate and shares a
// single global metrics collector, so only one run may be active at a time.
let runInProgress = false

const RunStartSchema = z.object({
  name: z.string().min(1),
  concurrency: z.number().int().min(1).max(100).default(10),
  category: z.enum(['random', 'shared_prefix', 'exact_repeat']).default('random'),
  promptCount: z.number().int().min(1).max(500).default(100),
})

router.post('/start', async (req, res) => {
  const parsed = RunStartSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }

  if (runInProgress) {
    res.status(409).json({ error: 'A benchmark run is already in progress. Stop it before starting another.' })
    return
  }

  const config = parsed.data
  const runId  = uuidv4()
  const io     = getIo()

  runInProgress = true
  insertRun(runId, config.name, config)
  res.json({ runId })

  // Run pipeline async (non-blocking)
  setImmediate(async () => {
    try {
      const prompts = getCachedPrompts().slice(0, config.promptCount)

      // Warmup
      updateRunPhase(runId, 'warmup')
      io.emit('phase:change', { phase: 'warmup', runId })
      startMetricsCollector(io, runId)
      await runWarmup(io, runId, prompts, config.concurrency)

      // 3 benchmark runs
      updateRunPhase(runId, 'benchmarking')
      io.emit('phase:change', { phase: 'benchmarking', runId })
      for (let i = 1; i <= 3; i++) {
        await runBenchmark(io, runId, prompts, config, i)
      }

      // Aggregate
      stopMetricsCollector()
      const summary = computeAggregatedResult(runId)
      saveAggregatedResult(summary)
      updateRunPhase(runId, 'complete', Date.now())
      io.emit('phase:change', { phase: 'complete', runId })
      io.emit('run:complete', { runId, summary })

      console.log({ msg: 'run complete', runId, ts: Date.now() })
    } catch (err) {
      stopMetricsCollector()
      updateRunPhase(runId, 'error', Date.now())
      io.emit('phase:change', { phase: 'error', runId })
      console.log({ msg: 'run error', runId, err: String(err), ts: Date.now() })
    } finally {
      runInProgress = false
    }
  })
})

router.post('/stop', (req, res) => {
  const { runId } = req.body as { runId: string }
  if (!runId) { res.status(400).json({ error: 'runId required' }); return }
  stopMetricsCollector()
  updateRunPhase(runId, 'stopped', Date.now())
  getIo().emit('phase:change', { phase: 'stopped', runId })
  runInProgress = false
  res.json({ ok: true })
})

router.get('/:id', (req, res) => {
  const run = getRunById(req.params.id)
  if (!run) { res.status(404).json({ error: 'not found' }); return }
  res.json(run)
})

export default router
