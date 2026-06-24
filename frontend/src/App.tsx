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
  // Top-level mode: live dashboard (benchmark/chat) vs. past-runs Benchmarks view.
  const [topView, setTopView] = useState<'live' | 'benchmarks'>('live')
  // Within the live dashboard, the left panel toggles between benchmark and chat.
  const [leftView, setLeftView] = useState<'benchmark' | 'chat'>('benchmark')

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
        chatActive={topView === 'live' && leftView === 'chat'}
        onChatClick={() => {
          setTopView('live')
          setLeftView((v) => (v === 'chat' ? 'benchmark' : 'chat'))
        }}
        benchmarksActive={topView === 'benchmarks'}
        onBenchmarksClick={() => setTopView((v) => (v === 'benchmarks' ? 'live' : 'benchmarks'))}
      />

      {topView === 'benchmarks' ? (
        <BenchmarksView />
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Left panel — ~42% width — benchmark or live chat */}
          <div className="w-[42%] min-w-[360px] flex flex-col overflow-hidden">
            {leftView === 'chat' ? (
              <ConversationPanel
                model={model}
                vllmOk={vllmOk}
                onClose={() => setLeftView('benchmark')}
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
            <MetricsPanel />
          </div>
        </div>
      )}
    </div>
  )
}
