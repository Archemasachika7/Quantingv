import { useState, useCallback } from 'react'
import { PieChart, TrendingUp, BarChart2, AlertTriangle } from 'lucide-react'
import { API_BASE } from '../hooks/useApi'

const ALL_ASSETS = ['GOLD', 'SILVER', 'NIFTY50', 'BANKNIFTY', 'RELIANCE', 'TCS', 'HDFCBANK', 'BTC', 'ETH']
const DEFAULT_SELECTED = new Set(['NIFTY50', 'GOLD', 'BTC', 'RELIANCE', 'TCS'])
const MONTHS_OPTIONS = [6, 12, 24]
const PALETTE = ['#3b82f6','#26a69a','#f59e0b','#ef5350','#8b5cf6','#06b6d4','#f97316','#10b981','#ec4899']

function DonutChart({ weights, symbols }) {
  if (!weights || weights.length === 0) return null

  const cx = 70
  const cy = 70
  const R = 52
  const r = 30

  let cumAngle = -Math.PI / 2

  const slices = weights.map((w, i) => {
    const angle = w * 2 * Math.PI
    const startAngle = cumAngle
    const endAngle = cumAngle + angle
    cumAngle = endAngle

    const x1 = cx + R * Math.cos(startAngle)
    const y1 = cy + R * Math.sin(startAngle)
    const x2 = cx + R * Math.cos(endAngle)
    const y2 = cy + R * Math.sin(endAngle)
    const ix1 = cx + r * Math.cos(startAngle)
    const iy1 = cy + r * Math.sin(startAngle)
    const ix2 = cx + r * Math.cos(endAngle)
    const iy2 = cy + r * Math.sin(endAngle)

    const largeArc = angle > Math.PI ? 1 : 0

    const d = [
      `M ${x1} ${y1}`,
      `A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${ix2} ${iy2}`,
      `A ${r} ${r} 0 ${largeArc} 0 ${ix1} ${iy1}`,
      'Z'
    ].join(' ')

    return { d, color: PALETTE[i % PALETTE.length], weight: w, symbol: symbols[i] }
  })

  return (
    <div className="flex flex-col items-center gap-2">
      <svg viewBox="0 0 140 140" style={{ width: '140px', height: '140px' }}>
        {slices.map((s, i) => (
          <path
            key={i}
            d={s.d}
            fill={s.color}
            opacity="0.9"
            stroke="#0a0e1a"
            strokeWidth="1"
          />
        ))}
        {/* Center hole */}
        <circle cx={cx} cy={cy} r={r - 1} fill="#111827" />
      </svg>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
            <span className="text-xs text-terminal-dim">{s.symbol}</span>
            <span className="text-xs font-mono text-terminal-text">{(s.weight * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function WeightBar({ symbol, weight, idx }) {
  const color = PALETTE[idx % PALETTE.length]
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-mono text-terminal-dim w-20 shrink-0">{symbol}</span>
      <div className="flex-1 h-1.5 bg-terminal-border rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${(weight * 100).toFixed(1)}%`, background: color }}
        />
      </div>
      <span className="text-xs font-mono tabular-nums text-terminal-text w-10 text-right">
        {(weight * 100).toFixed(1)}%
      </span>
    </div>
  )
}

function EfficientFrontier({ frontier, minVar, maxSharpe }) {
  if (!frontier || frontier.length === 0) return null

  const svgW = 400
  const svgH = 180
  const pad = { left: 36, right: 16, top: 12, bottom: 28 }
  const iW = svgW - pad.left - pad.right
  const iH = svgH - pad.top - pad.bottom

  const risks = frontier.map(p => p.risk ?? p.volatility ?? p[0])
  const rets = frontier.map(p => p.return ?? p.expected_return ?? p[1])

  const minR = Math.min(...risks)
  const maxR = Math.max(...risks)
  const minRet = Math.min(...rets)
  const maxRet = Math.max(...rets)

  const toX = v => pad.left + ((v - minR) / (maxR - minR || 1)) * iW
  const toY = v => pad.top + iH - ((v - minRet) / (maxRet - minRet || 1)) * iH

  const mvRisk = minVar?.risk ?? minVar?.volatility
  const mvRet = minVar?.return ?? minVar?.expected_return
  const msRisk = maxSharpe?.risk ?? maxSharpe?.volatility
  const msRet = maxSharpe?.return ?? maxSharpe?.expected_return

  return (
    <div className="flex flex-col gap-1">
      <span className="terminal-label">EFFICIENT FRONTIER</span>
      <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: '100%', height: '180px' }}>
        {/* Axes */}
        <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + iH} stroke="#1f2937" strokeWidth="1" />
        <line x1={pad.left} y1={pad.top + iH} x2={pad.left + iW} y2={pad.top + iH} stroke="#1f2937" strokeWidth="1" />

        {/* Axis labels */}
        <text x={pad.left + iW / 2} y={svgH - 4} fontSize="9" fill="#6b7280" textAnchor="middle" fontFamily="monospace">Risk</text>
        <text x={10} y={pad.top + iH / 2} fontSize="9" fill="#6b7280" textAnchor="middle" transform={`rotate(-90, 10, ${pad.top + iH / 2})`} fontFamily="monospace">Return</text>

        {/* Frontier dots */}
        {frontier.map((p, i) => {
          const risk = p.risk ?? p.volatility ?? p[0]
          const ret = p.return ?? p.expected_return ?? p[1]
          return (
            <circle
              key={i}
              cx={toX(risk)}
              cy={toY(ret)}
              r="2.5"
              fill="#3b82f6"
              opacity="0.5"
            />
          )
        })}

        {/* Min Variance highlight */}
        {mvRisk != null && mvRet != null && (
          <>
            <circle cx={toX(mvRisk)} cy={toY(mvRet)} r="5" fill="#26a69a" opacity="0.9" />
            <text x={toX(mvRisk) + 7} y={toY(mvRet) - 4} fontSize="8" fill="#26a69a" fontFamily="monospace">Min Var</text>
          </>
        )}

        {/* Max Sharpe highlight */}
        {msRisk != null && msRet != null && (
          <>
            <circle cx={toX(msRisk)} cy={toY(msRet)} r="5" fill="#f59e0b" opacity="0.9" />
            <text x={toX(msRisk) + 7} y={toY(msRet) - 4} fontSize="8" fill="#f59e0b" fontFamily="monospace">Max Sharpe</text>
          </>
        )}
      </svg>
    </div>
  )
}

function CorrelationMatrix({ matrix, symbols }) {
  if (!matrix || matrix.length === 0 || !symbols || symbols.length === 0) return null

  const colorFor = (v) => {
    // -1 = red, 0 = gray, +1 = green
    if (v >= 0) {
      const t = v
      const r = Math.round(38 + (26 - 38) * t)
      const g = Math.round(166 + (166 - 166) * t)
      const b = Math.round(154 + (154 - 154) * t)
      // simple: interpolate from gray to green
      const gray = [107, 114, 128]
      const green = [38, 166, 154]
      const rc = Math.round(gray[0] + (green[0] - gray[0]) * t)
      const gc = Math.round(gray[1] + (green[1] - gray[1]) * t)
      const bc = Math.round(gray[2] + (green[2] - gray[2]) * t)
      return `rgb(${rc},${gc},${bc})`
    } else {
      const t = -v
      const gray = [107, 114, 128]
      const red = [239, 83, 80]
      const rc = Math.round(gray[0] + (red[0] - gray[0]) * t)
      const gc = Math.round(gray[1] + (red[1] - gray[1]) * t)
      const bc = Math.round(gray[2] + (red[2] - gray[2]) * t)
      return `rgb(${rc},${gc},${bc})`
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="terminal-label">CORRELATION MATRIX</span>
      <div className="overflow-x-auto">
        <table className="text-xs font-mono border-collapse">
          <thead>
            <tr>
              <th className="w-16 text-terminal-dim p-1" />
              {symbols.map(s => (
                <th key={s} className="text-terminal-dim p-1 font-normal text-center" style={{ minWidth: '52px' }}>{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, i) => (
              <tr key={i}>
                <td className="text-terminal-dim p-1 text-right pr-2">{symbols[i]}</td>
                {row.map((val, j) => (
                  <td
                    key={j}
                    className="p-1 text-center tabular-nums"
                    style={{
                      background: `${colorFor(val)}22`,
                      color: colorFor(val),
                    }}
                  >
                    {val.toFixed(2)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function PortfolioOptimizer() {
  const [selected, setSelected] = useState(new Set(DEFAULT_SELECTED))
  const [months, setMonths] = useState(12)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  const toggleAsset = (asset) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(asset)) {
        if (next.size > 2) next.delete(asset) // keep minimum 2
      } else {
        next.add(asset)
      }
      return next
    })
  }

  const optimize = useCallback(async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch(`${API_BASE}/api/portfolio/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: Array.from(selected), months }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setResult(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [selected, months])

  const minVar = result?.min_variance || result?.min_var
  const maxSharpe = result?.max_sharpe
  const frontier = result?.efficient_frontier || result?.frontier || []
  const correlationMatrix = result?.correlation_matrix || result?.correlation
  const corrSymbols = result?.symbols || (minVar?.symbols) || Array.from(selected)

  const getWeights = (portfolio) => {
    if (!portfolio) return { syms: [], wts: [] }
    if (portfolio.weights && Array.isArray(portfolio.weights)) {
      const syms = portfolio.symbols || corrSymbols
      return { syms, wts: portfolio.weights }
    }
    if (portfolio.weights && typeof portfolio.weights === 'object') {
      const syms = Object.keys(portfolio.weights)
      const wts = Object.values(portfolio.weights)
      return { syms, wts }
    }
    return { syms: [], wts: [] }
  }

  const mvData = getWeights(minVar)
  const msData = getWeights(maxSharpe)

  return (
    <div className="terminal-card flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <PieChart size={16} className="text-terminal-blue" />
        <span className="font-bold text-sm tracking-wider text-terminal-text">PORTFOLIO OPTIMIZER — MARKOWITZ MEAN-VARIANCE</span>
      </div>

      {/* Asset selection */}
      <div className="flex flex-col gap-2">
        <span className="terminal-label">SELECT ASSETS</span>
        <div className="flex flex-wrap gap-2">
          {ALL_ASSETS.map((asset, i) => (
            <button
              key={asset}
              onClick={() => toggleAsset(asset)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-mono transition-all ${
                selected.has(asset)
                  ? 'border-opacity-60 text-terminal-text'
                  : 'border-terminal-border text-terminal-dim hover:text-terminal-text'
              }`}
              style={selected.has(asset) ? {
                borderColor: PALETTE[ALL_ASSETS.indexOf(asset) % PALETTE.length] + '80',
                background: PALETTE[ALL_ASSETS.indexOf(asset) % PALETTE.length] + '18',
                color: PALETTE[ALL_ASSETS.indexOf(asset) % PALETTE.length],
              } : {}}
            >
              <span
                className="w-2 h-2 rounded-sm"
                style={{ background: selected.has(asset) ? PALETTE[ALL_ASSETS.indexOf(asset) % PALETTE.length] : '#1f2937' }}
              />
              {asset}
            </button>
          ))}
        </div>
      </div>

      {/* Months + Optimize */}
      <div className="flex items-center gap-3">
        <span className="terminal-label">LOOKBACK</span>
        <div className="flex items-center gap-1">
          {MONTHS_OPTIONS.map(m => (
            <button
              key={m}
              onClick={() => setMonths(m)}
              className={`px-3 py-1 rounded text-xs font-mono transition-all ${
                months === m
                  ? 'bg-terminal-blue/20 text-terminal-blue border border-terminal-blue/40'
                  : 'text-terminal-dim border border-transparent hover:text-terminal-text'
              }`}
            >
              {m}M
            </button>
          ))}
        </div>
        <button
          onClick={optimize}
          disabled={loading || selected.size < 2}
          className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ml-2"
        >
          <TrendingUp size={13} />
          {loading ? 'Optimizing...' : 'Optimize Portfolio'}
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
          <div className="grid grid-cols-2 gap-4">
            <div className="skeleton h-64 rounded" />
            <div className="skeleton h-64 rounded" />
          </div>
          <div className="skeleton h-48 rounded" />
          <div className="skeleton h-36 rounded" />
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="flex flex-col gap-5 animate-fadeInUp">
          {/* Min Var / Max Sharpe side by side */}
          <div className="grid grid-cols-2 gap-4">
            {/* Min Variance */}
            {minVar && (
              <div className="flex flex-col gap-3 p-3 rounded border border-terminal-border bg-terminal-bg/40">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-terminal-green" style={{ boxShadow: '0 0 6px #26a69a' }} />
                  <span className="font-semibold text-xs tracking-wider text-terminal-text">MIN VARIANCE PORTFOLIO</span>
                </div>
                <DonutChart weights={mvData.wts} symbols={mvData.syms} />
                <div className="flex flex-col gap-1.5">
                  {mvData.syms.map((s, i) => (
                    <WeightBar key={s} symbol={s} weight={mvData.wts[i]} idx={ALL_ASSETS.indexOf(s)} />
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-terminal-border">
                  <div className="metric-card py-2">
                    <span className="terminal-label">Expected Return</span>
                    <span className="text-terminal-green font-bold tabular-nums">
                      {((minVar.expected_return ?? minVar.return ?? 0) * 100).toFixed(2)}%
                    </span>
                  </div>
                  <div className="metric-card py-2">
                    <span className="terminal-label">Risk (σ)</span>
                    <span className="text-terminal-yellow font-bold tabular-nums">
                      {((minVar.risk ?? minVar.volatility ?? 0) * 100).toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Max Sharpe */}
            {maxSharpe && (
              <div className="flex flex-col gap-3 p-3 rounded border border-terminal-border bg-terminal-bg/40">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-terminal-yellow" style={{ boxShadow: '0 0 6px #f59e0b' }} />
                  <span className="font-semibold text-xs tracking-wider text-terminal-text">MAX SHARPE PORTFOLIO</span>
                </div>
                <DonutChart weights={msData.wts} symbols={msData.syms} />
                <div className="flex flex-col gap-1.5">
                  {msData.syms.map((s, i) => (
                    <WeightBar key={s} symbol={s} weight={msData.wts[i]} idx={ALL_ASSETS.indexOf(s)} />
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1 border-t border-terminal-border">
                  <div className="metric-card py-2">
                    <span className="terminal-label">Sharpe</span>
                    <span className="text-terminal-blue font-bold tabular-nums">
                      {(maxSharpe.sharpe_ratio ?? maxSharpe.sharpe ?? 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="metric-card py-2">
                    <span className="terminal-label">Return</span>
                    <span className="text-terminal-green font-bold tabular-nums">
                      {((maxSharpe.expected_return ?? maxSharpe.return ?? 0) * 100).toFixed(2)}%
                    </span>
                  </div>
                  <div className="metric-card py-2">
                    <span className="terminal-label">Risk (σ)</span>
                    <span className="text-terminal-yellow font-bold tabular-nums">
                      {((maxSharpe.risk ?? maxSharpe.volatility ?? 0) * 100).toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Efficient Frontier */}
          {frontier.length > 0 && (
            <EfficientFrontier frontier={frontier} minVar={minVar} maxSharpe={maxSharpe} />
          )}

          {/* Correlation Matrix */}
          {correlationMatrix && (
            <CorrelationMatrix matrix={correlationMatrix} symbols={corrSymbols} />
          )}
        </div>
      )}

      {/* Empty state */}
      {!result && !loading && !error && (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-terminal-dim">
          <BarChart2 size={32} className="text-terminal-blue/40" />
          <span className="text-sm">Select assets and click Optimize Portfolio</span>
        </div>
      )}
    </div>
  )
}
