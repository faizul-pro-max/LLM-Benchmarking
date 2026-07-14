import * as fs from 'fs'
import * as path from 'path'

const LOG_DIR = path.resolve(process.cwd(), 'logs')
const LOG_FILE = path.join(LOG_DIR, 'kv-cache-debug.log')

// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true })
}

interface LogEntry {
  timestamp: string
  unixMs: number
  stage: string
  runId?: string | null
  data: Record<string, unknown>
}

function formatLog(entry: LogEntry): string {
  return JSON.stringify(entry)
}

export function logKvCacheDebug(
  stage: 'fetch_agent' | 'fetch_vllm' | 'parse_kv_cache' | 'compute_usage' | 'insert_db' | 'emit_socket',
  runId: string | null | undefined,
  data: Record<string, unknown>
) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    unixMs: Date.now(),
    stage,
    runId: runId ?? null,
    data,
  }

  const line = formatLog(entry) + '\n'

  try {
    fs.appendFileSync(LOG_FILE, line, 'utf-8')
  } catch (err) {
    console.error({ msg: 'kv_cache debug log write failed', err: String(err), ts: Date.now() })
  }
}

export function getLogFilePath(): string {
  return LOG_FILE
}

export function clearKvCacheLog() {
  try {
    if (fs.existsSync(LOG_FILE)) {
      fs.unlinkSync(LOG_FILE)
    }
  } catch (err) {
    console.error({ msg: 'kv_cache debug log clear failed', err: String(err), ts: Date.now() })
  }
}
