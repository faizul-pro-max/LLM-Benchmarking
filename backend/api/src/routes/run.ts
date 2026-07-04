import { Router } from 'express'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { getIo } from '../server'
import { insertRun, updateRunPhase, getRunById } from '../db/queries/runs'
import { selectPrompts } from '../utils/sheetsLoader'
import { startMetricsCollector, stopMetricsCollector } from '../utils/metricsCollector'
import { runWarmup, runBenchmark, cancelRun, resetRunCancel, isRunCancelled } from '../utils/loadGenerator'
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
      // Honour the selected category: filter the pool to that category and cycle
      // up to promptCount (exact_repeat → same prompt repeated, shared_prefix →
      // prompts sharing a long prefix, random → varied prompts).
      const prompts = selectPrompts(config.category, config.promptCount)

      // Warmup
      updateRunPhase(runId, 'warmup')
      io.emit('phase:change', { phase: 'warmup', runId })
      startMetricsCollector(io, runId)
      await runWarmup(io, runId, prompts, config.concurrency)

      // 3 benchmark runs — bail out early if Stop was pressed.
      if (!isRunCancelled()) {
        updateRunPhase(runId, 'benchmarking')
        io.emit('phase:change', { phase: 'benchmarking', runId })
        for (let i = 1; i <= 3 && !isRunCancelled(); i++) {
          await runBenchmark(io, runId, prompts, config, i)
        }
      }

      // Aggregate whatever was collected — this is the "collect" step for both a
      // natural finish and an early Stop (partial results are persisted per-request).
      stopMetricsCollector()
      const summary = computeAggregatedResult(runId)
      saveAggregatedResult(summary)
      const finalPhase = isRunCancelled() ? 'stopped' : 'complete'
      updateRunPhase(runId, finalPhase, Date.now())
      io.emit('phase:change', { phase: finalPhase, runId })
      io.emit('run:complete', { runId, summary })

      console.log({ msg: 'run finished', runId, phase: finalPhase, ts: Date.now() })
    } catch (err) {
      stopMetricsCollector()
      updateRunPhase(runId, 'error', Date.now())
      io.emit('phase:change', { phase: 'error', runId })
      console.log({ msg: 'run error', runId, err: String(err), ts: Date.now() })
    } finally {
      runInProgress = false
      resetRunCancel()
    }
  })
})

router.post('/stop', (req, res) => {
  const { runId } = req.body as { runId: string }
  if (!runId) { res.status(400).json({ error: 'runId required' }); return }
  // No active pipeline — nothing to cancel. Avoid setting the cancel flag here,
  // which (without a pipeline to reset it) would poison the next run.
  if (!runInProgress) { res.json({ ok: true, alreadyStopped: true }); return }
  // Stop metrics persistence immediately and signal the in-flight pipeline to halt
  // (aborts streaming requests). The pipeline then drains, aggregates the partial
  // results, and emits run:complete — so the collect step is driven from one place.
  stopMetricsCollector()
  cancelRun()
  res.json({ ok: true })
})

router.get('/:id', (req, res) => {
  const run = getRunById(req.params.id)
  if (!run) { res.status(404).json({ error: 'not found' }); return }
  res.json(run)
})

export default router
