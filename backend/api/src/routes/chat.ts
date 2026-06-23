import { Router } from 'express'
import { z } from 'zod'

const router = Router()

const VLLM_URL     = process.env.VLLM_URL ?? ''
const VLLM_API_KEY = process.env.VLLM_API_KEY ?? ''
const MODEL_NAME   = process.env.MODEL_NAME ?? 'Qwen/Qwen2.5-7B-Instruct'

const ChatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant']),
        content: z.string(),
      })
    )
    .min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(4096).optional(),
})

// SSE event protocol (one JSON object per `data:` line):
//   { type: 'token', text }                                  — a streamed delta
//   { type: 'done', ttft_ms, total_ms, tokens, tps }         — final metrics
//   { type: 'error', error }                                 — failure
router.post('/', async (req, res) => {
  const parsed = ChatSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const { messages, temperature = 0.7, maxTokens = 512 } = parsed.data

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  const send = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`)

  const t0 = Date.now()
  let ttft = 0
  let tokens = 0

  // Mock mode — lets the chat UI work with no GPU connected
  if (!VLLM_URL) {
    const reply =
      "This is a mock reply (VLLM_URL is not set). Connect a vLLM server to chat with a real model. " +
      'Token timing and throughput will be measured per message so you can feel the latency.'
    for (const word of reply.split(' ')) {
      await new Promise((r) => setTimeout(r, 35))
      if (!ttft) ttft = Date.now() - t0
      tokens++
      send({ type: 'token', text: word + ' ' })
    }
    const total = Date.now() - t0
    send({ type: 'done', ttft_ms: ttft, total_ms: total, tokens, tps: tokens / (total / 1000 || 1) })
    res.end()
    return
  }

  const controller = new AbortController()
  req.on('close', () => controller.abort())

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fetch = require('node-fetch') as typeof import('node-fetch').default
    const upstream = await fetch(`${VLLM_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(VLLM_API_KEY ? { Authorization: `Bearer ${VLLM_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
        stream_options: { include_usage: true },
      }),
      signal: controller.signal,
    } as Parameters<typeof fetch>[1])

    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text().catch(() => '')
      send({ type: 'error', error: `vLLM ${upstream.status}: ${errText.slice(0, 200)}` })
      res.end()
      return
    }

    let buf = ''
    for await (const chunk of upstream.body as AsyncIterable<Buffer>) {
      buf += chunk.toString()
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        const l = line.trim()
        if (!l.startsWith('data:')) continue
        const data = l.slice(5).trim()
        if (data === '[DONE]') continue
        try {
          const j = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>
            usage?: { completion_tokens?: number }
          }
          const delta = j.choices?.[0]?.delta?.content ?? ''
          if (delta) {
            if (!ttft) ttft = Date.now() - t0
            tokens++
            send({ type: 'token', text: delta })
          }
          // Final usage chunk (stream_options.include_usage) — authoritative token count
          if (j.usage?.completion_tokens != null) tokens = j.usage.completion_tokens
        } catch {
          /* ignore non-JSON keepalive lines */
        }
      }
    }

    const total = Date.now() - t0
    send({ type: 'done', ttft_ms: ttft, total_ms: total, tokens, tps: tokens / (total / 1000 || 1) })
    res.end()
  } catch (err) {
    if (!controller.signal.aborted) {
      send({ type: 'error', error: String(err) })
    }
    res.end()
  }
})

export default router
