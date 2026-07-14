import { Router } from 'express'
import * as fs from 'fs'
import { getLogFilePath, clearKvCacheLog } from '../utils/kvCacheDebugLogger'

const router = Router()

// GET /debug/kv-cache-logs - retrieve the KV cache debug log file contents
router.get('/kv-cache-logs', (_req, res) => {
  try {
    const logFilePath = getLogFilePath()
    if (!fs.existsSync(logFilePath)) {
      return res.json({
        status: 'ok',
        message: 'No KV cache debug logs yet',
        logs: [],
      })
    }

    const content = fs.readFileSync(logFilePath, 'utf-8')
    const lines = content.split('\n').filter((line) => line.trim())
    const logs = lines.map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return { raw: line }
      }
    })

    res.json({
      status: 'ok',
      logFilePath,
      totalEntries: logs.length,
      logs,
    })
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: String(err),
    })
  }
})

// POST /debug/kv-cache-logs/clear - clear the KV cache debug log
router.post('/kv-cache-logs/clear', (_req, res) => {
  try {
    clearKvCacheLog()
    res.json({
      status: 'ok',
      message: 'KV cache debug logs cleared',
    })
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: String(err),
    })
  }
})

// GET /debug/kv-cache-logs/download - download log file as plain text
router.get('/kv-cache-logs/download', (_req, res) => {
  try {
    const logFilePath = getLogFilePath()
    if (!fs.existsSync(logFilePath)) {
      return res.status(404).json({
        status: 'error',
        message: 'No KV cache debug logs yet',
      })
    }

    const content = fs.readFileSync(logFilePath, 'utf-8')
    res.type('text/plain').send(content)
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: String(err),
    })
  }
})

export default router
