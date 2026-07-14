import { Router } from 'express'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { getIo } from '../server'
import { insertRun, updateRunPhase, updateRunConfig, getRunById } from '../db/queries/runs'
import { selectPrompts } from '../utils/sheetsLoader'
import type { Prompt } from '../utils/sheetsLoader'
import { getCachedWorkloadPrompts, selectHfPrompts, selectConversations } from '../utils/hfDatasetLoader'
import type { Conversation } from '../utils/hfDatasetLoader'
import { startMetricsCollector, stopMetricsCollector } from '../utils/metricsCollector'
import { runWarmup, runBenchmark, runQaConversations, flattenConversations, cancelRun, resetRunCancel, isRunCancelled, clearMaxModelLenCache } from '../utils/loadGenerator'
import { computeAggregatedResult, saveAggregatedResult } from '../utils/aggregator'
import { collectConfig, buildDoctorReport } from '../utils/doctor'
import { measureNetworkRtt } from '../utils/networkProbe'
import { isControllerConfigured, benchmarkStart, benchmarkHeartbeat, benchmarkEnd } from '../utils/controllerClient'
import { startRunLog, stopRunLog, runLog } from '../utils/runLogger'
import type { RunConfig } from '../types/run'

const router = Router()

// In-module guard: the pipeline runs in-process via setImmediate and shares a
// single global metrics collector, so only one run may be active at a time.
let runInProgress = false

const RunStartSchema = z.object({
  name: z.string().min(1),
  concurrency: z.number().int().min(1).max(100).default(10),
  category: z.enum(['random', 'shared_prefix', 'exact_repeat']).default('random'),
  promptCount: z.number().int().min(1).max(500).default(100),
  // Which prompt pool drives the run — orthogonal to category (see types/run.ts).
  workload: z.enum(['short', 'long', 'qa']).default('short'),
  // Only meaningful when workload === 'qa'; ignored otherwise.
  qaMode: z.enum(['sequential', 'flattened']).default('sequential'),
  description: z.string().max(20000).optional(),
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

  // Build the full stored config, including the synchronous env-derived server
  // snapshot captured at run start. Async runtime/version/GPU fields are enriched
  // below (best-effort) via the doctor report before warmup begins.
  const cfg = collectConfig()
  const fullConfig: RunConfig = {
    name: config.name,
    concurrency: config.concurrency,
    category: config.category,
    promptCount: config.promptCount,
    workload: config.workload,
    qaMode: config.qaMode,
    description: config.description,
    server: {
      model_name: cfg.model_name,
      vllm_url: cfg.vllm_url,
      gpu_agent_url: cfg.gpu_agent_url,
      runtime: {},
    },
  }

  runInProgress = true
  insertRun(runId, config.name, fullConfig, config.description)
  startRunLog(runId, config.name)
  runLog.info(undefined, `run start name="${config.name}" concurrency=${config.concurrency} category=${config.category} promptCount=${config.promptCount} workload=${config.workload}${config.workload === 'qa' ? ` qaMode=${config.qaMode}` : ''}`)
  res.json({ runId })

  // Run pipeline async (non-blocking)
  setImmediate(async () => {
    // Scenario Controller benchmark lock (best-effort, non-fatal): tell the
    // controller the box is busy for the whole run, heartbeat while it runs, and
    // release it in finally. Any controller failure is logged and ignored — it's
    // an observability lock, never a hard dependency of the benchmark.
    let benchmarkId: string | null = null
    let heartbeat: ReturnType<typeof setInterval> | null = null
    if (isControllerConfigured()) {
      try {
        const lock = await benchmarkStart(config.name)
        benchmarkId = lock?.id ?? null
        console.log({ msg: 'benchmark lock acquired', runId, benchmarkId, ts: Date.now() })
        if (benchmarkId) {
          heartbeat = setInterval(() => {
            if (!benchmarkId) return
            benchmarkHeartbeat(benchmarkId).catch((err) =>
              console.log({ msg: 'benchmark heartbeat failed', runId, benchmarkId, err: String(err), ts: Date.now() }),
            )
          }, 45000)
        }
      } catch (err) {
        console.log({ msg: 'benchmark lock skipped', runId, err: String(err), ts: Date.now() })
      }
    }

    try {
      // Honour the selected workload + category. workload picks which prompt
      // pool sources the run: 'short'/'long' use the HF-loaded dataset for that
      // workload if one has been loaded (see POST /api/datasets/load), falling
      // back to the local/Sheets pool (filtered by category, cycled up to
      // promptCount — exact_repeat → same prompt repeated, shared_prefix →
      // prompts sharing a long prefix, random → varied prompts) otherwise.
      // 'qa' always sources multi-turn conversations from HF (promptCount is
      // reinterpreted as "how many conversations"); category doesn't apply.
      let prompts: Prompt[] = []
      let conversations: Conversation[] = []
      if (config.workload === 'qa') {
        conversations = selectConversations(config.promptCount)
        if (conversations.length === 0) {
          throw new Error('No Q&A conversations loaded — POST /api/datasets/load {"workload":"qa"} before starting a Q&A run')
        }
        // Warmup always uses the flattened view regardless of qaMode — priming
        // the KV cache doesn't need real multi-turn chat history.
        prompts = flattenConversations(conversations)
      } else {
        const hfPrompts = getCachedWorkloadPrompts(config.workload)
        prompts = hfPrompts && hfPrompts.length > 0
          ? selectHfPrompts(config.workload, config.promptCount)
          : selectPrompts(config.category, config.promptCount)
      }

      // Best-effort: enrich the server snapshot with live vLLM/GPU details before
      // warmup. A doctor failure or timeout must NEVER abort the benchmark, so the
      // whole block is guarded and merely logs on failure.
      try {
        const report = await Promise.race([
          buildDoctorReport(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('doctor timeout')), 4000)),
        ])
        if (fullConfig.server) {
          fullConfig.server.vllm_version   = report.model.vllm_version
          fullConfig.server.served_model_id = report.model.served_model_id
          fullConfig.server.max_model_len  = report.model.max_model_len
          fullConfig.server.gpu_name       = report.gpu.gpu_name
          fullConfig.server.vram_total_mb  = report.gpu.vram_total_mb
          fullConfig.server.runtime = {
            enable_prefix_caching: report.model.runtime.enable_prefix_caching,
            gpu_memory_utilization: report.model.runtime.gpu_memory_utilization,
            block_size: report.model.runtime.block_size,
            kv_cache_dtype: report.model.runtime.kv_cache_dtype,
          }
        }
        updateRunConfig(runId, fullConfig)
        console.log({ msg: 'run server snapshot enriched', runId, ts: Date.now() })
      } catch (err) {
        console.log({ msg: 'run server snapshot enrichment skipped', runId, err: String(err), ts: Date.now() })
      }

      // Network RTT baseline (best-effort, non-fatal): a handful of lightweight
      // probes to vLLM before warmup starts, used later to derive a
      // network-excluded TTFT alongside the client-measured (network-included)
      // one — see aggregator.ts computeAggregatedResult.
      let networkRttMs: number | null = null
      try {
        networkRttMs = await measureNetworkRtt()
        runLog.info(undefined, `network RTT probe: ${networkRttMs != null ? `${networkRttMs}ms` : 'unavailable'}`)
      } catch (err) {
        console.log({ msg: 'network RTT probe failed', runId, err: String(err), ts: Date.now() })
      }

      // Warmup
      updateRunPhase(runId, 'warmup')
      io.emit('phase:change', { phase: 'warmup', runId, network_rtt_ms: networkRttMs })
      runLog.info(undefined, `warmup phase started (${process.env.WARMUP_REQUEST_COUNT ?? '20'} requests)`)
      startMetricsCollector(io, runId)
      await runWarmup(io, runId, prompts, config.concurrency, fullConfig.server?.max_model_len, config.workload)

      // 3 benchmark runs — bail out early if Stop was pressed.
      if (!isRunCancelled()) {
        updateRunPhase(runId, 'benchmarking')
        io.emit('phase:change', { phase: 'benchmarking', runId })
        const unitLabel = config.workload === 'qa' ? 'conversations' : 'prompts'
        runLog.info(undefined, `benchmarking phase started (${config.promptCount} ${unitLabel} x 3 runs)`)
        for (let i = 1; i <= 3 && !isRunCancelled(); i++) {
          runLog.info(undefined, `benchmark run#=${i} started`)
          if (config.workload === 'qa' && config.qaMode === 'sequential') {
            await runQaConversations(io, runId, conversations, config, i)
          } else {
            await runBenchmark(io, runId, prompts, config, i, fullConfig.server?.max_model_len)
          }
          runLog.info(undefined, `benchmark run#=${i} finished`)
        }
      }

      // Aggregate whatever was collected — this is the "collect" step for both a
      // natural finish and an early Stop (partial results are persisted per-request).
      stopMetricsCollector()
      const summary = computeAggregatedResult(runId, networkRttMs)
      saveAggregatedResult(summary)
      const finalPhase = isRunCancelled() ? 'stopped' : 'complete'
      updateRunPhase(runId, finalPhase, Date.now())
      io.emit('phase:change', { phase: finalPhase, runId })
      io.emit('run:complete', { runId, summary })

      runLog.info(undefined, `run finished phase=${finalPhase}`)
      console.log({ msg: 'run finished', runId, phase: finalPhase, ts: Date.now() })
    } catch (err) {
      stopMetricsCollector()
      updateRunPhase(runId, 'error', Date.now())
      io.emit('phase:change', { phase: 'error', runId })
      runLog.error(undefined, `run error: ${String(err)}`)
      console.log({ msg: 'run error', runId, err: String(err), ts: Date.now() })
    } finally {
      // Release the controller benchmark lock (best-effort).
      if (heartbeat) clearInterval(heartbeat)
      if (benchmarkId) {
        try {
          await benchmarkEnd(benchmarkId)
          console.log({ msg: 'benchmark lock released', runId, benchmarkId, ts: Date.now() })
        } catch (err) {
          console.log({ msg: 'benchmark lock release failed', runId, benchmarkId, err: String(err), ts: Date.now() })
        }
      }
      runInProgress = false
      resetRunCancel()
      clearMaxModelLenCache(runId)
      stopRunLog()
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
  runLog.info(undefined, 'stop requested')
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
