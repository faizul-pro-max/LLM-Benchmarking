import { v4 as uuidv4 } from 'uuid'
import { Server } from 'socket.io'
import { insertRequest } from '../db/queries/requests'
import type { RequestResult, RunConfig } from '../types/run'
import type { ServerToClientEvents, ClientToServerEvents } from '../types/socket'
import type { Prompt } from './sheetsLoader'

const VLLM_URL       = process.env.VLLM_URL ?? ''
const VLLM_API_KEY   = process.env.VLLM_API_KEY ?? ''
const TOKEN_BATCH    = 5
const TOKEN_BATCH_MS = 100

function makeLimit(concurrency: number) {
  let active = 0
  const queue: Array<() => void> = []
  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const run = () => {
        active++
        fn().then(resolve, reject).finally(() => {
          active--
          if (queue.length) queue.shift()!()
        })
      }
      if (active < concurrency) run()
      else queue.push(run)
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
): Promise<RequestResult> {
  const id = uuidv4()
  const result: RequestResult = {
    id,
    run_id: runId,
    run_number: runNumber,
    prompt_id: prompt.id,
    category: prompt.category as RequestResult['category'],
    phase,
    prompt_text: prompt.text,
    token_count: 0,
  }

  emitUpdate(io, {
    id,
    state: 'queued',
    prompt_text: prompt.text,
    prompt_id: prompt.id,
    category: prompt.category as RequestResult['category'],
  })

  if (!VLLM_URL) {
    // Mock mode — simulate timing
    const mockDelay = (ms: number) => new Promise((r) => setTimeout(r, ms))
    result.t0 = Date.now()
    await mockDelay(50)
    result.t1 = Date.now()
    emitUpdate(io, { id, state: 'prefilling' })
    await mockDelay(Math.random() * 300 + 100)
    result.t2 = Date.now()
    result.ttft_ms = result.t2 - result.t0
    result.prefill_ms = result.t2 - result.t1
    emitUpdate(io, { id, state: 'decoding', ttft_ms: result.ttft_ms })

    if (phase === 'warmup') {
      io.emit('warmup:ttft', { req: reqIndex, ttft_ms: result.ttft_ms })
    }

    let tokenCount = 0
    let tokenText = ''
    const totalTokens = Math.floor(Math.random() * 150 + 50)
    const words = ['inference', 'model', 'token', 'cache', 'GPU', 'latency', 'batch', 'prefill', 'decode', 'attention']
    while (tokenCount < totalTokens) {
      await mockDelay(8)
      tokenCount++
      tokenText += words[Math.floor(Math.random() * words.length)] + ' '
      if (tokenCount % TOKEN_BATCH === 0) {
        emitUpdate(io, { id, state: 'decoding', token_count: tokenCount, tokens_text: tokenText })
      }
    }
    result.t3 = Date.now()
    result.decode_ms = result.t3 - result.t2
    result.total_ms  = result.t3 - result.t0
    result.token_count = tokenCount
    result.tpot_ms = result.decode_ms / tokenCount
    result.finish_reason = 'stop'
    emitUpdate(io, { id, state: 'done', token_count: tokenCount, tokens_text: tokenText, tpot_ms: result.tpot_ms, total_ms: result.total_ms, finish_reason: 'stop' })
    return result
  }

  // Real vLLM mode
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fetch = require('node-fetch') as typeof import('node-fetch').default
  result.t0 = Date.now()

  try {
    const res = await fetch(`${VLLM_URL}/v1/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(VLLM_API_KEY ? { Authorization: `Bearer ${VLLM_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model: process.env.MODEL_NAME ?? 'Qwen/Qwen2.5-7B-Instruct',
        prompt: prompt.text,
        max_tokens: 256,
        stream: true,
      }),
    })

    result.t1 = Date.now()
    emitUpdate(io, { id, state: 'prefilling' })

    let tokenCount = 0
    let tokenText  = ''
    let lastBatchTs = Date.now()

    const body = res.body as AsyncIterable<Buffer>
    for await (const chunk of body) {
      const lines = chunk.toString().split('\n').filter((l) => l.startsWith('data: '))
      for (const line of lines) {
        const data = line.slice(6).trim()
        if (data === '[DONE]') break
        try {
          const parsed = JSON.parse(data) as { choices: Array<{ text: string; finish_reason?: string }> }
          const text = parsed.choices[0]?.text ?? ''
          const finishReason = parsed.choices[0]?.finish_reason

          if (!result.t2 && text) {
            result.t2 = Date.now()
            result.ttft_ms = result.t2 - result.t0
            result.prefill_ms = result.t2 - result.t1
            emitUpdate(io, { id, state: 'decoding', ttft_ms: result.ttft_ms })
            if (phase === 'warmup') {
              io.emit('warmup:ttft', { req: reqIndex, ttft_ms: result.ttft_ms })
            }
          }

          tokenCount++
          tokenText += text
          const now = Date.now()
          if (tokenCount % TOKEN_BATCH === 0 || now - lastBatchTs >= TOKEN_BATCH_MS) {
            emitUpdate(io, { id, state: 'decoding', token_count: tokenCount, tokens_text: tokenText })
            lastBatchTs = now
          }

          if (finishReason) {
            result.finish_reason = finishReason
          }
        } catch { /* non-JSON line */ }
      }
    }

    result.t3 = Date.now()
    result.decode_ms   = (result.t2 ? result.t3 - result.t2 : 0)
    result.total_ms    = result.t3 - result.t0
    result.token_count = tokenCount
    result.tpot_ms     = tokenCount > 0 ? result.decode_ms / tokenCount : 0
    emitUpdate(io, { id, state: 'done', token_count: tokenCount, tokens_text: tokenText, tpot_ms: result.tpot_ms, total_ms: result.total_ms, finish_reason: result.finish_reason })
  } catch (err) {
    result.error = String(err)
    result.finish_reason = 'error'
    emitUpdate(io, { id, state: 'error', error: result.error })
  }

  return result
}

export async function runWarmup(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  runId: string,
  prompts: Prompt[],
  concurrency: number,
): Promise<RequestResult[]> {
  const count = parseInt(process.env.WARMUP_REQUEST_COUNT ?? '20', 10)
  const warmupPrompts = prompts.slice(0, count)
  const limit = makeLimit(concurrency)

  const results = await Promise.all(
    warmupPrompts.map((p, i) =>
      limit(() => runSingleRequest(io, runId, 0, p, 'warmup', i))
    )
  )

  results.forEach((r: RequestResult) => insertRequest(r))
  return results
}

export async function runBenchmark(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  runId: string,
  prompts: Prompt[],
  config: RunConfig,
  runNumber: number,
): Promise<RequestResult[]> {
  const limit = makeLimit(config.concurrency)

  const results = await Promise.all(
    prompts.map((p, i) =>
      limit(() => runSingleRequest(io, runId, runNumber, p, 'benchmark', i))
    )
  )

  results.forEach((r: RequestResult) => insertRequest(r))
  return results
}
