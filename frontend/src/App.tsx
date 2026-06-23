import { useEffect, useState } from 'react'
import { Header } from '@/components/controls/Header'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { MetricsPanel } from '@/components/metrics/MetricsPanel'
import { ConversationModal } from '@/components/conversation/ConversationModal'
import { useSocket } from '@/hooks/useSocket'
import { useRun } from '@/hooks/useRun'
import { useHealth } from '@/hooks/useHealth'
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
  const [chatOpen, setChatOpen] = useState(false)

  // Start mock data when not connected to a real backend
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
        showChat={vllmOk}
        onChatClick={() => setChatOpen(true)}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — ~42% width */}
        <div className="w-[42%] min-w-[360px] flex flex-col overflow-hidden">
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
        </div>

        {/* Right panel — remaining width */}
        <div className="flex-1 overflow-hidden">
          <MetricsPanel />
        </div>
      </div>

      <ConversationModal open={chatOpen} onClose={() => setChatOpen(false)} model={model} />
    </div>
  )
}
