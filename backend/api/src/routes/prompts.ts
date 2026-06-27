import { Router } from 'express'
import { loadPrompts, getCachedPrompts, getPromptsInfo } from '../utils/sheetsLoader'

const router = Router()

router.get('/', (_req, res) => {
  const prompts = getCachedPrompts()
  const info = getPromptsInfo()
  res.json({
    prompts,
    source: info.source,
    count: info.total,
    byCategory: info.byCategory,
  })
})

router.get('/reload', async (_req, res) => {
  const result = await loadPrompts()
  const info = getPromptsInfo()
  res.json({
    prompts: result.prompts,
    source: result.source,
    count: result.prompts.length,
    byCategory: info.byCategory,
  })
})

export default router
