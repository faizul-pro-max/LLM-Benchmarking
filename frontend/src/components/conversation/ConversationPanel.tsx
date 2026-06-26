import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { useChatSessionId, useChatHistory } from '@/hooks/useChatSession'
import type { ChatSessionRow } from '@/hooks/useChatSession'

interface ConversationPanelProps {
  onClose: () => void
  model: string | null
  /** Whether the model is currently reachable (already debounced upstream). */
  vllmOk: boolean
  /** Active session id, driven by App (New / Continue). When provided it is the
   *  source of truth; when omitted the hook falls back to the URL param. */
  sessionId?: string | null
}

interface TurnMetrics {
  ttft_ms: number
  total_ms: number
  tokens: number
  tps: number
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  metrics?: TurnMetrics
  streaming?: boolean
}

function rowToMessage(row: ChatSessionRow): ChatMessage {
  const hasMetrics =
    row.role === 'assistant' &&
    (row.ttft_ms != null || row.total_ms != null || row.tokens != null || row.tps != null)
  return {
    role: row.role,
    content: row.content,
    metrics: hasMetrics
      ? {
          ttft_ms: row.ttft_ms ?? 0,
          total_ms: row.total_ms ?? 0,
          tokens: row.tokens ?? 0,
          tps: row.tps ?? 0,
        }
      : undefined,
  }
}

export function ConversationPanel({ onClose, model, vllmOk, sessionId: externalId }: ConversationPanelProps) {
  const [sessionId] = useChatSessionId(externalId)
  const history = useChatHistory(sessionId)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Switching sessions resets the visible conversation; persisted history (if any)
  // re-populates it via the effect below once it loads.
  useEffect(() => {
    setMessages([])
  }, [sessionId])

  // Load persisted history once it arrives (only if the user hasn't started typing/sending).
  useEffect(() => {
    if (history && history.length > 0) {
      setMessages(history.map(rowToMessage))
    }
  }, [history])

  // Auto-scroll to the latest message
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const updateLastAssistant = (fn: (m: ChatMessage) => ChatMessage) => {
    setMessages((prev) => {
      const next = [...prev]
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].role === 'assistant') {
          next[i] = fn(next[i])
          break
        }
      }
      return next
    })
  }

  const send = async () => {
    const text = input.trim()
    if (!text || busy) return

    const history: ChatMessage[] = [...messages, { role: 'user', content: text }]
    setMessages([...history, { role: 'assistant', content: '', streaming: true }])
    setInput('')
    setBusy(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop() ?? ''
        for (const part of parts) {
          const line = part.split('\n').find((l) => l.startsWith('data:'))
          if (!line) continue
          let evt: { type: string; text?: string; error?: string } & Partial<TurnMetrics>
          try {
            evt = JSON.parse(line.slice(5).trim())
          } catch {
            continue
          }
          if (evt.type === 'token' && evt.text) {
            updateLastAssistant((m) => ({ ...m, content: m.content + evt.text }))
          } else if (evt.type === 'done') {
            updateLastAssistant((m) => ({
              ...m,
              streaming: false,
              metrics: {
                ttft_ms: evt.ttft_ms ?? 0,
                total_ms: evt.total_ms ?? 0,
                tokens: evt.tokens ?? 0,
                tps: evt.tps ?? 0,
              },
            }))
          } else if (evt.type === 'error') {
            updateLastAssistant((m) => ({
              ...m,
              streaming: false,
              content: m.content + `\n\n⚠️ ${evt.error}`,
            }))
          }
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        updateLastAssistant((m) => ({ ...m, streaming: false, content: m.content + `\n\n⚠️ ${String(err)}` }))
      }
    } finally {
      updateLastAssistant((m) => ({ ...m, streaming: false }))
      setBusy(false)
      abortRef.current = null
    }
  }

  const stop = () => abortRef.current?.abort()

  const clear = async () => {
    setMessages([])
    try {
      await fetch(`/api/chat/session/${sessionId}`, { method: 'DELETE' })
    } catch {
      // backend not up yet — local clear already happened
    }
  }

  return (
    <div className="h-full flex flex-col bg-panel border-r border-border overflow-hidden">
      {/* header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <span
            className={clsx(
              'w-2 h-2 rounded-full',
              vllmOk ? 'bg-green-accent animate-pulse' : 'bg-amber-500'
            )}
          />
          <div>
            <div className="text-fg text-sm font-semibold leading-tight">Chat</div>
            <div className="text-muted text-[10px] leading-tight font-mono">
              {vllmOk ? (model ?? 'model') : 'model offline — retrying'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={clear}
              className="text-[11px] text-muted hover:text-fg px-2 py-1 rounded border border-border"
            >
              Clear
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Back to benchmark"
            className="flex items-center gap-1 text-[11px] text-muted hover:text-fg px-2 py-1 rounded border border-border"
          >
            ← Benchmark
          </button>
        </div>
      </div>

      {/* messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted text-xs gap-1">
            <span className="text-2xl">💬</span>
            <span>Send a message to start chatting.</span>
            <span className="text-[10px]">Each reply shows TTFT and tokens/sec so you can feel the latency.</span>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={clsx('flex flex-col gap-1', m.role === 'user' ? 'items-end' : 'items-start')}>
            <div
              className={clsx(
                'max-w-[85%] rounded-lg px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap break-words',
                m.role === 'user'
                  ? 'bg-blue-accent text-white'
                  : 'bg-card border border-border text-fg'
              )}
            >
              {m.content || (m.streaming ? '▍' : '')}
            </div>
            {m.role === 'assistant' && m.metrics && (
              <div className="text-[10px] text-muted font-mono px-1">
                TTFT {Math.round(m.metrics.ttft_ms)}ms · {m.metrics.tokens} tok ·{' '}
                {m.metrics.tps.toFixed(1)} tok/s · {(m.metrics.total_ms / 1000).toFixed(2)}s
              </div>
            )}
          </div>
        ))}
      </div>

      {/* input */}
      <div className="border-t border-border p-3 shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            rows={1}
            placeholder="Type a message…  (Enter to send, Shift+Enter for newline)"
            className="flex-1 resize-none bg-card border border-border rounded px-3 py-2 text-[13px] text-fg placeholder:text-muted outline-none focus:border-blue-accent/60 max-h-32"
          />
          {busy ? (
            <button
              onClick={stop}
              className="px-3 py-2 text-xs font-semibold rounded border border-border text-muted hover:text-red-accent hover:border-red-accent transition-colors"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={send}
              disabled={!input.trim()}
              className="px-4 py-2 text-xs font-semibold rounded bg-green-accent text-white hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
