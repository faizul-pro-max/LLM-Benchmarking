import { StatCards } from './StatCards'
import { GpuChart } from './GpuChart'
import { TpsChart } from './TpsChart'
import { QueueBars } from './QueueBars'
import { ComparisonTable } from '@/components/comparison/ComparisonTable'

export function MetricsPanel() {
  return (
    <div className="flex flex-col h-full overflow-y-auto bg-bg">
      <StatCards />

      {/* Charts side by side */}
      <div className="grid grid-cols-2 gap-4 px-4 py-2">
        <div className="bg-panel border border-border rounded-lg p-3">
          <GpuChart />
        </div>
        <div className="bg-panel border border-border rounded-lg p-3">
          <TpsChart />
        </div>
      </div>

      <QueueBars />

      <div className="px-4 pb-4">
        <ComparisonTable />
      </div>
    </div>
  )
}
