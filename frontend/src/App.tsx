import { useCallback, useEffect, useState } from 'react'
import { Header } from '@/components/controls/Header'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { MetricsPanel } from '@/components/metrics/MetricsPanel'
import { ConversationPanel } from '@/components/conversation/ConversationPanel'
import { BenchmarksView } from '@/components/benchmarks/BenchmarksView'
import { ScenarioPanel } from '@/components/scenarios/ScenarioPanel'
import { useSocket } from '@/hooks/useSocket'
import { useRun } from '@/hooks/useRun'
import { useHealth } from '@/hooks/useHealth'
import { usePrompts } from '@/hooks/usePrompts'
import { useDatasetStatus } from '@/hooks/useDatasetStatus'
import { useMetrics } from '@/hooks/useMetrics'
import { newChatSession } from '@/hooks/useChatSession'
import { useMetricsStore } from '@/store/metricsStore'

/** Reads the current `?session=` chat id from the URL (or null). */
function readSessionFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('session')
}

const EXPERIMENT_NAME = 'Baseline - vLLM 0.6.3 - Qwen2.5-7B'

export default function App() {
  const { connected, rtt, socket } = useSocket()
  const {
    phase,
    requests,
    concurrency,
    category,
    promptCount,
    workload,
    qaMode,
    description,
    start,
    stop,
    setConcurrency,
    setCategory,
    setPromptCount,
    setWorkload,
    setQaMode,
    setDescription,
  } = useRun(socket)

  const { vllmOk, model, experiment } = useHealth()
  const { source: promptSource, byCategory: promptsByCategory } = usePrompts()
  const { status: datasetStatus, reload: reloadDatasetStatus } = useDatasetStatus()
  const { latest } = useMetrics()
  // Single exclusive navigation state. The three top-level views are mutually
  // exclusive tabs — switching one always leaves a well-defined view (no stale
  // left-panel state). 'benchmark' is the default landing view.
  const [view, setView] = useState<'benchmark' | 'chat' | 'benchmarks'>('benchmark')

  // Scenario controller panel is a modal overlay, independent of the view tabs.
  const [scenariosOpen, setScenariosOpen] = useState(false)

  // Active chat session id App drives down to ConversationPanel + metricsStore.
  const [chatSession, setChatSession] = useState<string | null>(null)
  const setMetricsSession = useMetricsStore((s) => s.setSession)
  const clearMetrics = useMetricsStore((s) => s.clear)

  // Enter chat on a brand-new session: mint id, reset chat + metrics buffer.
  const startNewChat = useCallback(() => {
    const id = newChatSession()
    clearMetrics()
    setChatSession(id)
    setView('chat')
  }, [clearMetrics])

  // Enter chat continuing the last session: keep existing id + metrics buffer.
  const continueChat = useCallback(() => {
    setChatSession(readSessionFromUrl() ?? newChatSession())
    setView('chat')
  }, [])

  // Plain Chat toggle: continue current session on enter, leave on exit.
  const toggleChat = useCallback(() => {
    setView((v) => {
      if (v === 'chat') return 'benchmark'
      setChatSession((cur) => cur ?? readSessionFromUrl() ?? newChatSession())
      return 'chat'
    })
  }, [])

  // Keep the metrics store scoped to the active chat session, and emit the
  // shared `chat:session` event so the backend tags/persists per session.
  // On leaving chat we clear the scope and tell the backend to stop tagging.
  useEffect(() => {
    const inChat = view === 'chat'
    const id = inChat ? chatSession : null
    setMetricsSession(id)
    socket?.emit('chat:session', { sessionId: id })
  }, [view, chatSession, socket, setMetricsSession])

  // Prefer the live experiment the GPU agent is serving; fall back to the
  // static label when no agent/experiment is connected.
  const experimentName = experiment?.name ?? EXPERIMENT_NAME

  const handleStart = () => {
    start(experimentName)
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-bg">
      <Header
        connected={connected}
        rtt={rtt}
        experimentName={experimentName}
        experimentSummary={experiment?.summary ?? null}
        gpuName={latest?.gpu_name ?? null}
        model={model}
        chatActive={view === 'chat'}
        onChatClick={toggleChat}
        onNewChat={startNewChat}
        onContinueChat={continueChat}
        benchmarksActive={view === 'benchmarks'}
        onBenchmarksClick={() => setView((v) => (v === 'benchmarks' ? 'benchmark' : 'benchmarks'))}
        scenariosActive={scenariosOpen}
        onScenariosClick={() => setScenariosOpen(true)}
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
                sessionId={chatSession}
                onClose={() => setView('benchmark')}
              />
            ) : (
              <ChatPanel
                phase={phase}
                concurrency={concurrency}
                category={category}
                promptSource={promptSource}
                promptsByCategory={promptsByCategory}
                promptCount={promptCount}
                workload={workload}
                qaMode={qaMode}
                datasetStatus={datasetStatus}
                onDatasetLoaded={reloadDatasetStatus}
                description={description}
                requests={requests}
                onStart={handleStart}
                onStop={stop}
                onConcurrencyChange={setConcurrency}
                onPromptCountChange={setPromptCount}
                onDescriptionChange={setDescription}
                onCategoryChange={setCategory}
                onWorkloadChange={setWorkload}
                onQaModeChange={setQaMode}
              />
            )}
          </div>

          {/* Right panel — remaining width — live GPU metrics, always visible */}
          <div className="flex-1 overflow-hidden">
            <MetricsPanel mode={view === 'chat' ? 'chat' : 'benchmark'} rtt={rtt} />
          </div>
        </div>
      )}

      <ScenarioPanel open={scenariosOpen} onClose={() => setScenariosOpen(false)} />
    </div>
  )
}
