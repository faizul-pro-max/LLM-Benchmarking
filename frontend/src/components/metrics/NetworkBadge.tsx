interface NetworkBadgeProps {
  rtt: number | null
  serverTtft?: number
  clientTtft?: number
}

export function NetworkBadge({ rtt, serverTtft, clientTtft }: NetworkBadgeProps) {
  const overhead = serverTtft != null && clientTtft != null ? clientTtft - serverTtft : null

  return (
    <div className="flex items-center gap-2 text-[10px] text-muted flex-wrap">
      {serverTtft != null && (
        <span>Server TTFT: <span className="text-fg font-mono">{serverTtft}ms</span></span>
      )}
      {clientTtft != null && (
        <span>Client TTFT: <span className="text-fg font-mono">{clientTtft}ms</span></span>
      )}
      {overhead != null && (
        <span>Network overhead: <span className="text-amber-accent font-mono">{overhead}ms</span></span>
      )}
      {rtt != null && (
        <span>RTT: <span className="text-fg font-mono">{rtt}ms</span></span>
      )}
    </div>
  )
}
