interface Bucket {
  le: number
  count: number
}

function parseBuckets(text: string, metricName: string): Bucket[] {
  const buckets: Bucket[] = []
  const re = new RegExp(`^${metricName}_bucket\\{.*le="([^"]+)".*\\}\\s+([\\d.]+)`, 'gm')
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    const le = match[1] === '+Inf' ? Infinity : parseFloat(match[1])
    buckets.push({ le, count: parseFloat(match[2]) })
  }
  return buckets.sort((a, b) => a.le - b.le)
}

function interpolatePercentile(buckets: Bucket[], p: number): number {
  if (buckets.length === 0) return 0
  const total = buckets[buckets.length - 1].count
  if (total === 0) return 0
  const target = (p / 100) * total

  for (let i = 0; i < buckets.length; i++) {
    if (buckets[i].count >= target) {
      const prevCount = i > 0 ? buckets[i - 1].count : 0
      const prevLe = i > 0 ? buckets[i - 1].le : 0
      const prevBucketLe = i > 0 ? buckets[i - 1].le : 0
      const currLe = buckets[i].le === Infinity ? prevBucketLe * 2 || 10 : buckets[i].le
      const fraction = (target - prevCount) / (buckets[i].count - prevCount || 1)
      return (prevLe + fraction * (currLe - prevLe)) * 1000 // convert s → ms
    }
  }
  return 0
}

function parseGauge(text: string, metricName: string): number {
  const match = new RegExp(`^${metricName}(?:\\{[^}]*\\})?\\s+([\\d.eE+\\-]+)`, 'm').exec(text)
  return match ? parseFloat(match[1]) : 0
}

// Returns -1 when a metric is absent so callers can fall back to an alternate name
function parseGaugeOpt(text: string, metricName: string): number {
  const match = new RegExp(`^${metricName}(?:\\{[^}]*\\})?\\s+([\\d.eE+\\-]+)`, 'm').exec(text)
  return match ? parseFloat(match[1]) : -1
}

/** Parse the label set of an `_info`-style metric like vllm:cache_config_info{...} 1.0 */
export function parseInfoLabels(text: string, metricName: string): Record<string, string> {
  const line = new RegExp(`^${metricName}\\{([^}]*)\\}`, 'm').exec(text)
  if (!line) return {}
  const labels: Record<string, string> = {}
  const re = /([a-zA-Z0-9_]+)="([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(line[1])) !== null) labels[m[1]] = m[2]
  return labels
}

export function parseVllmMetrics(text: string) {
  const ttftBuckets = parseBuckets(text, 'vllm:time_to_first_token_seconds')

  // KV cache: vLLM v1 renamed gpu_cache_usage_perc → kv_cache_usage_perc (value is a 0..1 fraction)
  const kvFrac = parseGaugeOpt(text, 'vllm:kv_cache_usage_perc')
  const kvFracLegacy = kvFrac >= 0 ? kvFrac : parseGaugeOpt(text, 'vllm:gpu_cache_usage_perc')

  return {
    kv_cache_pct: (kvFracLegacy >= 0 ? kvFracLegacy : 0) * 100,
    requests_running: parseGauge(text, 'vllm:num_requests_running'),
    requests_waiting: parseGauge(text, 'vllm:num_requests_waiting'),
    requests_swapped: parseGauge(text, 'vllm:num_requests_swapped'),
    // No throughput gauge in v1 — collector derives tokens_per_sec from this counter delta
    tokens_per_sec: 0,
    generation_tokens_total: parseGauge(text, 'vllm:generation_tokens_total'),
    ttft_p50_ms: interpolatePercentile(ttftBuckets, 50),
    ttft_p99_ms: interpolatePercentile(ttftBuckets, 99),
    vllm: text
  }
}
