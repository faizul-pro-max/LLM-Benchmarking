import { useCallback, useEffect, useState } from 'react'

export interface WorkloadDatasetStatus {
  loaded: boolean
  cachedOnDisk: boolean
  source: 'huggingface' | 'none'
  repoId: string
  config: string
  split: string
  count: number
  downloadedAt: number | null
}

export type DatasetStatus = Record<'short' | 'long' | 'qa', WorkloadDatasetStatus>

const EMPTY_ENTRY: WorkloadDatasetStatus = {
  loaded: false,
  cachedOnDisk: false,
  source: 'none',
  repoId: '',
  config: '',
  split: '',
  count: 0,
  downloadedAt: null,
}

const EMPTY: DatasetStatus = { short: EMPTY_ENTRY, long: EMPTY_ENTRY, qa: EMPTY_ENTRY }

/** Fetches /api/datasets/status so the UI can show whether each workload's
 *  HuggingFace dataset has been loaded yet (and what it is), mirroring
 *  usePrompts.ts's category-pool info fetch. `reload()` refetches — call it
 *  after a successful POST /api/datasets/load. */
export function useDatasetStatus() {
  const [status, setStatus] = useState<DatasetStatus>(EMPTY)
  const [loading, setLoading] = useState(false)

  const reload = useCallback(() => {
    let alive = true
    setLoading(true)
    fetch('/api/datasets/status')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (!alive) return
        setStatus(d as DatasetStatus)
      })
      .catch(() => {
        /* keep previous state — backend may be disconnected */
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => reload(), [reload])

  return { status, loading, reload }
}
