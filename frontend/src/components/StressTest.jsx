import { useState, useCallback } from 'react'
import { FlaskConical, TrendingDown, TrendingUp, AlertTriangle, ChevronDown } from 'lucide-react'
import { API_BASE } from '../hooks/useApi'

const SYMBOLS = ['GOLD', 'SILVER', 'NIFTY50', 'BANKNIFTY', 'RELIANCE', 'TCS', 'HDFCBANK', 'BTC']
const HORIZONS = [7, 14, 30, 60]

const SCENARIO_LABELS = {
  market_crash: 'Market Crash',
  moderate_drop: 'Moderate Drop',
  rate_spike: 'Rate Spike',
  flash_crash: 'Flash Crash',
  bull_run: 'Bull Run',
}

function MonteCarloChart({ paths, currentPrice }) {
  if (!paths || paths.length === 0) return null

  const width = 600
  const height = 160
  const pad = { left: 8, right: 8, top: 8, bottom: 8 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom

  // Find global min/max across all paths
  let minVal = Infinity
  let maxVal = -Infinity
  for (const path of paths) {
    for (const v of path) {
      if (v < minVal) minVal = v
      if (v > maxVal) maxVal = v
    }
  }
  // Ensure current price is within range
  if (currentPrice < minVal) minVal = currentPrice
  if (currentPrice > maxVal) maxVal = currentPrice

  const range = maxVal - minVal || 1
  const steps = paths[0]?.length || 1

  const toX = (i) => pad.left + (i / (steps - 1)) * innerW
  const toY = (v) => pad.top + innerH - ((v - minVal) / range) * innerH

  const currentY = toY(currentPrice)

  // Sample up to 80 paths for performance
  const sampled = paths.length > 80 ? paths.filter((_, i) => i % Math.ceil(paths.length / 80) === 0) : paths

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: '160px', display: 'block' }}
    >
      {/* Background */}
      <rect x={0} y={0} width={width} height={height} fill="transparent" />

      {/* Current price dashed line */}
      <line
        x1={pad.left} y1={currentY}
        x2={width - pad.right} y2={currentY}
        stroke="#6b7280"
        strokeWidth="1"
        strokeDasharray="4 4"
        opacity="0.7"
      />

      {/* Paths */}
      {sampled.map((path, idx) => {
        const endPrice = path[path.length - 1]
        const color = endPrice >= currentPrice ? '#26a69a' : '#ef5350'
        const points = path.map((v, i) => `${toX(i)},${toY(v)}`).join(' ')
        return (
          <polyline
            key={idx}
            points={points}
            fill="none"
            stroke={color}
            strokeWidth="0.8"
            opacity="0.35"
          />
        )
      })}

      {/* Current price label */}
      <text
        x={pad.left + 2}
        y={currentY - 3}
        fontSize="9"
        fill="#6b7280"
        fontFamily="monospace"
      >
        Current
      </text>
    </svg>
  )
}

function VarCard({ label, value, color }) {
  return (
    <div className="metric-card flex flex-col gap-1">
      <span className="terminal-label">{label}</span>
      <span className="text-2xl font-bold tabular-nums" style={{ color }}>
        {value != null ? `${Math.abs(value).toFixed(2)}%` : '—'}
      </span>
      <span className="text-xs text-terminal-dim">loss</span>
    </div>
  )
}

export default function StressTest() {
  const [symbol, setSymbol] = useState('NIFTY50')
  const [horizon, setHorizon] = useState(30)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  const runTest = useCallback(async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch(`${API_BASE}/api/stress/${symbol}?horizon=${horizon}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setResult(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [symbol, horizon])

  const scenarios = result?.scenarios || []
  const mc = result?.monte_carlo || {}
  const var95 = result?.var_95
  const var99 = result?.var_99
  const cvar95 = result?.cvar_95
  const currentPrice = mc.current_price || result?.current_price
  const paths = mc.paths || []
  const worstPrice = result?.worst_price ?? mc.worst_price
  const bestPrice = result?.best_price ?? mc.best_price

  return (
    <div className="terminal-card flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <FlaskConical size={16} className="text-terminal-purple" />
        <span className="font-bold text-sm tracking-wider text-terminal-text">RISK LAB — STRESS TEST</span>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Symbol selector */}
        <div className="relative">
          <select
            value={symbol}
            onChange={e => setSymbol(e.target.value)}
            className="appearance-none bg-terminal-bg border border-terminal-border text-terminal-text text-xs font-mono px-3 py-1.5 pr-7 rounded focus:outline-none focus:border-terminal-purple cursor-pointer"
          >
            {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-terminal-dim pointer-events-none" />
        </div>

        {/* Horizon selector */}
        <div className="flex items-center gap-1">
          {HORIZONS.map(h => (
            <button
              key={h}
              onClick={() => setHorizon(h)}
              className={`px-3 py-1 rounded text-xs font-mono transition-all ${
                horizon === h
                  ? 'bg-terminal-purple/20 text-terminal-purple border border-terminal-purple/40'
                  : 'text-terminal-dim border border-transparent hover:text-terminal-text'
              }`}
            >
              {h}d
            </button>
          ))}
        </div>

        {/* Run button */}
        <button
          onClick={runTest}
          disabled={loading}
          className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FlaskConical size={13} />
          {loading ? 'Running...' : 'Run Stress Test'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded border border-terminal-red/30 bg-terminal-red/10 text-terminal-red text-xs">
          <AlertTriangle size={13} />
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="flex flex-col gap-3 animate-pulse">
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="skeleton h-20 rounded" />
            ))}
          </div>
          <div className="skeleton h-8 rounded" />
          <div className="skeleton h-40 rounded" />
          <div className="grid grid-cols-5 gap-2">
            {[0,1,2,3,4].map(i => <div key={i} className="skeleton h-16 rounded" />)}
          </div>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="flex flex-col gap-4 animate-fadeInUp">
          {/* VaR Cards */}
          <div className="grid grid-cols-3 gap-3">
            <VarCard label="VaR 95%" value={var95} color="#ef5350" />
            <VarCard label="VaR 99%" value={var99} color="#f97316" />
            <VarCard label="CVaR 95%" value={cvar95} color="#8b5cf6" />
          </div>

          {/* Worst / Best price */}
          <div className="flex items-center gap-4 px-3 py-2 rounded border border-terminal-border bg-terminal-bg/40">
            {worstPrice != null && (
              <div className="flex items-center gap-2">
                <TrendingDown size={14} className="text-terminal-red" />
                <span className="terminal-label">Worst Case</span>
                <span className="text-terminal-red font-mono font-semibold tabular-nums">
                  {worstPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </span>
              </div>
            )}
            {currentPrice != null && (
              <div className="flex items-center gap-2">
                <span className="terminal-label">Current</span>
                <span className="text-terminal-text font-mono tabular-nums">
                  {currentPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </span>
              </div>
            )}
            {bestPrice != null && (
              <div className="flex items-center gap-2">
                <TrendingUp size={14} className="text-terminal-green" />
                <span className="terminal-label">Best Case</span>
                <span className="text-terminal-green font-mono font-semibold tabular-nums">
                  {bestPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>

          {/* Monte Carlo Paths Chart */}
          {paths.length > 0 && currentPrice != null && (
            <div className="flex flex-col gap-1">
              <span className="terminal-label">MONTE CARLO SIMULATION — {paths.length} PATHS</span>
              <div className="rounded border border-terminal-border bg-terminal-bg overflow-hidden">
                <MonteCarloChart paths={paths} currentPrice={currentPrice} />
              </div>
              <div className="flex items-center gap-4 text-xs text-terminal-dim mt-1">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-4 h-0.5 bg-terminal-green rounded" />
                  Above current price
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-4 h-0.5 bg-terminal-red rounded" />
                  Below current price
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-4 h-0 border-t border-dashed border-terminal-dim" />
                  Current price
                </span>
              </div>
            </div>
          )}

          {/* Scenario Grid */}
          {scenarios.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="terminal-label">SCENARIO ANALYSIS</span>
              <div className="grid grid-cols-5 gap-2">
                {scenarios.map((s, i) => {
                  const pnl = s.pnl_pct ?? s.pnl ?? 0
                  const isPos = pnl >= 0
                  const scenarioKey = s.scenario || s.name || ''
                  const label = SCENARIO_LABELS[scenarioKey] || scenarioKey
                  return (
                    <div
                      key={i}
                      className="flex flex-col gap-1 p-2 rounded border border-terminal-border bg-terminal-bg/40 animate-fadeInUp"
                      style={{ animationDelay: `${i * 60}ms` }}
                    >
                      <span className="text-xs text-terminal-dim leading-tight">{label}</span>
                      <span
                        className="text-base font-bold tabular-nums"
                        style={{ color: isPos ? '#26a69a' : '#ef5350' }}
                      >
                        {isPos ? '+' : ''}{pnl.toFixed(2)}%
                      </span>
                      {s.end_price != null && (
                        <span className="text-xs text-terminal-dim font-mono tabular-nums">
                          {s.end_price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!result && !loading && !error && (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-terminal-dim">
          <FlaskConical size={32} className="text-terminal-purple/40" />
          <span className="text-sm">Select a symbol and horizon, then run the stress test</span>
        </div>
      )}
    </div>
  )
}
