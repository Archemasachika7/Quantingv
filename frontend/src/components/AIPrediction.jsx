import { useState, useEffect } from 'react'
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
  const DirectionIcon = p ? (DIRECTION_ICONS[p.direction] || Minus) : Minus
  const dirColor = p ? (DIRECTION_COLORS[p.direction] || 'text-terminal-dim') : 'text-terminal-dim'
  const confPct = p ? Math.round((p.confidence || 0) * 100) : 0

  return (
    <div className="terminal-card flex flex-col h-full">
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
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex-1 p-4 flex flex-col gap-3">
        {error && <div className="text-terminal-red text-xs">{error}</div>}
        {loading && !p && <div className="text-terminal-dim text-xs">Computing forecast...</div>}

        {p && (
          <>
            {/* Direction + Confidence */}
            <div className="flex items-center justify-between">
              <div className={`flex items-center gap-2 ${dirColor}`}>
                <DirectionIcon size={18} />
                <span className="text-lg font-semibold">{p.direction}</span>
              </div>
              <div className="text-right">
                <div className="text-xs text-terminal-dim">Confidence</div>
                <div className="text-sm font-medium">{confPct}%</div>
              </div>
            </div>

            {/* Confidence Bar */}
            <div className="w-full bg-terminal-muted rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full transition-all ${p.direction === 'Bullish' ? 'bg-terminal-green' : p.direction === 'Bearish' ? 'bg-terminal-red' : 'bg-terminal-yellow'}`}
                style={{ width: `${confPct}%` }}
              />
            </div>

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
