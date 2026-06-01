import type { Job } from 'bullmq'
import type { MetricsJob } from '../types/jobs'

export async function metricsProcessor(job: Job<MetricsJob>) {
  const { runId } = job.data
  // Metrics collection runs in the API server via metricsCollector.ts.
  // This job is a placeholder for when metrics are decoupled to the worker tier.
  console.log({ msg: 'metrics job tick', runId, jobId: job.id, ts: Date.now() })
}
