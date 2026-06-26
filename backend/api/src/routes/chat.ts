import { Router } from 'express'
import { z } from 'zod'
import {
  ensureSession,
  insertChatMessage,
  getSessionMessages,
  clearSession,
} from '../db/queries/chat'
import { getSnapshotsByChatSession } from '../db/queries/snapshots'

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
  sessionId: z.string().uuid().optional(),
})

// SSE event protocol (one JSON object per `data:` line):
//   { type: 'token', text }                                  — a streamed delta
//   { type: 'progress', tokens, tps }                        — interim throughput (safe to ignore)
//   { type: 'done', ttft_ms, total_ms, tokens, tps }         — final metrics
//   { type: 'error', error }                                 — failure
//
// The 'progress' event is additive: existing consumers read type/text on tokens
// and the metrics on 'done'. It carries a running tok/s so a reply reflects live
// decode speed while streaming, not only a final number. Emitted at most once per
// PROGRESS_INTERVAL_MS so it stays lightweight.
const PROGRESS_INTERVAL_MS = 250
router.post('/', async (req, res) => {
  const parsed = ChatSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const { messages, temperature = 0.7, maxTokens = 512, sessionId } = parsed.data

  // Persist the new user turn before streaming starts (best-effort).
  // The last message in the array is the new user turn the frontend just added.
  const lastMessage = messages[messages.length - 1]
  const lastUserContent =
    lastMessage && lastMessage.role === 'user' ? lastMessage.content : ''
  if (sessionId) {
    try {
      const title = lastUserContent.slice(0, 60) || undefined
      ensureSession(sessionId, title)
      if (lastUserContent) {
        insertChatMessage({ session_id: sessionId, role: 'user', content: lastUserContent })
      }
    } catch (err) {
      console.log({ msg: 'chat persist user failed', sessionId, err: String(err), ts: Date.now() })
    }
  }

  // Accumulate streamed assistant text so we can persist the full reply on `done`.
  let assistantText = ''
  const persistAssistant = (ttft_ms: number, total_ms: number, tokenCount: number, tps: number) => {
    if (!sessionId) return
    try {
      insertChatMessage({
        session_id: sessionId,
        role: 'assistant',
        content: assistantText,
        ttft_ms,
        total_ms,
        tokens: tokenCount,
        tps,
      })
    } catch (err) {
      console.log({ msg: 'chat persist assistant failed', sessionId, err: String(err), ts: Date.now() })
    }
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  const send = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`)

  const t0 = Date.now()
  let ttft = 0
  let tokens = 0
  let lastProgressTs = 0

  // Emit an interim throughput event, throttled to PROGRESS_INTERVAL_MS. Running
  // tok/s is measured from first token (ttft) so it reflects decode speed, not the
  // initial prefill wait. No-op until at least one token has arrived.
  const maybeEmitProgress = (now: number) => {
    if (!ttft || tokens === 0) return
    if (now - lastProgressTs < PROGRESS_INTERVAL_MS) return
    lastProgressTs = now
    const decodeMs = now - (t0 + ttft)
    const tps = decodeMs > 0 ? tokens / (decodeMs / 1000) : 0
    send({ type: 'progress', tokens, tps })
  }

  // Mock mode — lets the chat UI work with no GPU connected
  if (!VLLM_URL) {
    const reply =
      "This is a mock reply (VLLM_URL is not set). Connect a vLLM server to chat with a real model. " +
      'Token timing and throughput will be measured per message so you can feel the latency.'
    for (const word of reply.split(' ')) {
      await new Promise((r) => setTimeout(r, 35))
      const now = Date.now()
      if (!ttft) ttft = now - t0
      tokens++
      const text = word + ' '
      assistantText += text
      send({ type: 'token', text })
      maybeEmitProgress(now)
    }
    const total = Date.now() - t0
    const tps = tokens / (total / 1000 || 1)
    send({ type: 'done', ttft_ms: ttft, total_ms: total, tokens, tps })
    persistAssistant(ttft, total, tokens, tps)
    res.end()
    return
  }

  // Abort the upstream call only if the client actually disconnects mid-stream.
  // (Listen on res, not req — req 'close' fires as soon as the POST body is read.)
  const controller = new AbortController()
  res.on('close', () => {
    if (!res.writableEnded) controller.abort()
  })

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
            const now = Date.now()
            if (!ttft) ttft = now - t0
            tokens++
            assistantText += delta
            send({ type: 'token', text: delta })
            maybeEmitProgress(now)
          }
          // Final usage chunk (stream_options.include_usage) — authoritative token count
          if (j.usage?.completion_tokens != null) tokens = j.usage.completion_tokens
        } catch {
          /* ignore non-JSON keepalive lines */
        }
      }
    }

    const total = Date.now() - t0
    const tps = tokens / (total / 1000 || 1)
    send({ type: 'done', ttft_ms: ttft, total_ms: total, tokens, tps })
    persistAssistant(ttft, total, tokens, tps)
    res.end()
  } catch (err) {
    if (!controller.signal.aborted) {
      send({ type: 'error', error: String(err) })
    }
    res.end()
  }
})

// GET /chat/session/:id — load a conversation. Missing session => empty (200).
router.get('/session/:id', (req, res) => {
  const id = req.params.id
  try {
    const messages = getSessionMessages(id)
    res.json({ sessionId: id, messages })
  } catch (err) {
    console.log({ msg: 'chat get session failed', sessionId: id, err: String(err), ts: Date.now() })
    res.json({ sessionId: id, messages: [] })
  }
})

// GET /chat/session/:id/metrics — persisted GPU/vLLM snapshots captured while
// this chat session was active, ordered by ts. Missing session => empty (200).
router.get('/session/:id/metrics', (req, res) => {
  const id = req.params.id
  try {
    const snapshots = getSnapshotsByChatSession(id)
    res.json({ sessionId: id, snapshots })
  } catch (err) {
    console.log({ msg: 'chat get session metrics failed', sessionId: id, err: String(err), ts: Date.now() })
    res.json({ sessionId: id, snapshots: [] })
  }
})

// DELETE /chat/session/:id — clear messages, keep the session row.
router.delete('/session/:id', (req, res) => {
  const id = req.params.id
  try {
    clearSession(id)
    res.json({ ok: true })
  } catch (err) {
    console.log({ msg: 'chat clear session failed', sessionId: id, err: String(err), ts: Date.now() })
    res.status(500).json({ ok: false })
  }
})

export default router
