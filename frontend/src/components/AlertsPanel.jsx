import { useEffect, useState, useCallback } from 'react'
import { Bell, ArrowRight, RefreshCw, CheckCircle2, AlertTriangle, ShieldAlert } from 'lucide-react'
import { API_BASE } from '../hooks/useApi'

const SEVERITY_CONFIG = {
  HIGH: {
    label: 'HIGH',
    color: '#ef5350',
    borderColor: 'border-terminal-red/40',
    bgColor: 'bg-terminal-red/5',
    badgeClass: 'badge-bearish',
    glow: '0 0 12px rgba(239,83,80,0.3)',
  },
  MEDIUM: {
    label: 'MED',
    color: '#f59e0b',
    borderColor: 'border-yellow-500/40',
    bgColor: 'bg-yellow-500/5',
    badgeClass: 'badge-neutral',
    glow: '0 0 8px rgba(245,158,11,0.2)',
  },
  LOW: {
    label: 'LOW',
    color: '#3b82f6',
    borderColor: 'border-terminal-blue/30',
    bgColor: 'bg-terminal-blue/5',
    badgeClass: 'badge-bullish',
    glow: '0 0 6px rgba(59,130,246,0.15)',
  },
}

function DirectionBadge({ label, isModel }) {
  const dir = (label || '').toUpperCase()
  if (dir === 'BULLISH' || dir === 'BUY' || dir === 'LONG') {
    return (
      <span className="badge-bullish text-xs px-2 py-0.5 rounded">
        {isModel ? '🤖' : '💬'} {label}
      </span>
    )
  }
  if (dir === 'BEARISH' || dir === 'SELL' || dir === 'SHORT') {
    return (
      <span className="badge-bearish text-xs px-2 py-0.5 rounded">
        {isModel ? '🤖' : '💬'} {label}
      </span>
    )
  }
  return (
    <span className="badge-neutral text-xs px-2 py-0.5 rounded">
      {isModel ? '🤖' : '💬'} {label}
    </span>
  )
}

function AlertCard({ alert, index }) {
  const severity = (alert.severity || 'LOW').toUpperCase()
  const cfg = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.LOW

  return (
    <div
      className={`flex flex-col gap-2 p-3 rounded border ${cfg.borderColor} ${cfg.bgColor} animate-fadeInUp`}
      style={{
        animationDelay: `${index * 80}ms`,
        boxShadow: cfg.glow,
      }}
    >
      {/* Top row: severity + symbol + alert type */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* Severity badge */}
          <span
            className="text-xs font-bold px-1.5 py-0.5 rounded"
            style={{
              color: cfg.color,
              background: cfg.color + '20',
              border: `1px solid ${cfg.color}50`,
            }}
          >
            {cfg.label}
          </span>
          {/* Symbol */}
          <span className="font-bold text-sm text-terminal-text font-mono">{alert.symbol}</span>
          {/* Alert type */}
          {alert.alert_type && (
            <span className="text-xs text-terminal-dim">— {alert.alert_type}</span>
          )}
        </div>
        {/* Confidence */}
        {alert.confidence != null && (
          <span
            className="text-xs font-mono tabular-nums"
            style={{ color: cfg.color }}
          >
            {(alert.confidence * 100).toFixed(0)}% conf
          </span>
        )}
      </div>

      {/* Message */}
      {alert.message && (
        <p className="text-xs text-terminal-text leading-relaxed">{alert.message}</p>
      )}

      {/* Model direction vs sentiment */}
      {(alert.model_direction || alert.sentiment) && (
        <div className="flex items-center gap-2 flex-wrap">
          {alert.model_direction && (
            <DirectionBadge label={alert.model_direction} isModel={true} />
          )}
          {alert.model_direction && alert.sentiment && (
            <ArrowRight size={12} className="text-terminal-dim shrink-0" />
          )}
          {alert.sentiment && (
            <DirectionBadge label={alert.sentiment} isModel={false} />
          )}
        </div>
      )}
    </div>
  )
}

export default function AlertsPanel() {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastFetch, setLastFetch] = useState(null)

  const fetchAlerts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/alerts`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      // API may return array or { alerts: [...] }
      setAlerts(Array.isArray(data) ? data : data.alerts || [])
      setLastFetch(new Date())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch on mount
  useEffect(() => {
    fetchAlerts()
  }, [fetchAlerts])

  // Auto-refresh every 60s
  useEffect(() => {
    const id = setInterval(fetchAlerts, 60000)
    return () => clearInterval(id)
  }, [fetchAlerts])

  const hasHigh = alerts.some(a => (a.severity || '').toUpperCase() === 'HIGH')
  const highCount = alerts.filter(a => (a.severity || '').toUpperCase() === 'HIGH').length
  const medCount = alerts.filter(a => (a.severity || '').toUpperCase() === 'MEDIUM').length

  return (
    <div className="terminal-card flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative">
            {hasHigh ? (
              <ShieldAlert size={16} className="text-terminal-red" />
            ) : (
              <Bell size={16} className="text-terminal-blue" />
            )}
            {hasHigh && (
              <span
                className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-terminal-red"
                style={{ animation: 'livePulse 1.5s ease-in-out infinite' }}
              />
            )}
          </div>
          <span className="font-bold text-sm tracking-wider text-terminal-text">
            ALERTS — DIVERGENCE MONITOR
          </span>
          {alerts.length > 0 && (
            <span className="flex items-center gap-1">
              {hasHigh && (
                <span className="text-xs px-1.5 py-0.5 rounded font-bold"
                  style={{ color: '#ef5350', background: '#ef535020', border: '1px solid #ef535050' }}>
                  {highCount} HIGH
                </span>
              )}
              {medCount > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded font-bold"
                  style={{ color: '#f59e0b', background: '#f59e0b20', border: '1px solid #f59e0b50' }}>
                  {medCount} MED
                </span>
              )}
              <span className="text-xs text-terminal-dim font-mono">{alerts.length} total</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {lastFetch && (
            <span className="text-xs text-terminal-dim font-mono">
              Updated {lastFetch.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <button
            onClick={fetchAlerts}
            disabled={loading}
            className="btn-secondary flex items-center gap-1 text-xs py-1 px-2 disabled:opacity-50"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded border border-terminal-red/30 bg-terminal-red/10 text-terminal-red text-xs">
          <AlertTriangle size={13} />
          Failed to load alerts: {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !alerts.length && (
        <div className="flex flex-col gap-2 animate-pulse">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="skeleton h-20 rounded" />
          ))}
        </div>
      )}

      {/* Alerts list */}
      {!loading && alerts.length > 0 && (
        <div className="flex flex-col gap-2">
          {alerts.map((alert, i) => (
            <AlertCard key={alert.id || `${alert.symbol}-${i}`} alert={alert} index={i} />
          ))}
        </div>
      )}

      {/* No alerts state */}
      {!loading && alerts.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-14 gap-3">
          <CheckCircle2 size={36} className="text-terminal-green" style={{ filter: 'drop-shadow(0 0 8px rgba(38,166,154,0.4))' }} />
          <span className="text-terminal-green text-sm font-medium">
            No divergences detected — models and sentiment are aligned
          </span>
          <span className="text-terminal-dim text-xs">Auto-refreshes every 60 seconds</span>
        </div>
      )}

      {/* Footer note */}
      <div className="flex items-center justify-between text-xs text-terminal-dim pt-1 border-t border-terminal-border/40">
        <span>Divergence alerts fire when AI model direction conflicts with market sentiment</span>
        <span className="font-mono">60s auto-refresh</span>
      </div>
    </div>
  )
}
