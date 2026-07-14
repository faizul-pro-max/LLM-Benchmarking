import type { RunPhase, RequestState, AggregatedResult, Workload } from './run'
import type { MetricsSnapshot } from './metrics'

export interface PhaseChangePayload {
  phase: RunPhase
  runId: string
  /** Median vLLM network RTT probed just before warmup starts (see
   *  networkProbe.ts) — attached to the 'warmup' transition so the UI has it
   *  for the whole run, not just after run:complete. Null if unavailable. */
  network_rtt_ms?: number | null
}

export interface RequestUpdatePayload {
  id: string
  state: RequestState
  /** 1-based, monotonically increasing per run (warmup + all benchmark loops
   *  combined) — this is the authoritative "Req #" shown in the UI, and the
   *  same number used to tag every line for this request in the per-run debug
   *  log (see runLogger.ts), so a card stuck on "Decoding" can be grepped
   *  directly by its displayed number. Sent on every update for the request. */
  seq?: number
  /** Sent once on the initial 'queued' update so the UI can render the prompt
   *  preview, real per-request category badge, and prompt id. */
  prompt_text?: string
  prompt_id?: string
  category?: 'random' | 'shared_prefix' | 'exact_repeat'
  /** Prompt source workload this request was drawn from. */
  workload?: Workload
  /** Multi-turn Q&A (workload === 'qa'): id shared by every turn of the same
   *  conversation. Absent for short/long. */
  conversation_id?: string
  /** Multi-turn Q&A: 0-based position of this turn within its conversation. */
  turn_index?: number
  ttft_ms?: number
  prefill_ms?: number
  decode_ms?: number
  token_count?: number
  tokens_text?: string
  tpot_ms?: number
  total_ms?: number
  finish_reason?: string
  error?: string
}

export interface WarmupTtftPayload {
  req: number
  ttft_ms: number
}

export interface RunCompletePayload {
  runId: string
  summary: AggregatedResult
}

/** Benchmark-scoped scheduler state, derived purely from our own concurrency
 *  limiter (loadGenerator.ts makeLimit) — NOT from vLLM's global Prometheus
 *  gauges, which reflect the whole server rather than just this run and don't
 *  distinguish warmup vs benchmark. Only emitted while a run's warmup or
 *  benchmark loop is actively executing. */
export interface SchedulerUpdatePayload {
  runId: string
  phase: 'warmup' | 'benchmark'
  running: number
  waiting: number
  concurrency: number
}

export interface ServerToClientEvents {
  'phase:change': (payload: PhaseChangePayload) => void
  'metrics:snapshot': (payload: MetricsSnapshot) => void
  'request:update': (payload: RequestUpdatePayload) => void
  'warmup:ttft': (payload: WarmupTtftPayload) => void
  'run:complete': (payload: RunCompletePayload) => void
  'scheduler:update': (payload: SchedulerUpdatePayload) => void
}

export interface ClientToServerEvents {
  'run:start': (config: { name: string; concurrency: number; category: string; promptCount: number }, cb: (runId: string) => void) => void
  'run:stop': (payload: { runId: string }) => void
  // Declares the active chat session. null when the client leaves chat. While a
  // session is active, metrics:snapshot payloads are tagged with session_id and
  // persisted tied to that session.
  'chat:session': (payload: { sessionId: string | null }) => void
}
