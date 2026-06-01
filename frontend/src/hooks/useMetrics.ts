import { useMetricsStore } from '@/store/metricsStore'

export function useMetrics() {
  const snapshots = useMetricsStore((s) => s.snapshots)
  const latest = useMetricsStore((s) => s.latest)
  return { snapshots, latest }
}
