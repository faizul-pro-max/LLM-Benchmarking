import { Router } from 'express'
import { loadPrompts, getCachedPrompts } from '../utils/sheetsLoader'

const router = Router()

router.get('/', (_req, res) => {
  const prompts = getCachedPrompts()
  res.json({ prompts, source: 'local', count: prompts.length })
})

router.get('/reload', async (_req, res) => {
  const result = await loadPrompts()
  res.json({ prompts: result.prompts, source: result.source, count: result.prompts.length })
})

export default router
