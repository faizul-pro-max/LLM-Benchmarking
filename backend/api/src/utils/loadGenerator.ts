import { v4 as uuidv4 } from 'uuid'
import { Server } from 'socket.io'
import { insertRequest } from '../db/queries/requests'
import type { RequestResult, RunConfig, Workload } from '../types/run'
import type { ServerToClientEvents, ClientToServerEvents } from '../types/socket'
import type { Prompt } from './sheetsLoader'
import type { Conversation } from './hfDatasetLoader'
import { runLog } from './runLogger'

const VLLM_URL       = process.env.VLLM_URL ?? ''
const VLLM_API_KEY   = process.env.VLLM_API_KEY ?? ''
const TOKEN_BATCH    = 5
const TOKEN_BATCH_MS = 100
const DEFAULT_MAX_TOKENS = 256

// Cache max_model_len per run to avoid repeated API calls
const maxModelLenCache = new Map<string, { value: number | null; timestamp: number }>()
const CACHE_TTL_MS = 30000 // 30 seconds

// Fetch max_model_len from vLLM server
async function fetchMaxModelLen(): Promise<number | null> {
  if (!VLLM_URL) return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fetch = require('node-fetch') as typeof import('node-fetch').default
    const headers = VLLM_API_KEY ? { Authorization: `Bearer ${VLLM_API_KEY}` } : undefined
    const res = await fetch(`${VLLM_URL}/v1/models`, {
      signal: AbortSignal.timeout(2000),
      headers,
    })
    if (!res.ok) return null
    const data = (await res.json()) as { data?: Array<{ max_model_len?: number }> }
    return data.data?.[0]?.max_model_len ?? null
  } catch (err) {
    runLog.warn(undefined, `failed to fetch max_model_len: ${String(err)}`)
    return null
  }
}

// Get max_model_len with caching per run
async function getMaxModelLen(runId: string): Promise<number | null> {
  const cached = maxModelLenCache.get(runId)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.value
  }

  const value = await fetchMaxModelLen()
  maxModelLenCache.set(runId, { value, timestamp: Date.now() })
  return value
}

// Rough token estimation: average ~1.3 tokens per word + special characters
function estimatePromptTokens(text: string): number {
  const words = text.trim().split(/\s+/).length
  const specialChars = (text.match(/[^\w\s]/g) || []).length
  return Math.ceil(words * 1.3 + specialChars * 0.2)
}

// Calculate max_tokens for a request, leaving buffer for output
function calculateMaxTokens(maxModelLen: number | null | undefined, promptText: string): number {
  if (!maxModelLen || maxModelLen <= 0) return DEFAULT_MAX_TOKENS

  const estimatedPromptTokens = estimatePromptTokens(promptText)
  const availableTokens = maxModelLen - estimatedPromptTokens

  // Ensure we have at least DEFAULT_MAX_TOKENS available, but not more than 2x default
  const maxAllowed = Math.min(availableTokens, DEFAULT_MAX_TOKENS * 2)
  return Math.max(DEFAULT_MAX_TOKENS, Math.floor(maxAllowed))
}

// 1-based, monotonically increasing across warmup + all benchmark loops for
// the current run — matches the "Req #" shown in the UI (see RequestCard.tsx)
// exactly, since requests are dequeued from the concurrency limiter in the
// same order they're created. Used to tag every per-run debug log line so a
// card stuck in the UI can be found by grepping `req=<N>` in that run's log.
let seqCounter = 0
function nextSeq(): number {
  seqCounter += 1
  return seqCounter
}

// Cancellation: set by cancelRun() (Stop button → POST /run/stop). Queued requests
// short-circuit before firing, and in-flight vLLM streams are aborted via their
// AbortController so the pipeline drains quickly instead of running to completion.
let cancelled = false
const inflight = new Set<AbortController>()

export function isRunCancelled(): boolean {
  return cancelled
}

// Belt-and-suspenders drain guard: Stop should always fully drain within ~5s
// even if a stream is somehow still hung despite the immediate abort() above
// and the per-request decode stall timeout in runSingleRequest. Aborting an
// already-aborted controller is a safe no-op.
const STOP_GRACE_MS = 5000
let stopGraceTimer: ReturnType<typeof setTimeout> | null = null

export function cancelRun(): void {
  cancelled = true
  for (const ctrl of inflight) ctrl.abort()
  if (stopGraceTimer) clearTimeout(stopGraceTimer)
  stopGraceTimer = setTimeout(() => {
    stopGraceTimer = null
    if (inflight.size > 0) {
      console.log({ msg: 'stop grace timeout elapsed', inflightCount: inflight.size, ts: Date.now() })
      for (const ctrl of inflight) ctrl.abort()
    }
  }, STOP_GRACE_MS)
}

export function resetRunCancel(): void {
  cancelled = false
  inflight.clear()
  // A pipeline can fully drain (and a new run start) well before the grace
  // window elapses — without clearing it here, the stale timer would later
  // fire mid-way through an unrelated subsequent run and abort its in-flight
  // controllers (inflight is a shared module-level Set across runs).
  if (stopGraceTimer) {
    clearTimeout(stopGraceTimer)
    stopGraceTimer = null
  }
  seqCounter = 0
}

export function clearMaxModelLenCache(runId: string): void {
  maxModelLenCache.delete(runId)
}

// `onChange` fires with the current (running, waiting) counts every time either
// changes — running = actively-executing count (past the concurrency gate),
// waiting = queue.length (not yet dequeued). This is our own load generator's
// bookkeeping, so it's exact and phase-correct, unlike vLLM's global scheduler
// gauges which reflect the whole server rather than just this benchmark run.
function makeLimit(concurrency: number, onChange?: (running: number, waiting: number) => void) {
  let active = 0
  const queue: Array<() => void> = []
  const notify = () => onChange?.(active, queue.length)
  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const run = () => {
        active++
        notify()
        fn().then(resolve, reject).finally(() => {
          active--
          notify()
          if (queue.length) queue.shift()!()
        })
      }
      if (active < concurrency) run()
      else {
        queue.push(run)
        notify()
      }
    })
  }
}

function emitUpdate(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  payload: Parameters<ServerToClientEvents['request:update']>[0]
) {
  io.emit('request:update', payload)
}

async function runSingleRequest(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  runId: string,
  runNumber: number,
  prompt: Prompt,
  phase: 'warmup' | 'benchmark',
  reqIndex: number,
  maxModelLen?: number | null,
  workload?: Workload,
): Promise<RequestResult | null> {
  // Stop pressed while this request was still queued — never fire it.
  if (cancelled) return null

  const id = uuidv4()
  const seq = nextSeq()
  const result: RequestResult = {
    id,
    seq,
    run_id: runId,
    run_number: runNumber,
    prompt_id: prompt.id,
    category: prompt.category as RequestResult['category'],
    phase,
    prompt_text: prompt.text,
    token_count: 0,
    workload,
    conversation_id: prompt.conversation_id,
    turn_index: prompt.turn_index,
  }

  runLog.info(seq, `queued prompt_id=${prompt.id} category=${prompt.category} phase=${phase} run#=${runNumber}`)
  emitUpdate(io, {
    id,
    seq,
    state: 'queued',
    prompt_text: prompt.text,
    prompt_id: prompt.id,
    category: prompt.category as RequestResult['category'],
    workload,
    conversation_id: prompt.conversation_id,
    turn_index: prompt.turn_index,
  })

  if (!VLLM_URL) {
    // Mock mode — simulate timing
    const mockDelay = (ms: number) => new Promise((r) => setTimeout(r, ms))
    result.t0 = Date.now()
    await mockDelay(50)
    result.t1 = Date.now()
    emitUpdate(io, { id, seq, state: 'prefilling' })
    await mockDelay(Math.random() * 300 + 100)
    result.t2 = Date.now()
    result.ttft_ms = result.t2 - result.t0
    result.prefill_ms = result.t2 - result.t1
    runLog.debug(seq, `first token (mock) ttft_ms=${result.ttft_ms}`)
    emitUpdate(io, { id, seq, state: 'decoding', ttft_ms: result.ttft_ms, prefill_ms: result.prefill_ms })

    if (phase === 'warmup') {
      io.emit('warmup:ttft', { req: reqIndex, ttft_ms: result.ttft_ms })
    }

    let tokenCount = 0
    let tokenText = ''
    const totalTokens = Math.floor(Math.random() * 150 + 50)
    const words = ['inference', 'model', 'token', 'cache', 'GPU', 'latency', 'batch', 'prefill', 'decode', 'attention']
    while (tokenCount < totalTokens) {
      if (cancelled) break
      await mockDelay(8)
      tokenCount++
      tokenText += words[Math.floor(Math.random() * words.length)] + ' '
      if (tokenCount % TOKEN_BATCH === 0) {
        emitUpdate(io, { id, seq, state: 'decoding', token_count: tokenCount, tokens_text: tokenText })
      }
    }
    result.t3 = Date.now()
    result.decode_ms = result.t3 - result.t2
    result.total_ms  = result.t3 - result.t0
    result.token_count = tokenCount
    result.tpot_ms = tokenCount > 0 ? result.decode_ms / tokenCount : 0
    result.finish_reason = cancelled ? 'stopped' : 'stop'
    runLog.info(seq, `done (mock) total_ms=${result.total_ms} tokens=${tokenCount} finish_reason=${result.finish_reason}`)
    emitUpdate(io, { id, seq, state: 'done', token_count: tokenCount, tokens_text: tokenText, decode_ms: result.decode_ms, tpot_ms: result.tpot_ms, total_ms: result.total_ms, finish_reason: result.finish_reason })
    insertRequest(result)
    return result
  }

  // Real vLLM mode
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fetch = require('node-fetch') as typeof import('node-fetch').default
  result.t0 = Date.now()

  // Registered so cancelRun() can abort this stream mid-flight.
  const controller = new AbortController()
  inflight.add(controller)

  // Decode-phase stall guard (safety net for Bug 1): if a proxy stops sending
  // chunks without closing the stream and without ever sending [DONE], we'd
  // hang forever. Only armed once t2 (first token) is set — prefill can
  // legitimately take a long time under load, so it's never guarded.
  const DECODE_STALL_MS = 30000
  let stallTimer: ReturnType<typeof setTimeout> | null = null
  let stalled = false
  const resetStallTimer = () => {
    if (stallTimer) clearTimeout(stallTimer)
    stallTimer = null
    if (result.t2) {
      stallTimer = setTimeout(() => {
        stalled = true
        runLog.warn(seq, `decode stall timeout (${DECODE_STALL_MS}ms with no new chunk) — aborting`)
        controller.abort()
      }, DECODE_STALL_MS)
    }
  }

  try {
    // Dynamically fetch current max_model_len from vLLM (cached per run)
    const currentMaxModelLen = await getMaxModelLen(runId)
    const maxTokens = calculateMaxTokens(currentMaxModelLen, prompt.text)
    runLog.debug(seq, `max_tokens=${maxTokens} (model_len=${currentMaxModelLen}, prompt_est=${estimatePromptTokens(prompt.text)})`)
    const res = await fetch(`${VLLM_URL}/v1/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(VLLM_API_KEY ? { Authorization: `Bearer ${VLLM_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model: process.env.MODEL_NAME ?? 'Qwen/Qwen2.5-7B-Instruct',
        prompt: prompt.text,
        max_tokens: maxTokens,
        stream: true,
      }),
    })

    result.t1 = Date.now()
    runLog.debug(seq, `response headers received status=${res.status}`)
    emitUpdate(io, { id, seq, state: 'prefilling' })

    let tokenCount = 0
    let tokenText  = ''
    let lastBatchTs = Date.now()

    const body = res.body as AsyncIterable<Buffer>
    // Labeled so we can exit the outer stream loop the moment [DONE] or a
    // finish_reason is observed, instead of relying on the HTTP stream to
    // close (Bug 1 — a proxy/keep-alive could delay that indefinitely even
    // though the full response has already arrived).
    //
    // sseBuffer carries over any trailing partial line between chunk reads.
    // Network chunks are NOT guaranteed to align with SSE message boundaries
    // (especially through a proxy/tunnel, which VLLM_URL often is here) — an
    // event like `data: {...finish_reason...}` or `data: [DONE]` can straddle
    // two `chunk` reads. Without carrying the incomplete tail over, splitting
    // each chunk in isolation silently drops or corrupts that final event
    // (neither half starts with `data: ` on its own), which is exactly how a
    // request can keep the whole response but never see completion.
    let sseBuffer = ''
    let sawSentinel = false
    streamLoop: for await (const chunk of body) {
      if (cancelled) break streamLoop
      sseBuffer += chunk.toString()
      const parts = sseBuffer.split('\n')
      // Last element may be an incomplete line (no trailing \n yet) — hold it
      // back for the next chunk instead of processing/discarding it now.
      sseBuffer = parts.pop() ?? ''
      const lines = parts.filter((l) => l.startsWith('data: '))
      for (const line of lines) {
        const data = line.slice(6).trim()
        if (data === '[DONE]') {
          sawSentinel = true
          runLog.debug(seq, 'received [DONE] sentinel')
          break streamLoop
        }
        try {
          const parsed = JSON.parse(data) as { choices: Array<{ text: string; finish_reason?: string }> }
          const text = parsed.choices[0]?.text ?? ''
          const finishReason = parsed.choices[0]?.finish_reason

          if (!result.t2 && text) {
            result.t2 = Date.now()
            result.ttft_ms = result.t2 - result.t0
            result.prefill_ms = result.t2 - result.t1
            runLog.info(seq, `first token ttft_ms=${result.ttft_ms}`)
            emitUpdate(io, { id, seq, state: 'decoding', ttft_ms: result.ttft_ms, prefill_ms: result.prefill_ms })
            if (phase === 'warmup') {
              io.emit('warmup:ttft', { req: reqIndex, ttft_ms: result.ttft_ms })
            }
          }

          tokenCount++
          tokenText += text
          const now = Date.now()
          if (tokenCount % TOKEN_BATCH === 0 || now - lastBatchTs >= TOKEN_BATCH_MS) {
            emitUpdate(io, { id, seq, state: 'decoding', token_count: tokenCount, tokens_text: tokenText })
            lastBatchTs = now
          }

          if (finishReason) {
            sawSentinel = true
            result.finish_reason = finishReason
            runLog.debug(seq, `finish_reason=${finishReason} received tokens=${tokenCount}`)
          }
        } catch (parseErr) {
          // Swallowed on purpose (a truncated/non-JSON line is expected chunk
          // noise), but logged — if this fires for the FINAL event of a stuck
          // request, it's the smoking gun (see sseBuffer comment above).
          runLog.warn(seq, `unparsable SSE line, skipped: ${data.slice(0, 100)} err=${String(parseErr)}`)
        }
      }
      // Reset (or arm, once t2 is set) the decode stall guard after each
      // chunk is fully processed.
      resetStallTimer()
      if (result.finish_reason) break streamLoop
    }

    if (!sawSentinel && !cancelled) {
      // The stream closed (for-await ended naturally) without us ever seeing
      // [DONE] or a finish_reason — completion here relies entirely on the
      // connection actually closing. If a request looks stuck in "decoding"
      // in the UI, this line for its req= is the key diagnostic to check.
      runLog.warn(seq, `stream ended WITHOUT [DONE]/finish_reason sentinel — completed via stream-close only, tokens=${tokenCount}`)
    }

    result.t3 = Date.now()
    result.decode_ms   = (result.t2 ? result.t3 - result.t2 : 0)
    result.total_ms    = result.t3 - result.t0
    result.token_count = tokenCount
    result.tpot_ms     = tokenCount > 0 ? result.decode_ms / tokenCount : 0
    if (cancelled && !result.finish_reason) result.finish_reason = 'stopped'
    runLog.info(seq, `done total_ms=${result.total_ms} tokens=${tokenCount} finish_reason=${result.finish_reason}`)
    emitUpdate(io, { id, seq, state: 'done', token_count: tokenCount, tokens_text: tokenText, decode_ms: result.decode_ms, tpot_ms: result.tpot_ms, total_ms: result.total_ms, finish_reason: result.finish_reason })
  } catch (err) {
    // An aborted stream due to our own decode-stall guard is a timeout, not a
    // Stop-driven cancellation or an upstream failure.
    if (stalled) {
      result.finish_reason = 'timeout'
      result.error = 'decode stall timeout exceeded'
      runLog.error(seq, `timeout: ${result.error}`)
      emitUpdate(io, { id, seq, state: 'error', error: result.error, finish_reason: result.finish_reason })
    } else if (controller.signal.aborted || cancelled) {
      // An aborted stream (Stop pressed) is an intentional halt, not a failure.
      result.finish_reason = 'stopped'
      runLog.info(seq, 'aborted (stop requested)')
    } else {
      result.error = String(err)
      result.finish_reason = 'error'
      runLog.error(seq, `request failed: ${result.error}`)
      emitUpdate(io, { id, seq, state: 'error', error: result.error })
    }
  } finally {
    if (stallTimer) clearTimeout(stallTimer)
    inflight.delete(controller)
  }

  insertRequest(result)
  return result
}

export async function runWarmup(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  runId: string,
  prompts: Prompt[],
  concurrency: number,
  maxModelLen?: number | null,
  workload?: Workload,
): Promise<RequestResult[]> {
  const count = parseInt(process.env.WARMUP_REQUEST_COUNT ?? '20', 10)
  const warmupPrompts = prompts.slice(0, count)
  const limit = makeLimit(concurrency, (running, waiting) => {
    io.emit('scheduler:update', { runId, phase: 'warmup', running, waiting, concurrency })
  })

  // Each request persists itself (incremental insert) so a Stop mid-run still
  // leaves the partial data on disk for aggregation. Skipped (cancelled) requests
  // resolve to null and are filtered out.
  const results = await Promise.all(
    warmupPrompts.map((p, i) =>
      limit(() => runSingleRequest(io, runId, 0, p, 'warmup', i, maxModelLen, workload))
    )
  )

  return results.filter((r): r is RequestResult => r !== null)
}

export async function runBenchmark(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  runId: string,
  prompts: Prompt[],
  config: RunConfig,
  runNumber: number,
  maxModelLen?: number | null,
): Promise<RequestResult[]> {
  const limit = makeLimit(config.concurrency, (running, waiting) => {
    io.emit('scheduler:update', { runId, phase: 'benchmark', running, waiting, concurrency: config.concurrency })
  })

  const results = await Promise.all(
    prompts.map((p, i) =>
      limit(() => runSingleRequest(io, runId, runNumber, p, 'benchmark', i, maxModelLen, config.workload))
    )
  )

  return results.filter((r): r is RequestResult => r !== null)
}

// ---------------------------------------------------------------------------
// Multi-turn Q&A (workload === 'qa', qaMode === 'sequential')
//
// runOneChatTurn is a deliberately SEPARATE implementation from
// runSingleRequest's SSE loop above (not a shared refactor) — this keeps the
// existing, carefully-tuned single-turn /v1/completions path (decode-stall
// guard, partial-line buffering, [DONE] handling) completely untouched. The
// duplication here is intentional; see conversation with the user before this
// change.
// ---------------------------------------------------------------------------

type ChatMessage = { role: 'user' | 'assistant'; content: string }

/** Streams one turn of a conversation against `${VLLM_URL}/v1/chat/completions`.
 *  Persists its own `requests` row (tagged workload:'qa', conversation_id,
 *  turn_index) and returns the raw assistant text so the caller can append it
 *  to `messages` before dispatching the next turn. */
async function runOneChatTurn(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  runId: string,
  runNumber: number,
  conversationId: string,
  turnIndex: number,
  messages: ChatMessage[],
  phase: 'warmup' | 'benchmark',
): Promise<{ result: RequestResult; assistantText: string } | null> {
  // Stop pressed before this turn started — never fire it.
  if (cancelled) return null

  const id = uuidv4()
  const seq = nextSeq()
  const userTurnText = messages[messages.length - 1]?.content ?? ''
  // requests.category is NOT NULL — 'random' is a harmless placeholder here;
  // `workload`/`conversation_id`/`turn_index` are what actually distinguish
  // qa turns, category has no real meaning for them.
  const result: RequestResult = {
    id,
    seq,
    run_id: runId,
    run_number: runNumber,
    prompt_id: `${conversationId}-t${turnIndex}`,
    category: 'random',
    phase,
    prompt_text: userTurnText,
    token_count: 0,
    workload: 'qa',
    conversation_id: conversationId,
    turn_index: turnIndex,
  }

  runLog.info(seq, `queued qa turn conv=${conversationId} turn=${turnIndex} phase=${phase} run#=${runNumber}`)
  emitUpdate(io, {
    id,
    seq,
    state: 'queued',
    prompt_text: userTurnText,
    prompt_id: result.prompt_id,
    category: 'random',
    workload: 'qa',
    conversation_id: conversationId,
    turn_index: turnIndex,
  })

  if (!VLLM_URL) {
    // Mock mode — simulate timing + a plausible assistant reply.
    const mockDelay = (ms: number) => new Promise((r) => setTimeout(r, ms))
    result.t0 = Date.now()
    await mockDelay(50)
    result.t1 = Date.now()
    emitUpdate(io, { id, seq, state: 'prefilling' })
    await mockDelay(Math.random() * 300 + 100)
    result.t2 = Date.now()
    result.ttft_ms = result.t2 - result.t0
    result.prefill_ms = result.t2 - result.t1
    emitUpdate(io, { id, seq, state: 'decoding', ttft_ms: result.ttft_ms, prefill_ms: result.prefill_ms })

    let tokenCount = 0
    let tokenText = ''
    const totalTokens = Math.floor(Math.random() * 60 + 20)
    const words = ['sure', 'that', 'makes', 'sense', 'let', 'me', 'explain', 'further', 'good', 'point']
    while (tokenCount < totalTokens) {
      if (cancelled) break
      await mockDelay(8)
      tokenCount++
      tokenText += words[Math.floor(Math.random() * words.length)] + ' '
      if (tokenCount % TOKEN_BATCH === 0) {
        emitUpdate(io, { id, seq, state: 'decoding', token_count: tokenCount, tokens_text: tokenText })
      }
    }
    result.t3 = Date.now()
    result.decode_ms = result.t3 - result.t2
    result.total_ms = result.t3 - result.t0
    result.token_count = tokenCount
    result.tpot_ms = tokenCount > 0 ? result.decode_ms / tokenCount : 0
    result.finish_reason = cancelled ? 'stopped' : 'stop'
    runLog.info(seq, `done (mock) qa turn total_ms=${result.total_ms} tokens=${tokenCount}`)
    emitUpdate(io, { id, seq, state: 'done', token_count: tokenCount, tokens_text: tokenText, decode_ms: result.decode_ms, tpot_ms: result.tpot_ms, total_ms: result.total_ms, finish_reason: result.finish_reason })
    insertRequest(result)
    return { result, assistantText: tokenText.trim() }
  }

  // Real vLLM mode
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fetch = require('node-fetch') as typeof import('node-fetch').default
  result.t0 = Date.now()

  const controller = new AbortController()
  inflight.add(controller)

  const DECODE_STALL_MS = 30000
  let stallTimer: ReturnType<typeof setTimeout> | null = null
  let stalled = false
  const resetStallTimer = () => {
    if (stallTimer) clearTimeout(stallTimer)
    stallTimer = null
    if (result.t2) {
      stallTimer = setTimeout(() => {
        stalled = true
        runLog.warn(seq, `qa turn decode stall timeout (${DECODE_STALL_MS}ms with no new chunk) — aborting`)
        controller.abort()
      }, DECODE_STALL_MS)
    }
  }

  let tokenText = ''
  try {
    const currentMaxModelLen = await getMaxModelLen(runId)
    const maxTokens = calculateMaxTokens(currentMaxModelLen, userTurnText)
    runLog.debug(seq, `qa turn max_tokens=${maxTokens} (model_len=${currentMaxModelLen})`)
    const res = await fetch(`${VLLM_URL}/v1/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(VLLM_API_KEY ? { Authorization: `Bearer ${VLLM_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model: process.env.MODEL_NAME ?? 'Qwen/Qwen2.5-7B-Instruct',
        messages,
        max_tokens: maxTokens,
        stream: true,
      }),
    })

    result.t1 = Date.now()
    runLog.debug(seq, `qa turn response headers received status=${res.status}`)
    emitUpdate(io, { id, seq, state: 'prefilling' })

    let tokenCount = 0
    let lastBatchTs = Date.now()

    const body = res.body as AsyncIterable<Buffer>
    let sseBuffer = ''
    let sawSentinel = false
    streamLoop: for await (const chunk of body) {
      if (cancelled) break streamLoop
      sseBuffer += chunk.toString()
      const parts = sseBuffer.split('\n')
      sseBuffer = parts.pop() ?? ''
      const lines = parts.filter((l) => l.startsWith('data: '))
      for (const line of lines) {
        const data = line.slice(6).trim()
        if (data === '[DONE]') {
          sawSentinel = true
          runLog.debug(seq, 'qa turn received [DONE] sentinel')
          break streamLoop
        }
        try {
          const parsed = JSON.parse(data) as { choices: Array<{ delta?: { content?: string }; finish_reason?: string }> }
          const text = parsed.choices[0]?.delta?.content ?? ''
          const finishReason = parsed.choices[0]?.finish_reason

          if (!result.t2 && text) {
            result.t2 = Date.now()
            result.ttft_ms = result.t2 - result.t0
            result.prefill_ms = result.t2 - result.t1
            runLog.info(seq, `qa turn first token ttft_ms=${result.ttft_ms}`)
            emitUpdate(io, { id, seq, state: 'decoding', ttft_ms: result.ttft_ms, prefill_ms: result.prefill_ms })
          }

          if (text) {
            tokenCount++
            tokenText += text
            const now = Date.now()
            if (tokenCount % TOKEN_BATCH === 0 || now - lastBatchTs >= TOKEN_BATCH_MS) {
              emitUpdate(io, { id, seq, state: 'decoding', token_count: tokenCount, tokens_text: tokenText })
              lastBatchTs = now
            }
          }

          if (finishReason) {
            sawSentinel = true
            result.finish_reason = finishReason
            runLog.debug(seq, `qa turn finish_reason=${finishReason} received tokens=${tokenCount}`)
          }
        } catch (parseErr) {
          runLog.warn(seq, `qa turn unparsable SSE line, skipped: ${data.slice(0, 100)} err=${String(parseErr)}`)
        }
      }
      resetStallTimer()
      if (result.finish_reason) break streamLoop
    }

    if (!sawSentinel && !cancelled) {
      runLog.warn(seq, `qa turn stream ended WITHOUT [DONE]/finish_reason sentinel — tokens=${tokenCount}`)
    }

    result.t3 = Date.now()
    result.decode_ms   = (result.t2 ? result.t3 - result.t2 : 0)
    result.total_ms    = result.t3 - result.t0
    result.token_count = tokenCount
    result.tpot_ms      = tokenCount > 0 ? result.decode_ms / tokenCount : 0
    if (cancelled && !result.finish_reason) result.finish_reason = 'stopped'
    runLog.info(seq, `done qa turn total_ms=${result.total_ms} tokens=${tokenCount} finish_reason=${result.finish_reason}`)
    emitUpdate(io, { id, seq, state: 'done', token_count: tokenCount, tokens_text: tokenText, decode_ms: result.decode_ms, tpot_ms: result.tpot_ms, total_ms: result.total_ms, finish_reason: result.finish_reason })
  } catch (err) {
    if (stalled) {
      result.finish_reason = 'timeout'
      result.error = 'decode stall timeout exceeded'
      runLog.error(seq, `qa turn timeout: ${result.error}`)
      emitUpdate(io, { id, seq, state: 'error', error: result.error, finish_reason: result.finish_reason })
    } else if (controller.signal.aborted || cancelled) {
      result.finish_reason = 'stopped'
      runLog.info(seq, 'qa turn aborted (stop requested)')
    } else {
      result.error = String(err)
      result.finish_reason = 'error'
      runLog.error(seq, `qa turn request failed: ${result.error}`)
      emitUpdate(io, { id, seq, state: 'error', error: result.error })
    }
  } finally {
    if (stallTimer) clearTimeout(stallTimer)
    inflight.delete(controller)
  }

  insertRequest(result)
  return { result, assistantText: tokenText.trim() }
}

/** Runs one conversation's turns strictly sequentially — turn N always awaits
 *  turn N-1's response before firing, building real chat history via
 *  `messages`. Multiple conversations run concurrently against each other
 *  via the `limit()` gate in runQaConversations below. */
async function runOneConversation(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  runId: string,
  runNumber: number,
  conv: Conversation,
): Promise<RequestResult[]> {
  const messages: ChatMessage[] = []
  const turnResults: RequestResult[] = []
  for (let t = 0; t < conv.turns.length; t++) {
    if (cancelled) break
    messages.push({ role: 'user', content: conv.turns[t] })
    const outcome = await runOneChatTurn(io, runId, runNumber, conv.id, t, messages, 'benchmark')
    if (!outcome) break
    turnResults.push(outcome.result)
    messages.push({ role: 'assistant', content: outcome.assistantText })
  }
  return turnResults
}

/** Dispatches one conversation per concurrency slot (so N conversations run
 *  concurrently up to config.concurrency) while turns within each
 *  conversation run strictly in order. Only used for the benchmark phase —
 *  warmup always uses the flattened view (see flattenConversations) since
 *  priming the KV cache doesn't need real multi-turn history. */
export async function runQaConversations(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  runId: string,
  conversations: Conversation[],
  config: RunConfig,
  runNumber: number,
): Promise<RequestResult[]> {
  const limit = makeLimit(config.concurrency, (running, waiting) => {
    io.emit('scheduler:update', { runId, phase: 'benchmark', running, waiting, concurrency: config.concurrency })
  })

  const results = await Promise.all(
    conversations.map((conv) => limit(() => runOneConversation(io, runId, runNumber, conv)))
  )

  return results.flat()
}

/** Bakes each conversation's prior turns into one independent prompt per turn
 *  (no live chat history, no dependency chain) so qaMode==='flattened' can
 *  reuse the existing runWarmup/runBenchmark single-turn engine unmodified. */
export function flattenConversations(conversations: Conversation[]): Prompt[] {
  const out: Prompt[] = []
  for (const conv of conversations) {
    for (let t = 0; t < conv.turns.length; t++) {
      const context = conv.turns.slice(0, t).map((turn, i) => `Turn ${i + 1}: ${turn}`).join('\n\n')
      const text = context ? `${context}\n\nTurn ${t + 1}: ${conv.turns[t]}` : conv.turns[t]
      out.push({ id: `${conv.id}-t${t}`, text, category: 'random', conversation_id: conv.id, turn_index: t })
    }
  }
  return out
}
