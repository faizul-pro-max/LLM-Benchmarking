import type { Job } from 'bullmq'

export async function withRetry<T>(
  fn: () => Promise<T>,
  job: Job,
  maxAttempts = 3,
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt === maxAttempts) throw err
      const delay = attempt * 1000
      console.log({ msg: 'retrying', attempt, delay, jobId: job.id, err: String(err) })
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw new Error('unreachable')
}

export function updateProgress(job: Job, pct: number, label: string) {
  job.updateProgress({ pct, label }).catch(() => {})
}
