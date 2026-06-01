import type { Job } from 'bullmq'
import type { BenchmarkJob } from '../types/jobs'
import { updateProgress } from '../utils/jobHelpers'

export async function benchmarkProcessor(job: Job<BenchmarkJob>) {
  const { runId } = job.data
  console.log({ msg: 'benchmark job started', runId, jobId: job.id, ts: Date.now() })

  updateProgress(job, 0, 'starting')

  // The actual benchmark orchestration lives in the API server (run.ts route).
  // This worker handles jobs enqueued externally or via Bull Board.
  // For now, log and complete — extend when decoupling from HTTP.
  updateProgress(job, 10, 'warmup')
  await new Promise((r) => setTimeout(r, 500))
  updateProgress(job, 50, 'benchmarking')
  await new Promise((r) => setTimeout(r, 500))
  updateProgress(job, 100, 'complete')

  console.log({ msg: 'benchmark job done', runId, jobId: job.id, ts: Date.now() })
  return { runId, status: 'complete' }
}
