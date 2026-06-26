import clsx from 'clsx'
import { useThemeStore } from '@/store/themeStore'

interface HeaderProps {
  connected: boolean
  rtt: number | null
  experimentName: string
  gpuName?: string | null
  chatActive?: boolean
  onChatClick?: () => void
  benchmarksActive?: boolean
  onBenchmarksClick?: () => void
}

export function Header({
  connected,
  rtt,
  experimentName,
  gpuName,
  chatActive,
  onChatClick,
  benchmarksActive,
  onBenchmarksClick,
}: HeaderProps) {
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggle)
  return (
    <header className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-panel shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded bg-blue-accent flex items-center justify-center">
          <span className="text-white text-xs font-bold">LB</span>
        </div>
        <div>
          <div className="text-fg text-sm font-semibold leading-tight">LLM Bench</div>
          <div className="text-muted text-[10px] leading-tight">Inference Observatory</div>
        </div>
      </div>

      {/* GPU + experiment info */}
      <div className="flex items-center gap-2 text-xs">
        <span className="px-2 py-0.5 rounded bg-card border border-border text-muted font-mono">
          {gpuName ?? 'GPU —'}
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
            Network: <span className="text-fg font-mono">{Number(rtt.toFixed(3))}ms</span> RTT
          </span>
        )}
        <button
          onClick={onBenchmarksClick}
          title="View past benchmark runs"
          className={clsx(
            'flex items-center gap-1.5 px-2.5 py-1 rounded border transition-colors font-medium',
            benchmarksActive
              ? 'bg-blue-accent text-white border-blue-accent hover:bg-blue-600'
              : 'bg-blue-accent/15 border-blue-accent/40 text-blue-accent hover:bg-blue-accent/25'
          )}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3v18h18" />
            <rect x="7" y="11" width="3" height="6" />
            <rect x="12" y="7" width="3" height="10" />
            <rect x="17" y="13" width="3" height="4" />
          </svg>
          Benchmarks
        </button>
        <button
          onClick={onChatClick}
          title={chatActive ? 'Back to benchmark' : 'Chat with the connected model'}
          className={clsx(
            'flex items-center gap-1.5 px-2.5 py-1 rounded border transition-colors font-medium',
            chatActive
              ? 'bg-green-accent text-white border-green-accent hover:bg-green-600'
              : 'bg-green-accent/15 border-green-accent/40 text-green-accent hover:bg-green-accent/25'
          )}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
          {chatActive ? 'Benchmark' : 'Chat'}
        </button>
        <button
          onClick={toggleTheme}
          aria-label="Toggle theme"
          title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
          className="w-7 h-7 rounded border border-border bg-card text-muted hover:text-fg flex items-center justify-center transition-colors"
        >
          {theme === 'dark' ? (
            // sun icon
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
            </svg>
          ) : (
            // moon icon
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>
      </div>
    </header>
  )
}
