import { useEffect, useState } from 'react'

/** Row shape returned by GET /api/chat/session/:id */
export interface ChatSessionRow {
  role: 'user' | 'assistant'
  content: string
  ttft_ms: number | null
  total_ms: number | null
  tokens: number | null
  tps: number | null
  created_at: number
}

export interface ChatSessionResponse {
  sessionId: string
  messages: ChatSessionRow[]
}

function uuidv4(): string {
  // crypto.randomUUID is available in all modern browsers and Node 16+.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback RFC4122 v4 generator.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0
    const v = ch === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/** Reads (or lazily creates) a chat session id from the `?session=` query param,
 *  writing it back into the URL via replaceState (no history entry, no reload). */
export function useChatSessionId(): string {
  const [sessionId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search)
    const existing = params.get('session')
    if (existing) return existing
    const fresh = uuidv4()
    params.set('session', fresh)
    const url = `${window.location.pathname}?${params.toString()}${window.location.hash}`
    window.history.replaceState(null, '', url)
    return fresh
  })

  return sessionId
}

/** Fetches the persisted history for a session. Returns null while loading and
 *  an empty array on any failure (so the UI just starts a blank conversation). */
export function useChatHistory(sessionId: string): ChatSessionRow[] | null {
  const [rows, setRows] = useState<ChatSessionRow[] | null>(null)

  useEffect(() => {
    let alive = true
    setRows(null)
    ;(async () => {
      try {
        const res = await fetch(`/api/chat/session/${sessionId}`)
        if (!res.ok) throw new Error(String(res.status))
        const data: ChatSessionResponse = await res.json()
        if (!alive) return
        setRows(Array.isArray(data?.messages) ? data.messages : [])
      } catch {
        if (alive) setRows([])
      }
    })()
    return () => {
      alive = false
    }
  }, [sessionId])

  return rows
}
