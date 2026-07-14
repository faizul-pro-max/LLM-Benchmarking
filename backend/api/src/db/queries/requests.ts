import db from '../connection'
import type { RequestResult } from '../../types/run'

export function insertRequest(r: RequestResult) {
  // better-sqlite3 throws on missing/undefined named params — normalise optionals to null
  db.prepare(`
    INSERT INTO requests
      (id, run_id, run_number, prompt_id, category, phase, prompt_text,
       t0, t1, t2, t3, ttft_ms, prefill_ms, decode_ms, total_ms,
       token_count, tpot_ms, finish_reason, error,
       workload, conversation_id, turn_index)
    VALUES
      (@id, @run_id, @run_number, @prompt_id, @category, @phase, @prompt_text,
       @t0, @t1, @t2, @t3, @ttft_ms, @prefill_ms, @decode_ms, @total_ms,
       @token_count, @tpot_ms, @finish_reason, @error,
       @workload, @conversation_id, @turn_index)
  `).run({
    id: r.id,
    run_id: r.run_id,
    run_number: r.run_number,
    prompt_id: r.prompt_id,
    category: r.category,
    phase: r.phase,
    prompt_text: r.prompt_text,
    t0: r.t0 ?? null,
    t1: r.t1 ?? null,
    t2: r.t2 ?? null,
    t3: r.t3 ?? null,
    ttft_ms: r.ttft_ms ?? null,
    prefill_ms: r.prefill_ms ?? null,
    decode_ms: r.decode_ms ?? null,
    total_ms: r.total_ms ?? null,
    token_count: r.token_count ?? 0,
    tpot_ms: r.tpot_ms ?? null,
    finish_reason: r.finish_reason ?? null,
    error: r.error ?? null,
    workload: r.workload ?? null,
    conversation_id: r.conversation_id ?? null,
    turn_index: r.turn_index ?? null,
  })
}

export function getRequestsByRun(runId: string) {
  return db.prepare(`SELECT * FROM requests WHERE run_id = ? ORDER BY rowid`).all(runId)
}

export function getBenchmarkRequests(runId: string) {
  return db.prepare(`SELECT * FROM requests WHERE run_id = ? AND phase = 'benchmark'`).all(runId)
}
