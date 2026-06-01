import db from '../connection'
import type { RequestResult } from '../../types/run'

export function insertRequest(r: RequestResult) {
  db.prepare(`
    INSERT INTO requests
      (id, run_id, run_number, prompt_id, category, phase, prompt_text,
       t0, t1, t2, t3, ttft_ms, prefill_ms, decode_ms, total_ms,
       token_count, tpot_ms, finish_reason, error)
    VALUES
      (@id, @run_id, @run_number, @prompt_id, @category, @phase, @prompt_text,
       @t0, @t1, @t2, @t3, @ttft_ms, @prefill_ms, @decode_ms, @total_ms,
       @token_count, @tpot_ms, @finish_reason, @error)
  `).run(r)
}

export function getRequestsByRun(runId: string) {
  return db.prepare(`SELECT * FROM requests WHERE run_id = ? ORDER BY rowid`).all(runId)
}

export function getBenchmarkRequests(runId: string) {
  return db.prepare(`SELECT * FROM requests WHERE run_id = ? AND phase = 'benchmark'`).all(runId)
}
