/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--color-bg) / <alpha-value>)',
        panel: 'rgb(var(--color-panel) / <alpha-value>)',
        card: 'rgb(var(--color-card) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
        muted: 'rgb(var(--color-muted) / <alpha-value>)',
        fg: 'rgb(var(--color-fg) / <alpha-value>)',
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
