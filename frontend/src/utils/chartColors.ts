import { useThemeStore } from '@/store/themeStore'

export interface ChartColors {
  grid: string        // cartesian grid / tooltip border
  axis: string        // axis tick + tooltip label text
  tooltipBg: string   // tooltip background
}

const DARK: ChartColors = {
  grid: '#2a2d3e',
  axis: '#6b7280',
  tooltipBg: '#1e2130',
}

const LIGHT: ChartColors = {
  grid: '#e5e7eb',
  axis: '#6b7280',
  tooltipBg: '#ffffff',
}

/** Theme-aware chart colors. A hook so charts re-render when the theme changes
 *  (recharts SVG attributes don't resolve CSS variables reliably). */
export function useChartColors(): ChartColors {
  const theme = useThemeStore((s) => s.theme)
  return theme === 'light' ? LIGHT : DARK
}
