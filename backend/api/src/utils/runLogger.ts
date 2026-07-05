import fs from 'fs'
import path from 'path'

// Per-run debug log — a dedicated file per benchmark run so a specific stuck
// request (e.g. "Req #151" in the UI) can be grepped straight out of one file
// instead of the interleaved server console. Fully gated by RUN_LOG_ENABLED —
// a no-op (and never even opens a file) when unset/false, so this never adds
// overhead or noise to normal operation.
//
// Format (one line per event, minimal and greppable):
//   2026-07-05T20:15:32.123Z INFO  req=151 queued prompt_id=abc category=random phase=benchmark run#=2
//   2026-07-05T20:15:33.001Z WARN  req=151 stream ended without [DONE]/finish_reason tokens=88
//
// Enable via .env:
//   RUN_LOG_ENABLED=true
//   RUN_LOG_LEVEL=debug   # debug | info | warn | error (default info)

type LogLevel = 'debug' | 'info' | 'warn' | 'error'
const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

const ENABLED = process.env.RUN_LOG_ENABLED === 'true'
const MIN_LEVEL: LogLevel = ((process.env.RUN_LOG_LEVEL ?? 'info').toLowerCase() as LogLevel) in LEVEL_ORDER
  ? (process.env.RUN_LOG_LEVEL!.toLowerCase() as LogLevel)
  : 'info'
const LOG_DIR = path.join(process.cwd(), 'logs', 'runs')

let stream: fs.WriteStream | null = null

function shouldLog(level: LogLevel): boolean {
  return ENABLED && stream !== null && LEVEL_ORDER[level] >= LEVEL_ORDER[MIN_LEVEL]
}

/** Opens `logs/runs/<ts>_<name>_<runId>.log` for this run. No-op if disabled. */
export function startRunLog(runId: string, name: string): void {
  if (!ENABLED) return
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true })
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'run'
    const file = path.join(LOG_DIR, `${Date.now()}_${safeName}_${runId.slice(0, 8)}.log`)
    stream = fs.createWriteStream(file, { flags: 'a' })
    write('info', undefined, `run log started runId=${runId} file=${file}`)
  } catch (err) {
    // Logging must never break the benchmark pipeline.
    console.log({ msg: 'run logger start failed', runId, err: String(err), ts: Date.now() })
    stream = null
  }
}

/** Closes the current run's log file. Safe to call even if never started. */
export function stopRunLog(): void {
  if (stream) {
    write('info', undefined, 'run log closed')
    const s = stream
    stream = null
    s.end()
  }
}

function write(level: LogLevel, seq: number | undefined, msg: string): void {
  if (!shouldLog(level)) return
  const reqTag = seq != null ? `req=${seq} ` : ''
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${reqTag}${msg}\n`
  try {
    stream!.write(line)
  } catch {
    // Never let a logging failure affect the run itself.
  }
}

export const runLog = {
  debug: (seq: number | undefined, msg: string) => write('debug', seq, msg),
  info: (seq: number | undefined, msg: string) => write('info', seq, msg),
  warn: (seq: number | undefined, msg: string) => write('warn', seq, msg),
  error: (seq: number | undefined, msg: string) => write('error', seq, msg),
}
