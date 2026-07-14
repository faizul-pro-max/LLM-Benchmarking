import { create } from 'zustand'
import type { RequestResult, RequestUpdate, SchedulerUpdate } from '@/types/metrics'
import type { RunPhase, RunConfig, AggregatedResult, WarmupTtft, Workload, QaMode } from '@/types/experiment'

/** Shape of a row from GET /api/results/:runId/requests — written to SQLite the
 *  instant each request finishes (see loadGenerator.ts insertRequest), so it's
 *  always authoritative regardless of whether the live socket event for it was
 *  ever received. Used by reconcileFromPersisted to fix cards that got stuck
 *  on a stale state (e.g. "decoding") because a socket disconnect/reconnect
 *  silently dropped their final request:update — there is no event replay, so
 *  without this the UI would show that state forever even though the backend
 *  genuinely finished (and its per-run debug log shows a clean `done`). */
export interface PersistedRequestRow {
  id: string
  run_id: string
  prompt_id: string
  category: 'random' | 'shared_prefix' | 'exact_repeat'
  phase: 'warmup' | 'benchmark'
  prompt_text: string
  t3: number | null
  ttft_ms: number | null
  prefill_ms: number | null
  decode_ms: number | null
  token_count: number | null
  tpot_ms: number | null
  total_ms: number | null
  finish_reason: string | null
  error: string | null
  workload?: 'short' | 'long' | 'qa' | null
  conversation_id?: string | null
  turn_index?: number | null
}

interface RunStore {
  runId: string | null
  phase: RunPhase
  requests: Map<string, RequestResult>
  warmupTtfts: WarmupTtft[]
  concurrency: number
  category: 'random' | 'shared_prefix' | 'exact_repeat'
  promptCount: number
  workload: Workload
  qaMode: QaMode
  description: string
  summary: AggregatedResult | null
  schedulerRunning: number
  schedulerWaiting: number
  /** Median vLLM network RTT probed at run start (see networkProbe.ts on the
   *  backend), set from the 'warmup' phase:change event — available for the
   *  whole run, not just after completeRun. Null until measured/unavailable. */
  networkRttMs: number | null

  startRun: (config: RunConfig & { runId: string }) => void
  updateRequest: (update: RequestUpdate) => void
  addWarmupTtft: (point: WarmupTtft) => void
  setPhase: (phase: RunPhase, networkRttMs?: number | null) => void
  completeRun: (summary: AggregatedResult) => void
  reset: () => void
  setConcurrency: (v: number) => void
  setCategory: (c: 'random' | 'shared_prefix' | 'exact_repeat') => void
  setPromptCount: (n: number) => void
  setWorkload: (w: Workload) => void
  setQaMode: (m: QaMode) => void
  setDescription: (d: string) => void
  setSchedulerUpdate: (update: SchedulerUpdate) => void
  reconcileFromPersisted: (rows: PersistedRequestRow[]) => void
}

export const useRunStore = create<RunStore>((set) => ({
  runId: null,
  phase: 'idle',
  requests: new Map(),
  warmupTtfts: [],
  concurrency: 10,
  category: 'random',
  promptCount: 100,
  workload: 'short',
  qaMode: 'sequential',
  description: '',
  summary: null,
  schedulerRunning: 0,
  schedulerWaiting: 0,
  networkRttMs: null,

  startRun: ({ runId, concurrency, category, promptCount, workload, qaMode }) =>
    set({
      runId,
      phase: 'pending',
      requests: new Map(),
      warmupTtfts: [],
      summary: null,
      concurrency,
      category,
      promptCount,
      workload: workload ?? 'short',
      qaMode: qaMode ?? 'sequential',
      schedulerRunning: 0,
      schedulerWaiting: 0,
      networkRttMs: null,
    }),

  updateRequest: (update) =>
    set((state) => {
      const next = new Map(state.requests)
      const existing = next.get(update.id)
      if (existing) {
        next.set(update.id, { ...existing, ...update })
      } else {
        next.set(update.id, {
          run_id: state.runId ?? '',
          prompt_id: update.id,
          category: state.category,
          phase: 'benchmark',
          prompt_text: '',
          ...update,
        })
      }
      return { requests: next }
    }),

  addWarmupTtft: (point) =>
    set((state) => ({ warmupTtfts: [...state.warmupTtfts, point] })),

  setPhase: (phase, networkRttMs) =>
    set((state) => ({
      phase,
      // Terminal phase — the load-generator loop that was emitting
      // scheduler:update is gone, so nothing will ever tell the UI the
      // queue drained. Zero it out here instead of waiting for a final
      // event that may never come.
      ...(phase === 'complete' || phase === 'stopped' || phase === 'error'
        ? { schedulerRunning: 0, schedulerWaiting: 0 }
        : {}),
      // Only 'warmup' ever carries a measured value — leave the existing
      // value alone on other transitions instead of clobbering it with
      // undefined.
      networkRttMs: networkRttMs !== undefined ? networkRttMs : state.networkRttMs,
    })),

  completeRun: (summary) =>
    set({ phase: 'complete', summary, schedulerRunning: 0, schedulerWaiting: 0 }),

  reset: () =>
    set({
      runId: null,
      phase: 'idle',
      requests: new Map(),
      warmupTtfts: [],
      summary: null,
      schedulerRunning: 0,
      schedulerWaiting: 0,
      networkRttMs: null,
    }),

  setConcurrency: (v) => set({ concurrency: v }),
  setCategory: (c) => set({ category: c }),
  setPromptCount: (n) => set({ promptCount: n }),
  setWorkload: (w) => set({ workload: w }),
  setQaMode: (m) => set({ qaMode: m }),
  setDescription: (d) => set({ description: d }),
  setSchedulerUpdate: (update) =>
    set({ schedulerRunning: update.running, schedulerWaiting: update.waiting }),

  reconcileFromPersisted: (rows) =>
    set((state) => {
      let changed = false
      const next = new Map(state.requests)
      for (const row of rows) {
        // Only terminal rows carry a trustworthy final state — a row with no
        // t3/finish_reason/error is (as far as we know) still genuinely
        // in-flight, so leave whatever the live socket has for it alone.
        const isTerminal = row.t3 != null || row.finish_reason != null || row.error != null
        if (!isTerminal) continue
        const derivedState: RequestResult['state'] = row.error ? 'error' : 'done'

        const existing = next.get(row.id)
        if (existing) {
          if (existing.state === 'done' || existing.state === 'error') continue
          next.set(row.id, {
            ...existing,
            state: derivedState,
            ttft_ms: row.ttft_ms ?? existing.ttft_ms,
            prefill_ms: row.prefill_ms ?? existing.prefill_ms,
            decode_ms: row.decode_ms ?? existing.decode_ms,
            token_count: row.token_count ?? existing.token_count,
            tpot_ms: row.tpot_ms ?? existing.tpot_ms,
            total_ms: row.total_ms ?? existing.total_ms,
            finish_reason: row.finish_reason ?? existing.finish_reason,
            error: row.error ?? existing.error,
          })
          changed = true
        } else {
          // Entire lifecycle (queued..done) happened while disconnected — the
          // card never existed in the UI at all. Backfill it (no `seq`/live
          // token preview available from persisted rows; RequestCard falls
          // back to array position when seq is absent).
          next.set(row.id, {
            id: row.id,
            run_id: row.run_id,
            prompt_id: row.prompt_id,
            category: row.category,
            phase: row.phase,
            prompt_text: row.prompt_text,
            state: derivedState,
            workload: row.workload ?? undefined,
            conversation_id: row.conversation_id ?? undefined,
            turn_index: row.turn_index ?? undefined,
            ttft_ms: row.ttft_ms ?? undefined,
            prefill_ms: row.prefill_ms ?? undefined,
            decode_ms: row.decode_ms ?? undefined,
            token_count: row.token_count ?? undefined,
            tpot_ms: row.tpot_ms ?? undefined,
            total_ms: row.total_ms ?? undefined,
            finish_reason: row.finish_reason ?? undefined,
            error: row.error ?? undefined,
          })
          changed = true
        }
      }
      return changed ? { requests: next } : {}
    }),
}))
