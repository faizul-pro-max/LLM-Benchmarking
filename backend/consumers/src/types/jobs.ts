export interface BenchmarkJob {
  runId: string
  name: string
  config: {
    concurrency: number
    category: string
    promptCount: number
  }
  promptIds: string[]
}

export interface MetricsJob {
  runId: string
}
