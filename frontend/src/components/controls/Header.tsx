import clsx from 'clsx'

interface HeaderProps {
  connected: boolean
  rtt: number | null
  experimentName: string
}

export function Header({ connected, rtt, experimentName }: HeaderProps) {
  return (
    <header className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-panel shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded bg-blue-accent flex items-center justify-center">
          <span className="text-white text-xs font-bold">LB</span>
        </div>
        <div>
          <div className="text-white text-sm font-semibold leading-tight">LLM Bench</div>
          <div className="text-muted text-[10px] leading-tight">Inference Observatory</div>
        </div>
      </div>

      {/* GPU + experiment info */}
      <div className="flex items-center gap-2 text-xs">
        <span className="px-2 py-0.5 rounded bg-card border border-border text-muted font-mono">
          A100 80GB · Vast.ai
        </span>
        <span className="text-border">·</span>
        <span className="px-2 py-0.5 rounded bg-card border border-blue-accent/40 text-blue-accent font-medium">
          {experimentName}
        </span>
      </div>

      {/* Connection status + RTT */}
      <div className="flex items-center gap-3 text-xs">
        <div className="flex items-center gap-1.5">
          <span
            className={clsx(
              'w-1.5 h-1.5 rounded-full',
              connected ? 'bg-green-accent animate-pulse' : 'bg-red-accent'
            )}
          />
          <span className={connected ? 'text-green-accent' : 'text-red-accent'}>
            {connected ? 'WebSocket Live' : 'Disconnected'}
          </span>
        </div>
        {rtt != null && (
          <span className="text-muted">
            Network: <span className="text-white font-mono">{rtt}ms</span> RTT
          </span>
        )}
      </div>
    </header>
  )
}
