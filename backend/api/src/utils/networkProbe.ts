const VLLM_URL         = process.env.VLLM_URL ?? ''
const VLLM_API_KEY     = process.env.VLLM_API_KEY ?? ''
const PROBE_SAMPLES     = 5
const PROBE_TIMEOUT_MS  = 2000

/** Median round-trip time (ms) to the vLLM server, measured via a handful of
 *  lightweight GET /v1/models calls right before a run's warmup starts. This
 *  is the network baseline subtracted from each request's client-measured
 *  TTFT (t2 - t0) to estimate a network-excluded "compute" TTFT — see
 *  aggregator.ts. A few dropped/slow samples are tolerated; the median is
 *  robust to that jitter. Returns null if vLLM isn't configured or every
 *  probe failed. */
export async function measureNetworkRtt(): Promise<number | null> {
  if (!VLLM_URL) return null
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fetch = require('node-fetch') as typeof import('node-fetch').default
  const headers = VLLM_API_KEY ? { Authorization: `Bearer ${VLLM_API_KEY}` } : undefined

  const samples: number[] = []
  for (let i = 0; i < PROBE_SAMPLES; i++) {
    try {
      const t0 = Date.now()
      const res = await fetch(`${VLLM_URL}/v1/models`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS), headers })
      if (res.ok) samples.push(Date.now() - t0)
    } catch {
      // A dropped probe doesn't invalidate the others — just skip it.
    }
  }
  if (samples.length === 0) return null

  samples.sort((a, b) => a - b)
  const mid = Math.floor(samples.length / 2)
  return samples.length % 2 === 0 ? (samples[mid - 1] + samples[mid]) / 2 : samples[mid]
}
