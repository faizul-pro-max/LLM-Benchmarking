import 'dotenv/config'
import { Worker, Queue } from 'bullmq'
import { benchmarkProcessor } from './processors/benchmarkProcessor'
import { metricsProcessor } from './processors/metricsProcessor'
import type { BenchmarkJob, MetricsJob } from './types/jobs'

// The live benchmark run path (backend/api routes/run.ts) doesn't enqueue
// jobs here — this worker only matters if something is using the BullMQ
// queue. Set WORKER_ENABLED=false (e.g. no Redis available) to skip
// connecting entirely instead of retrying against an unreachable Redis.
if (process.env.WORKER_ENABLED === 'false') {
  console.log({ msg: 'worker disabled via WORKER_ENABLED=false — not connecting to Redis', ts: Date.now() })
  process.exit(0)
}

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

// BullMQ bundles its own ioredis — pass URL string, not an ioredis instance
const url = new URL(REDIS_URL)
const connection = {
  host: url.hostname,
  port: parseInt(url.port || '6379', 10),
  password: url.password || undefined,
  maxRetriesPerRequest: null as unknown as number,
}

const benchmarkWorker = new Worker<BenchmarkJob>(
  'benchmark-jobs',
  benchmarkProcessor,
  { connection, concurrency: 1 }
)

const metricsWorker = new Worker<MetricsJob>(
  'metrics-jobs',
  metricsProcessor,
  { connection, concurrency: 5 }
)

benchmarkWorker.on('completed', (job) =>
  console.log({ msg: 'benchmark complete', jobId: job.id, ts: Date.now() })
)
benchmarkWorker.on('failed', (job, err) =>
  console.log({ msg: 'benchmark failed', jobId: job?.id, err: String(err), ts: Date.now() })
)

metricsWorker.on('failed', (job, err) =>
  console.log({ msg: 'metrics job failed', jobId: job?.id, err: String(err), ts: Date.now() })
)

const benchmarkQueue = new Queue('benchmark-jobs', { connection })
console.log({ msg: 'worker started', queues: ['benchmark-jobs', 'metrics-jobs'], ts: Date.now() })

process.on('SIGTERM', async () => {
  await benchmarkWorker.close()
  await metricsWorker.close()
  await benchmarkQueue.close()
  process.exit(0)
})
