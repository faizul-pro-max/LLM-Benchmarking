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

/** Writes `id` into the `?session=` query param via replaceState (no history
 *  entry, no reload). Exported so callers can keep the URL in sync. */
export function writeSessionToUrl(id: string): void {
  const params = new URLSearchParams(window.location.search)
  params.set('session', id)
  const url = `${window.location.pathname}?${params.toString()}${window.location.hash}`
  window.history.replaceState(null, '', url)
}

/** Mints a fresh chat session id, writes it to the URL, and returns it. */
export function newChatSession(): string {
  const fresh = uuidv4()
  writeSessionToUrl(fresh)
  return fresh
}

/** Reads (or lazily creates) a chat session id from the `?session=` query param,
 *  writing it back into the URL via replaceState (no history entry, no reload).
 *
 *  When `externalId` is provided it becomes the source of truth — this lets a
 *  parent component (App) drive the active session (e.g. "New"/"Continue").
 *  The setter is returned so the hook can also be used standalone. */
export function useChatSessionId(externalId?: string | null): [string, (id: string) => void] {
  const [sessionId, setSessionId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search)
    const existing = params.get('session')
    if (existing) return existing
    return newChatSession()
  })

  // Follow an externally-driven id (App owns the active session).
  useEffect(() => {
    if (externalId && externalId !== sessionId) {
      writeSessionToUrl(externalId)
      setSessionId(externalId)
    }
  }, [externalId, sessionId])

  return [sessionId, setSessionId]
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
