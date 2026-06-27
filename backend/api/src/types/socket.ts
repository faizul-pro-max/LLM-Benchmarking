import type { RunPhase, RequestState, AggregatedResult } from './run'
import type { MetricsSnapshot } from './metrics'

export interface PhaseChangePayload {
  phase: RunPhase
  runId: string
}

export interface RequestUpdatePayload {
  id: string
  state: RequestState
  /** Sent once on the initial 'queued' update so the UI can render the prompt
   *  preview, real per-request category badge, and prompt id. */
  prompt_text?: string
  prompt_id?: string
  category?: 'random' | 'shared_prefix' | 'exact_repeat'
  ttft_ms?: number
  prefill_ms?: number
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

export interface ServerToClientEvents {
  'phase:change': (payload: PhaseChangePayload) => void
  'metrics:snapshot': (payload: MetricsSnapshot) => void
  'request:update': (payload: RequestUpdatePayload) => void
  'warmup:ttft': (payload: WarmupTtftPayload) => void
  'run:complete': (payload: RunCompletePayload) => void
}

export interface ClientToServerEvents {
  'run:start': (config: { name: string; concurrency: number; category: string; promptCount: number }, cb: (runId: string) => void) => void
  'run:stop': (payload: { runId: string }) => void
  // Declares the active chat session. null when the client leaves chat. While a
  // session is active, metrics:snapshot payloads are tagged with session_id and
  // persisted tied to that session.
  'chat:session': (payload: { sessionId: string | null }) => void
}
