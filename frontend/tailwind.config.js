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
          cyan: '#06b6d4',
          orange: '#f97316',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
      animation: {
        fadeInUp: 'fadeInUp 0.4s ease-out both',
        fadeIn: 'fadeIn 0.3s ease-out both',
        priceFlash: 'priceFlash 0.6s ease-out both',
        glowPulse: 'glowPulse 2s ease-in-out infinite',
        shimmer: 'shimmer 1.5s linear infinite',
        slideInRight: 'slideInRight 0.3s ease-out both',
        ticker: 'ticker 30s linear infinite',
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        priceFlash: {
          '0%': { opacity: '1' },
          '30%': { opacity: '0.6' },
          '100%': { opacity: '1' },
        },
        glowPulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        ticker: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
      boxShadow: {
        'glow-green': '0 0 12px rgba(38,166,154,0.4)',
        'glow-red': '0 0 12px rgba(239,83,80,0.4)',
        'glow-blue': '0 0 20px rgba(59,130,246,0.3)',
      },
    },
  },
  plugins: [],
}
