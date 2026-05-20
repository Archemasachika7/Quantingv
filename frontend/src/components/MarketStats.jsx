import { useState, useEffect } from 'react'
import { API_BASE } from '../hooks/useApi'

function getISTTime() {
  const now = new Date()
  // IST is UTC+5:30
  const istOffset = 5.5 * 60 * 60 * 1000
  const utc = now.getTime() + now.getTimezoneOffset() * 60 * 1000
  return new Date(utc + istOffset)
}

function isMarketOpen() {
  const ist = getISTTime()
  const day = ist.getDay() // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false
  const h = ist.getHours()
  const m = ist.getMinutes()
  const mins = h * 60 + m
  // NSE: 9:15 - 15:30
  return mins >= 9 * 60 + 15 && mins < 15 * 60 + 30
}

export default function MarketStats({ quotes = [] }) {
  const [vix, setVix] = useState(null)
  const [marketOpen, setMarketOpen] = useState(isMarketOpen())

  // Re-check market status every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      setMarketOpen(isMarketOpen())
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  // Try to fetch VIX
  useEffect(() => {
    fetch(`${API_BASE}/api/quotes/VIX`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.price) setVix(d.price)
      })
      .catch(() => {})
  }, [])

  // Compute breadth from quotes
  const advancing = quotes.filter(q => q.change_pct > 0).length
  const declining = quotes.filter(q => q.change_pct < 0).length
  const unchanged = quotes.filter(q => q.change_pct === 0).length

  return (
    <div className="flex items-center gap-4 px-4 py-1.5 bg-terminal-bg border-b border-terminal-border text-xs overflow-x-auto">
      {/* LIVE dot */}
      <div className="flex items-center gap-1.5 shrink-0">
        <div className="live-dot" />
        <span className="text-terminal-dim font-medium tracking-widest">LIVE</span>
      </div>

      {/* Divider */}
      <div className="w-px h-3 bg-terminal-border shrink-0" />

      {/* Market status */}
      <div className="flex items-center gap-1.5 shrink-0">
        <div
          className={`w-1.5 h-1.5 rounded-full ${marketOpen ? 'bg-terminal-green' : 'bg-terminal-red'}`}
          style={{ boxShadow: marketOpen ? '0 0 4px rgba(38,166,154,0.6)' : '0 0 4px rgba(239,83,80,0.6)' }}
        />
        <span className={marketOpen ? 'text-terminal-green' : 'text-terminal-red'}>
          NSE/BSE {marketOpen ? 'OPEN' : 'CLOSED'}
        </span>
      </div>

      {/* Divider */}
      <div className="w-px h-3 bg-terminal-border shrink-0" />

      {/* India VIX */}
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-terminal-dim">India VIX:</span>
        <span className="text-terminal-text font-medium">
          {vix !== null ? vix.toFixed(2) : '—'}
        </span>
      </div>

      {/* Divider */}
      <div className="w-px h-3 bg-terminal-border shrink-0" />

      {/* Market breadth */}
      {quotes.length > 0 && (
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-terminal-dim">Breadth:</span>
          <span className="text-terminal-green">▲{advancing}</span>
          <span className="text-terminal-red">▼{declining}</span>
          {unchanged > 0 && <span className="text-terminal-dim">={unchanged}</span>}
        </div>
      )}

      {/* Divider */}
      <div className="w-px h-3 bg-terminal-border shrink-0" />

      {/* BTC Dominance placeholder */}
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-terminal-dim">BTC Dom:</span>
        <span className="text-terminal-text font-medium">—</span>
      </div>
    </div>
  )
}
