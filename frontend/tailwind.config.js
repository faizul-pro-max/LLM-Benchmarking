/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0f1117',
        panel: '#1a1d27',
        card: '#1e2130',
        border: '#2a2d3e',
        muted: '#6b7280',
        blue: {
          accent: '#2563EB',
          dim: 'rgba(37,99,235,0.12)',
        },
        green: {
          accent: '#059669',
          dim: 'rgba(5,150,105,0.12)',
        },
        amber: {
          accent: '#D97706',
        },
        red: {
          accent: '#DC2626',
        },
      },
      animation: {
        pulse: 'pulse 1.5s cubic-bezier(0.4,0,0.6,1) infinite',
      },
    },
  },
  plugins: [],
}
