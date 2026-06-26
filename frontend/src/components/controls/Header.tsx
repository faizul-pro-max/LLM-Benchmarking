import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { useThemeStore } from '@/store/themeStore'

interface HeaderProps {
  connected: boolean
  rtt: number | null
  experimentName: string
  experimentSummary?: string | null
  gpuName?: string | null
  /** Live model the connected vLLM server is serving (from /api/health). */
  model?: string | null
  chatActive?: boolean
  onChatClick?: () => void
  /** Start a brand-new chat session (resets history + metrics buffer). */
  onNewChat?: () => void
  /** Continue the existing ?session= chat (keeps history + metrics buffer). */
  onContinueChat?: () => void
  benchmarksActive?: boolean
  onBenchmarksClick?: () => void
}

export function Header({
  connected,
  rtt,
  experimentName,
  experimentSummary,
  gpuName,
  model,
  chatActive,
  onChatClick,
  onNewChat,
  onContinueChat,
  benchmarksActive,
  onBenchmarksClick,
}: HeaderProps) {
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggle)
  const [chatMenuOpen, setChatMenuOpen] = useState(false)
  const chatMenuRef = useRef<HTMLDivElement>(null)

  // Close the chat dropdown on any outside click.
  useEffect(() => {
    if (!chatMenuOpen) return
    const onDown = (e: MouseEvent) => {
      if (chatMenuRef.current && !chatMenuRef.current.contains(e.target as Node)) {
        setChatMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [chatMenuOpen])
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
        {model && (
          <span
            className="px-2 py-0.5 rounded bg-card border border-green-accent/40 text-green-accent font-mono"
            title="Live model served by the connected vLLM server"
          >
            {model}
          </span>
        )}
        <span className="text-border">·</span>
        <span className="px-2 py-0.5 rounded bg-card border border-blue-accent/40 text-blue-accent font-medium">
          {experimentName}
        </span>
        {experimentSummary && (
          <span className="px-2 py-0.5 rounded bg-card border border-border text-muted font-mono">
            {experimentSummary}
          </span>
        )}
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
        {/* Split chat control: main button toggles chat; caret opens New/Continue */}
        <div ref={chatMenuRef} className="relative flex items-center">
          <button
            onClick={onChatClick}
            title={chatActive ? 'Back to benchmark' : 'Chat with the connected model'}
            className={clsx(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-l border border-r-0 transition-colors font-medium',
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
            onClick={() => setChatMenuOpen((o) => !o)}
            aria-label="Chat session options"
            aria-haspopup="menu"
            aria-expanded={chatMenuOpen}
            title="New / continue chat session"
            className={clsx(
              'flex items-center px-1 py-1 rounded-r border transition-colors',
              chatActive
                ? 'bg-green-accent text-white border-green-accent hover:bg-green-600'
                : 'bg-green-accent/15 border-green-accent/40 text-green-accent hover:bg-green-accent/25'
            )}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {chatMenuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-1 z-20 w-48 rounded border border-border bg-card shadow-lg overflow-hidden"
            >
              <button
                role="menuitem"
                onClick={() => {
                  setChatMenuOpen(false)
                  onNewChat?.()
                }}
                className="w-full text-left px-3 py-2 text-xs text-fg hover:bg-green-accent/15 transition-colors"
              >
                New chat session
                <span className="block text-[10px] text-muted">Fresh history + metrics</span>
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setChatMenuOpen(false)
                  onContinueChat?.()
                }}
                className="w-full text-left px-3 py-2 text-xs text-fg hover:bg-green-accent/15 transition-colors border-t border-border"
              >
                Continue last session
                <span className="block text-[10px] text-muted">Keep history + metrics</span>
              </button>
            </div>
          )}
        </div>
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
