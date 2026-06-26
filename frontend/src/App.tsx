import { useEffect, useState } from 'react'
import { Header } from '@/components/controls/Header'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { MetricsPanel } from '@/components/metrics/MetricsPanel'
import { ConversationPanel } from '@/components/conversation/ConversationPanel'
import { BenchmarksView } from '@/components/benchmarks/BenchmarksView'
import { useSocket } from '@/hooks/useSocket'
import { useRun } from '@/hooks/useRun'
import { useHealth } from '@/hooks/useHealth'
import { useMetrics } from '@/hooks/useMetrics'
import { startMockData } from '@/utils/mockData'

const EXPERIMENT_NAME = 'Baseline - vLLM 0.6.3 - Qwen2.5-7B'

export default function App() {
  const { connected, rtt, socket } = useSocket()
  const {
    phase,
    requests,
    concurrency,
    category,
    promptCount,
    start,
    stop,
    setConcurrency,
    setCategory,
  } = useRun(socket)

  const { vllmOk, model } = useHealth()
  const { latest } = useMetrics()
  // Single exclusive navigation state. The three top-level views are mutually
  // exclusive tabs — switching one always leaves a well-defined view (no stale
  // left-panel state). 'benchmark' is the default landing view.
  const [view, setView] = useState<'benchmark' | 'chat' | 'benchmarks'>('benchmark')

  // Start mock data only when truly disconnected from the backend. When connected
  // (even idle), live metrics:snapshot events drive every chart.
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!connected) {
        startMockData()
      }
    }, 1500)
    return () => clearTimeout(timeout)
  }, [connected])

  const handleStart = () => {
    start(EXPERIMENT_NAME)
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-bg">
      <Header
        connected={connected}
        rtt={rtt}
        experimentName={EXPERIMENT_NAME}
        gpuName={latest?.gpu_name ?? null}
        chatActive={view === 'chat'}
        onChatClick={() => setView((v) => (v === 'chat' ? 'benchmark' : 'chat'))}
        benchmarksActive={view === 'benchmarks'}
        onBenchmarksClick={() => setView((v) => (v === 'benchmarks' ? 'benchmark' : 'benchmarks'))}
      />

      {view === 'benchmarks' ? (
        <BenchmarksView />
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Left panel — ~42% width — benchmark or live chat */}
          <div className="w-[42%] min-w-[360px] flex flex-col overflow-hidden">
            {view === 'chat' ? (
              <ConversationPanel
                model={model}
                vllmOk={vllmOk}
                onClose={() => setView('benchmark')}
              />
            ) : (
              <ChatPanel
                phase={phase}
                concurrency={concurrency}
                category={category}
                promptCount={promptCount}
                requests={requests}
                onStart={handleStart}
                onStop={stop}
                onConcurrencyChange={setConcurrency}
                onCategoryChange={setCategory}
              />
            )}
          </div>

          {/* Right panel — remaining width — live GPU metrics, always visible */}
          <div className="flex-1 overflow-hidden">
            <MetricsPanel mode={view === 'chat' ? 'chat' : 'benchmark'} />
          </div>
        </div>
      )}
    </div>
  )
}
