import { Router } from 'express'
import db from '../db/connection'
import { buildDoctorReport, collectConfig } from '../utils/doctor'

const router = Router()
const GPU_AGENT_URL     = process.env.GPU_AGENT_URL ?? ''
const GPU_AGENT_API_KEY = process.env.GPU_AGENT_API_KEY ?? ''
const VLLM_URL          = process.env.VLLM_URL ?? ''

async function checkRedis() {
  try {
    const { default: Redis } = await import('ioredis')
    const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { lazyConnect: true, connectTimeout: 2000 })
    const t0 = Date.now()
    await redis.ping()
    const latency_ms = Date.now() - t0
    await redis.quit()
    return { status: 'ok' as const, latency_ms }
  } catch (err) {
    return { status: 'error' as const, error: String(err) }
  }
}

async function checkGpu() {
  if (!GPU_AGENT_URL) return { status: 'not_configured' as const, url: '' }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fetch = require('node-fetch') as typeof import('node-fetch').default
    const t0 = Date.now()
    const headers = GPU_AGENT_API_KEY ? { 'x-api-key': GPU_AGENT_API_KEY } : undefined
    const res = await (fetch as Function)(`${GPU_AGENT_URL}/gpu`, { signal: AbortSignal.timeout(2500), headers })
    const latency_ms = Date.now() - t0
    const data = await res.json() as Record<string, unknown>
    return { status: 'ok' as const, url: GPU_AGENT_URL, latency_ms, last_metric: { gpu_util: data.gpu_util, vram_used_mb: data.vram_used_mb } }
  } catch {
    return { status: 'unreachable' as const, url: GPU_AGENT_URL }
  }
}

/** Active benchmark experiment the GPU agent is currently serving.
 *  The agent's /experiment endpoint reports the live scenario config (name,
 *  backend, model, launch command). Returns the experiment object when one is
 *  active, otherwise null — never throws, so it can't degrade /health. */
async function getActiveExperiment() {
  if (!GPU_AGENT_URL) return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fetch = require('node-fetch') as typeof import('node-fetch').default
    const headers = GPU_AGENT_API_KEY ? { 'x-api-key': GPU_AGENT_API_KEY } : undefined
    const res = await (fetch as Function)(`${GPU_AGENT_URL}/experiment`, { signal: AbortSignal.timeout(2500), headers })
    if (!res.ok) return null
    const data = await res.json() as { active?: boolean; experiment?: Record<string, unknown> }
    return data?.active && data.experiment ? data.experiment : null
  } catch {
    return null
  }
}

async function checkVllm() {
  if (!VLLM_URL) return { status: 'not_configured' as const, url: '' }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fetch = require('node-fetch') as typeof import('node-fetch').default
    const t0 = Date.now()
    const res = await (fetch as Function)(`${VLLM_URL}/health`, { signal: AbortSignal.timeout(2500) })
    const latency_ms = Date.now() - t0
    if (!res.ok) throw new Error(`status ${res.status}`)
    return { status: 'ok' as const, url: VLLM_URL, latency_ms }
  } catch {
    return { status: 'unreachable' as const, url: VLLM_URL }
  }
}

function checkSqlite() {
  try {
    const row = db.prepare('SELECT 1').get()
    const stats = db.prepare("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()").get() as { size: number }
    return { status: 'ok' as const, path: process.env.SQLITE_PATH ?? './data/bench.db', size_mb: +(stats.size / 1024 / 1024).toFixed(2) }
  } catch (err) {
    return { status: 'error' as const, path: '', error: String(err) }
  }
}

router.get('/', async (_req, res) => {
  const [redis, gpu_agent, vllm, experiment] = await Promise.all([checkRedis(), checkGpu(), checkVllm(), getActiveExperiment()])
  const sqlite = checkSqlite()

  const status =
    redis.status === 'error' || sqlite.status === 'error' ? 'unhealthy' :
    gpu_agent.status === 'unreachable' || vllm.status === 'unreachable' ? 'degraded' :
    'healthy'

  // Compact config summary so the UI can show what's applied without the heavier /health/doctor call
  const cfg = collectConfig()
  const summary = {
    model_name: cfg.model_name,
    vllm_url: cfg.vllm_url,
    gpu_agent_url: cfg.gpu_agent_url,
    defaults: cfg.defaults,
    experiment,        // active benchmark experiment from the GPU agent, or null
    doctor: '/health/doctor',
  }

  res.json({ status, uptime_s: Math.floor(process.uptime()), checks: { redis, sqlite, gpu_agent, vllm }, summary })
})

// Full configuration + loaded-model + GPU diagnostics for the UI to project
router.get('/doctor', async (_req, res) => {
  try {
    const report = await Promise.race([
      buildDoctorReport(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('doctor timeout')), 4000)),
    ])
    res.json(report)
  } catch (err) {
    res.status(200).json({ status: 'degraded', generated_at: Date.now(), error: String(err) })
  }
})

router.get('/gpu', async (_req, res) => {
  res.json(await checkGpu())
})

router.get('/vllm', async (_req, res) => {
  res.json(await checkVllm())
})

router.get('/experiment', async (_req, res) => {
  res.json({ experiment: await getActiveExperiment() })
})

export default router
