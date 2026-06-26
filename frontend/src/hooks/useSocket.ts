import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { useMetricsStore } from '@/store/metricsStore'
import { useRunStore } from '@/store/runStore'
import type { MetricsSnapshot, RequestUpdate } from '@/types/metrics'
import type { AggregatedResult, WarmupTtft } from '@/types/experiment'

export interface SocketState {
  connected: boolean
  rtt: number | null
  socket: Socket | null
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
    const { updateRequest, addWarmupTtft, setPhase, completeRun } = useRunStore.getState()

    socket.on('connect', () => setConnected(true))
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

    socket.on('phase:change', ({ phase }: { phase: string; runId: string }) => {
      setPhase(phase as Parameters<typeof setPhase>[0])
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
