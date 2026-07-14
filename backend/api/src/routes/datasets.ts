import { Router } from 'express'
import { z } from 'zod'
import {
  loadHfDataset,
  loadHfConversations,
  getDatasetStatus,
} from '../utils/hfDatasetLoader'

const router = Router()

const LoadSchema = z.object({
  workload: z.enum(['short', 'long', 'qa']),
  repoId: z.string().min(1).optional(),
  config: z.string().min(1).optional(),
  split: z.string().min(1).optional(),
  field: z.string().min(1).optional(),
  force: z.boolean().optional(),
})

router.post('/load', async (req, res) => {
  const parsed = LoadSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const { workload, ...opts } = parsed.data

  try {
    if (workload === 'qa') {
      const { conversations, source, meta } = await loadHfConversations(opts)
      res.json({ workload, source, count: conversations.length, meta })
    } else {
      const { prompts, source, meta } = await loadHfDataset(workload, opts)
      res.json({ workload, source, count: prompts.length, meta })
    }
  } catch (err) {
    console.log({ msg: 'dataset load failed', workload, err: String(err), ts: Date.now() })
    res.status(502).json({ error: String(err) })
  }
})

router.get('/status', (_req, res) => {
  res.json(getDatasetStatus())
})

const ReloadQuerySchema = z.object({
  workload: z.enum(['short', 'long', 'qa']),
})

router.get('/reload', async (req, res) => {
  const parsed = ReloadQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const { workload } = parsed.data

  try {
    if (workload === 'qa') {
      const { conversations, source, meta } = await loadHfConversations({ force: true })
      res.json({ workload, source, count: conversations.length, meta })
    } else {
      const { prompts, source, meta } = await loadHfDataset(workload, { force: true })
      res.json({ workload, source, count: prompts.length, meta })
    }
  } catch (err) {
    console.log({ msg: 'dataset reload failed', workload, err: String(err), ts: Date.now() })
    res.status(502).json({ error: String(err) })
  }
})

export default router
