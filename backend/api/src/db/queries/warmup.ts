import db from '../connection'

export function getWarmupRequests(runId: string) {
  return db.prepare(`SELECT * FROM requests WHERE run_id = ? AND phase = 'warmup' ORDER BY rowid`).all(runId)
}
