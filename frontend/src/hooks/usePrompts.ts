import { useEffect, useState } from 'react'

export interface PromptsInfo {
  /** Where the prompt pool came from. */
  source: 'sheets' | 'local'
  /** Total prompts loaded across all categories. */
  total: number
  /** Count of prompts available per category. */
  byCategory: Record<string, number>
}

const EMPTY: PromptsInfo = { source: 'local', total: 0, byCategory: {} }

/** Fetches /api/prompts once so the UI can show the real loaded count + source
 *  (and per-category availability) instead of a hardcoded label. */
export function usePrompts(): PromptsInfo {
  const [info, setInfo] = useState<PromptsInfo>(EMPTY)

  useEffect(() => {
    let alive = true
    fetch('/api/prompts')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (!alive) return
        setInfo({
          source: d?.source === 'sheets' ? 'sheets' : 'local',
          total: typeof d?.count === 'number' ? d.count : 0,
          byCategory: (d?.byCategory as Record<string, number>) ?? {},
        })
      })
      .catch(() => {
        /* keep defaults — backend may be disconnected (mock mode) */
      })
    return () => {
      alive = false
    }
  }, [])

  return info
}
