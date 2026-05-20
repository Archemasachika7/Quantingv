import { useState, useEffect, useRef } from 'react'
import { TrendingUp, TrendingDown, Minus, RefreshCw, Brain } from 'lucide-react'
import { API_BASE } from '../hooks/useApi'

const DIRECTION_COLORS = {
  Bullish: 'text-terminal-green',
  Bearish: 'text-terminal-red',
  Neutral: 'text-terminal-yellow',
}

const DIRECTION_ICONS = {
  Bullish: TrendingUp,
  Bearish: TrendingDown,
  Neutral: Minus,
}

function AnimatedConfidenceBar({ confPct, direction }) {
  const [width, setWidth] = useState(0)

  useEffect(() => {
    // Start at 0, animate to target
    setWidth(0)
    const timer = setTimeout(() => setWidth(confPct), 80)
    return () => clearTimeout(timer)
  }, [confPct, direction])

  const barColor =
    direction === 'Bullish' ? 'bg-terminal-green' :
    direction === 'Bearish' ? 'bg-terminal-red' :
    'bg-terminal-yellow'

  return (
    <div className="w-full bg-terminal-muted rounded-full h-1.5 overflow-hidden">
      <div
        className={`h-1.5 rounded-full ${barColor}`}
        style={{
          width: `${width}%`,
          transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />
    </div>
  )
}

function LoadingDots() {
  const [dots, setDots] = useState('')
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.')
    }, 400)
    return () => clearInterval(interval)
  }, [])
  return <span>Computing forecast{dots}</span>
}

function DirectionBadge({ direction }) {
  if (!direction) return null
  const cls =
    direction === 'Bullish' ? 'badge-bullish' :
    direction === 'Bearish' ? 'badge-bearish' :
    'badge-neutral'
  const Icon = DIRECTION_ICONS[direction] || Minus
  return (
    <span className={cls}>
      <span className="inline-flex items-center gap-1">
        <Icon size={10} />
        {direction.toUpperCase()}
      </span>
    </span>
  )
}

export default function AIPrediction({ symbol }) {
  const [prediction, setPrediction] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const load = (fresh = false) => {
    setLoading(true)
    setError(null)
    fetch(`${API_BASE}/api/predict/${symbol}${fresh ? '?fresh=true' : ''}`)
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) throw new Error(d.detail || d.error || 'Forecast failed')
        if (d.error || d.detail) throw new Error(d.error || d.detail)
        setPrediction(d)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { if (symbol) load() }, [symbol])

  const p = prediction
  const dirColor = p ? (DIRECTION_COLORS[p.direction] || 'text-terminal-dim') : 'text-terminal-dim'
  const confPct = p ? Math.round((p.confidence || 0) * 100) : 0

  // Compute forecast price (midpoint of range)
  const forecastPrice = p && p.price_low && p.price_high
    ? ((p.price_low + p.price_high) / 2)
    : null

  return (
    <div className="terminal-card flex flex-col h-full animate-slideInRight">
      <div className="flex items-center justify-between px-4 py-2 border-b border-terminal-border">
        <div className="flex items-center gap-2">
          <Brain size={14} className="text-terminal-purple" />
          <span className="text-xs font-medium">AI FORECAST</span>
          <span className="text-terminal-dim text-xs">7-day</span>
        </div>
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="text-terminal-dim hover:text-terminal-text transition-colors"
          title="Refresh forecast"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex-1 p-4 flex flex-col gap-3 overflow-y-auto">
        {error && <div className="text-terminal-red text-xs bg-red-900/20 rounded p-2">{error}</div>}
        {loading && !p && (
          <div className="text-terminal-dim text-xs">
            <LoadingDots />
          </div>
        )}

        {p && (
          <>
            {/* Direction badge + confidence */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DirectionBadge direction={p.direction} />
              </div>
              <div className="text-right">
                <div className="text-xs text-terminal-dim">Confidence</div>
                <div className={`text-sm font-bold ${dirColor}`}>{confPct}%</div>
              </div>
            </div>

            {/* Confidence Bar */}
            <AnimatedConfidenceBar confPct={confPct} direction={p.direction} />

            {/* Forecast Price Display */}
            {forecastPrice && (
              <div className="bg-terminal-bg rounded p-2.5 text-center">
                <div className="terminal-label mb-1">7-Day Forecast Target</div>
                <div className={`text-2xl font-bold ${dirColor}`}>
                  ₹{forecastPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </div>
                {p.current_price && (
                  <div className="text-xs text-terminal-dim mt-0.5">
                    {forecastPrice > p.current_price ? '▲' : '▼'}{' '}
                    {Math.abs(((forecastPrice - p.current_price) / p.current_price) * 100).toFixed(2)}% from current
                  </div>
                )}
              </div>
            )}

            {/* Price Range */}
            <div className="bg-terminal-bg rounded p-2.5">
              <div className="terminal-label mb-1.5">Expected Range</div>
              <div className="flex justify-between text-xs">
                <div>
                  <div className="text-terminal-dim">Low</div>
                  <div className="text-terminal-red font-medium">{p.price_low?.toLocaleString('en-IN')}</div>
                </div>
                <div className="text-center">
                  <div className="text-terminal-dim">Current</div>
                  <div className="font-medium">{p.current_price?.toLocaleString('en-IN')}</div>
                </div>
                <div className="text-right">
                  <div className="text-terminal-dim">High</div>
                  <div className="text-terminal-green font-medium">{p.price_high?.toLocaleString('en-IN')}</div>
                </div>
              </div>
            </div>

            {/* Model Breakdown */}
            {p.model_breakdown && (
              <div>
                <div className="terminal-label mb-1">Model Signals</div>
                <div className="space-y-1">
                  {Object.entries(p.model_breakdown).map(([name, v]) => (
                    <div key={name} className="flex justify-between text-xs">
                      <span className="text-terminal-dim">{name}</span>
                      <span className={v.direction === 'Bullish' ? 'price-up' : v.direction === 'Bearish' ? 'price-down' : 'text-terminal-yellow'}>
                        {v.direction} ({Math.round(v.confidence * 100)}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sentiment */}
            {p.sentiment && (
              <div className="bg-terminal-bg rounded p-2.5">
                <div className="terminal-label mb-1">News Sentiment</div>
                <div className="flex items-center justify-between text-xs">
                  <span className={p.sentiment.label === 'Bullish' ? 'price-up' : p.sentiment.label === 'Bearish' ? 'price-down' : 'text-terminal-yellow'}>
                    {p.sentiment.label}
                  </span>
                  <span className="text-terminal-dim">
                    Score: {(p.sentiment.avg_score > 0 ? '+' : '')}{p.sentiment.avg_score?.toFixed(3)}
                  </span>
                </div>
                {/* Gauge bar */}
                <div className="mt-1.5 w-full h-1.5 bg-terminal-muted rounded-full relative overflow-hidden">
                  <div
                    className="absolute h-full rounded-full"
                    style={{
                      width: `${Math.abs(p.sentiment.avg_score) * 50}%`,
                      left: p.sentiment.avg_score >= 0 ? '50%' : `${50 - Math.abs(p.sentiment.avg_score) * 50}%`,
                      background: p.sentiment.avg_score >= 0 ? '#26a69a' : '#ef5350',
                    }}
                  />
                  <div className="absolute left-1/2 top-0 h-full w-px bg-terminal-border" />
                </div>
              </div>
            )}

            {/* AI Explanation */}
            {p.ai_explanation && (
              <div className="bg-terminal-bg rounded p-2.5">
                <div className="terminal-label mb-1">AI Analysis</div>
                <p className="text-xs text-terminal-dim leading-relaxed">{p.ai_explanation}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
