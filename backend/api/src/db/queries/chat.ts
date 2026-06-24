import db from '../connection'

export type ChatRole = 'user' | 'assistant'

export interface ChatMessageRow {
  role: ChatRole
  content: string
  ttft_ms: number | null
  total_ms: number | null
  tokens: number | null
  tps: number | null
  created_at: number
}

export interface InsertChatMessageInput {
  session_id: string
  role: ChatRole
  content: string
  ttft_ms?: number | null
  total_ms?: number | null
  tokens?: number | null
  tps?: number | null
}

// INSERT OR IGNORE the session row; if a title is supplied and the session has
// no title yet, set it. Always bump updated_at.
export function ensureSession(id: string, title?: string): void {
  const now = Date.now()
  db.prepare(`
    INSERT OR IGNORE INTO chat_sessions (id, title, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `).run(id, title ?? null, now, now)

  if (title) {
    db.prepare(`
      UPDATE chat_sessions
      SET title = COALESCE(title, ?), updated_at = ?
      WHERE id = ?
    `).run(title, now, id)
  } else {
    db.prepare(`UPDATE chat_sessions SET updated_at = ? WHERE id = ?`).run(now, id)
  }
}

export function insertChatMessage(msg: InsertChatMessageInput): void {
  db.prepare(`
    INSERT INTO chat_messages
      (session_id, role, content, ttft_ms, total_ms, tokens, tps)
    VALUES
      (?, ?, ?, ?, ?, ?, ?)
  `).run(
    msg.session_id,
    msg.role,
    msg.content,
    msg.ttft_ms ?? null,
    msg.total_ms ?? null,
    msg.tokens ?? null,
    msg.tps ?? null
  )
}

export function getSessionMessages(sessionId: string): ChatMessageRow[] {
  return db.prepare(`
    SELECT role, content, ttft_ms, total_ms, tokens, tps, created_at
    FROM chat_messages
    WHERE session_id = ?
    ORDER BY id ASC
  `).all(sessionId) as ChatMessageRow[]
}

export function clearSession(sessionId: string): void {
  db.prepare(`DELETE FROM chat_messages WHERE session_id = ?`).run(sessionId)
}
