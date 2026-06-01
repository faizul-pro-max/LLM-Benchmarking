import { useMetricsStore } from '@/store/metricsStore'
import { useRunStore } from '@/store/runStore'
import { useExperimentStore } from '@/store/experimentStore'
import type { MetricsSnapshot } from '@/types/metrics'
import type { ComparisonRow } from '@/types/experiment'

let mockInterval: ReturnType<typeof setInterval> | null = null
let requestInterval: ReturnType<typeof setInterval> | null = null

const CATEGORIES = ['random', 'shared_prefix', 'exact_repeat'] as const
const PROMPTS = [
  'Explain KV cache in simple terms for a developer?',
  'What is speculative decoding and why does it shift mode?',
  'Compare prefill vs decode phase in LLM inference.',
  'How does LLM paged attention reduce memory?',
  'Describe the difference between TTFT and TPOT.',
  'What is tensor parallelism in large model serving?',
  'Explain quantization AWS FP8 quality tradeoffs.',
  'How does continuous batching improve GPU util?',
]

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min
}

function generateSnapshot(_t?: number): MetricsSnapshot {
  return {
    ts: Date.now() - Math.round(rand(10, 50)),
    transport_ms: Math.round(rand(10, 60)),
    gpu_util: Math.round(rand(85, 99)),
    vram_used_mb: Math.round(rand(68000, 74000)),
    vram_total_mb: 81920,
    power_w: Math.round(rand(300, 400)),
    temp_c: Math.round(rand(60, 75)),
    gpu_name: 'NVIDIA A100-SXM4-80GB',
    kv_cache_pct: Math.round(rand(80, 95)),
    requests_running: Math.round(rand(6, 16)),
    requests_waiting: Math.round(rand(0, 8)),
    tokens_per_sec: Math.round(rand(1400, 1800)),
    ttft_p50_ms: Math.round(rand(250, 350)),
    ttft_p99_ms: Math.round(rand(400, 600)),
  }
}

const MOCK_EXPERIMENTS: ComparisonRow[] = [
  {
    runId: 'baseline',
    name: 'Baseline - vLLM',
    isBaseline: true,
    isActive: true,
    ttft_p50_ms: 287,
    ttft_p90_ms: 612,
    tokens_per_sec_avg: 1247,
    gpu_util_avg: 87,
    kv_cache_avg: 73,
    tpot_p50_ms: 8,
  },
  {
    runId: 'prefix-cache',
    name: 'Prefix Caching',
    isBaseline: false,
    isActive: false,
    ttft_p50_ms: 94,
    ttft_p90_ms: 101,
    tokens_per_sec_avg: 1369,
    gpu_util_avg: 82,
    kv_cache_avg: 68,
    tpot_p50_ms: 7,
    pct_ttft_p50: -67,
    pct_ttft_p90: -83,
    pct_tps: 9.8,
    pct_gpu: -5.7,
    pct_kv: -6.8,
  },
  {
    runId: 'awq',
    name: 'Quantization AWQ',
    isBaseline: false,
    isActive: false,
    ttft_p50_ms: 261,
    ttft_p90_ms: 469,
    tokens_per_sec_avg: 1589,
    gpu_util_avg: 79,
    kv_cache_avg: 41,
    tpot_p50_ms: 6,
    pct_ttft_p50: -9,
    pct_ttft_p90: -23,
    pct_tps: 27.4,
    pct_gpu: -9.2,
    pct_kv: -43.8,
  },
  {
    runId: 'spec-decode',
    name: 'Speculative Decode',
    isBaseline: false,
    isActive: false,
    ttft_p50_ms: null,
    ttft_p90_ms: null,
    tokens_per_sec_avg: null,
    gpu_util_avg: null,
    kv_cache_avg: null,
    tpot_p50_ms: null,
  },
]

const mockRequestIds = Array.from({ length: 8 }, (_, i) => `req-${String(i + 1).padStart(3, '0')}`)

function initMockRequests() {
  const { updateRequest } = useRunStore.getState()
  mockRequestIds.forEach((id, i) => {
    updateRequest({
      id,
      state: 'done',
    })
    const store = useRunStore.getState()
    const existing = store.requests.get(id)
    if (existing) {
      store.requests.set(id, {
        ...existing,
        prompt_text: PROMPTS[i % PROMPTS.length],
        category: CATEGORIES[i % CATEGORIES.length],
        phase: 'benchmark',
        ttft_ms: Math.round(rand(200, 400)),
        token_count: Math.round(rand(80, 180)),
        tpot_ms: Math.round(rand(5, 12)),
        total_ms: Math.round(rand(1000, 3000)),
        finish_reason: 'stop',
      })
    }
  })
}

export function startMockData() {
  if (mockInterval) return

  const { addSnapshot } = useMetricsStore.getState()
  const { setMockExperiments } = useExperimentStore.getState()
  const { setPhase, setConcurrency } = useRunStore.getState()

  setPhase('benchmarking')
  setConcurrency(10)
  setMockExperiments(MOCK_EXPERIMENTS)

  // Pre-fill 60s of history
  const now = Date.now()
  for (let i = 119; i >= 0; i--) {
    addSnapshot(generateSnapshot(now - i * 500))
  }

  initMockRequests()

  let tick = 0
  mockInterval = setInterval(() => {
    addSnapshot(generateSnapshot(Date.now()))
    tick++

    // Cycle some requests through states to show animation
    if (tick % 4 === 0) {
      const { updateRequest } = useRunStore.getState()
      const id = mockRequestIds[tick % mockRequestIds.length]
      updateRequest({ id, state: 'prefilling' })
      setTimeout(() => {
        updateRequest({ id, state: 'decoding', ttft_ms: Math.round(rand(200, 400)) })
        setTimeout(() => {
          updateRequest({
            id,
            state: 'done',
            token_count: Math.round(rand(80, 180)),
            tpot_ms: Math.round(rand(5, 12)),
            total_ms: Math.round(rand(1000, 3000)),
            finish_reason: 'stop',
          })
        }, 1200)
      }, 600)
    }
  }, 500)
}

export function stopMockData() {
  if (mockInterval) {
    clearInterval(mockInterval)
    mockInterval = null
  }
  if (requestInterval) {
    clearInterval(requestInterval)
    requestInterval = null
  }
}
