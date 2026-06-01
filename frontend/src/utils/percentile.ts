export function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

export const p50 = (arr: number[]) => percentile(arr, 50)
export const p90 = (arr: number[]) => percentile(arr, 90)
export const p99 = (arr: number[]) => percentile(arr, 99)
