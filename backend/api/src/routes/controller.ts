import { Router } from 'express'
import { z } from 'zod'
import {
  isControllerConfigured,
  getScenarios,
  getCurrent,
  getControllerHealth,
  runScenario,
  getSwitchStatus,
} from '../utils/controllerClient'

// Server-side proxy for the Scenario Controller (:9200). The controller's
// x-api-key stays on the backend; the frontend hits these routes instead.
// Every handler tolerates the controller being unconfigured or unreachable and
// responds with HTTP 200 — a control-plane outage must never surface as a 500.
const router = Router()

// GET /controller/scenarios — list available inference scenarios.
router.get('/scenarios', async (_req, res) => {
  if (!isControllerConfigured()) { res.json({ configured: false }); return }
  try {
    const data = await getScenarios()
    res.json(data)
  } catch (err) {
    console.log({ msg: 'controller scenarios unreachable', err: String(err), ts: Date.now() })
    res.json({ configured: true, reachable: false, error: String(err) })
  }
})

// GET /controller/current — current scenario + switching/busy status.
router.get('/current', async (_req, res) => {
  if (!isControllerConfigured()) { res.json({ configured: false }); return }
  try {
    const data = await getCurrent()
    res.json(data)
  } catch (err) {
    console.log({ msg: 'controller current unreachable', err: String(err), ts: Date.now() })
    res.json({ configured: true, reachable: false, error: String(err) })
  }
})

// GET /controller/health — controller liveness.
router.get('/health', async (_req, res) => {
  if (!isControllerConfigured()) { res.json({ configured: false }); return }
  try {
    const data = await getControllerHealth()
    res.json(data)
  } catch (err) {
    console.log({ msg: 'controller health unreachable', err: String(err), ts: Date.now() })
    res.json({ configured: true, reachable: false, error: String(err) })
  }
})

const RunScenarioSchema = z.object({
  scenario: z.string().min(1),
  overrides: z.record(z.unknown()).optional(),
  force: z.boolean().optional(),
})

// POST /controller/run/scenario — switch scenario. Always JSON + HTTP 200 on a
// reachable controller; the frontend switches on result.kind.
router.post('/run/scenario', async (req, res) => {
  if (!isControllerConfigured()) { res.json({ configured: false }); return }
  const parsed = RunScenarioSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const { scenario, overrides, force } = parsed.data
  try {
    const result = await runScenario(scenario, overrides, force)
    res.json(result)
  } catch (err) {
    console.log({ msg: 'controller run/scenario unreachable', scenario, err: String(err), ts: Date.now() })
    res.json({ kind: 'invalid', message: 'Controller unreachable' })
  }
})

// GET /controller/switch/status?id=<jobId> — poll an in-flight switch job.
router.get('/switch/status', async (req, res) => {
  if (!isControllerConfigured()) { res.json({ configured: false }); return }
  const id = req.query.id
  if (typeof id !== 'string' || id.length === 0) {
    res.status(400).json({ error: 'id query param required' })
    return
  }
  try {
    const job = await getSwitchStatus(id)
    res.json({ job })
  } catch (err) {
    console.log({ msg: 'controller switch/status unreachable', id, err: String(err), ts: Date.now() })
    res.json({ job: null, reachable: false })
  }
})

export default router
