import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { useMetricsStore } from '@/store/metricsStore'
import { useRunStore } from '@/store/runStore'
import type { MetricsSnapshot, RequestUpdate, SchedulerUpdate } from '@/types/metrics'
import type { AggregatedResult, WarmupTtft } from '@/types/experiment'

export interface SocketState {
  connected: boolean
  rtt: number | null
  socket: Socket | null
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Persisted request rows are written the instant each request finishes (see
// loadGenerator.ts insertRequest), so they're always authoritative — used to
// patch any card whose live socket update was silently dropped (e.g. a
// disconnect/reconnect with no event replay left it stuck on a stale state
// like "decoding" even though the backend genuinely finished it).
//
// Called from only two triggers (socket 'connect' and the run's terminal
// phase:change) — once the run reaches complete/stopped/error, no further
// events will ever be emitted for it, so this is the last chance to patch a
// stuck card. The reconnect that leads here often happens on the same flaky
// network path that caused the disconnect in the first place, so a bare
// single-shot fetch can itself transiently fail right when it matters most.
// Retry a few times with backoff instead of silently burning that one shot.
async function reconcileRun(runId: string): Promise<void> {
  const delays = [0, 300, 1000, 2500]
  for (const delay of delays) {
    if (delay) await sleep(delay)
    try {
      const res = await fetch(`/api/results/${runId}/requests`)
      if (!res.ok) continue
      const rows = await res.json()
      if (Array.isArray(rows)) {
        useRunStore.getState().reconcileFromPersisted(rows)
      }
      return
    } catch {
      // Transient — fall through to the next retry.
    }
  }
}

export function useSocket(): SocketState {
  const socketRef = useRef<Socket | null>(null)
  const [connected, setConnected] = useState(false)
  const [rtt, setRtt] = useState<number | null>(null)

  useEffect(() => {
    const socket = io('/', {
      transports: ['websocket'],
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    })
    socketRef.current = socket

    const { addSnapshot } = useMetricsStore.getState()
    const { updateRequest, addWarmupTtft, setPhase, completeRun, setSchedulerUpdate } =
      useRunStore.getState()

    socket.on('connect', () => {
      setConnected(true)
      // Fires on the initial connect (no-op, store is empty) AND on every
      // reconnect (where it matters) — catches up on anything the dropped
      // connection missed for the run currently in view.
      const { runId } = useRunStore.getState()
      if (runId) void reconcileRun(runId)
    })
    socket.on('disconnect', () => setConnected(false))

    // Note: do NOT derive rtt here. `Date.now() - data.ts` is clock-offset plus
    // transport, not a true round trip. The `ping` round-trip below owns rtt.
    socket.on('metrics:snapshot', (data: MetricsSnapshot) => {
      addSnapshot(data)
    })

    socket.on('request:update', (data: RequestUpdate) => {
      updateRequest(data)
    })

    socket.on('warmup:ttft', (data: WarmupTtft) => {
      addWarmupTtft(data)
    })

    socket.on('scheduler:update', (data: SchedulerUpdate) => {
      setSchedulerUpdate(data)
    })

    socket.on('phase:change', ({ phase, runId, network_rtt_ms }: { phase: string; runId: string; network_rtt_ms?: number | null }) => {
      setPhase(phase as Parameters<typeof setPhase>[0], network_rtt_ms)
      // Final safety net: whatever caused a card to miss its live update, the
      // run reaching a terminal phase is the last guaranteed chance to patch
      // it from the authoritative persisted rows before the pipeline goes away.
      if (phase === 'complete' || phase === 'stopped' || phase === 'error') {
        void reconcileRun(runId)
      }
    })

    socket.on('run:complete', ({ summary }: { runId: string; summary: AggregatedResult }) => {
      completeRun(summary)
    })

    // Measure RTT via ping
    const pingInterval = setInterval(() => {
      const t = Date.now()
      socket.emit('ping', () => setRtt(Date.now() - t))
    }, 5000)

    return () => {
      clearInterval(pingInterval)
      socket.disconnect()
    }
  }, [])

  return { connected, rtt, socket: socketRef.current }
}
