/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        terminal: {
          bg: '#0a0e1a',
          surface: '#111827',
          border: '#1f2937',
          muted: '#374151',
          text: '#e5e7eb',
          dim: '#6b7280',
          green: '#26a69a',
          red: '#ef5350',
          blue: '#3b82f6',
          yellow: '#f59e0b',
          purple: '#8b5cf6',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
