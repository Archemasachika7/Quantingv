import { useState, useEffect, useCallback } from 'react'
import {
  Wallet, TrendingUp, TrendingDown, RefreshCw, AlertTriangle,
  CheckCircle2, Plus, Minus, RotateCcw, ShoppingCart, ArrowUpRight,
  ArrowDownRight, Clock, Lightbulb, ChevronDown,
} from 'lucide-react'
import { API_BASE } from '../hooks/useApi'

const SYMBOLS = [
  'GOLD', 'SILVER', 'NIFTY50', 'BANKNIFTY',
  'RELIANCE', 'TCS', 'HDFCBANK', 'BTC', 'ETH',
  'WIPRO', 'TATAMOTORS', 'SBIN', 'ICICIBANK', 'INFY',
]

function fmt(n, decimals = 2) {
  if (n == null) return '—'
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function fmtCurr(n) {
  if (n == null) return '—'
  return '₹' + fmt(n)
}

function PnlBadge({ value, pct, size = 'sm' }) {
  const positive = value >= 0
  const textSize = size === 'lg' ? 'text-base' : 'text-xs'
  return (
    <span className={`flex items-center gap-0.5 font-mono tabular-nums font-semibold ${textSize} ${positive ? 'text-terminal-green' : 'text-terminal-red'}`}>
      {positive ? <ArrowUpRight size={size === 'lg' ? 14 : 11} /> : <ArrowDownRight size={size === 'lg' ? 14 : 11} />}
      {positive ? '+' : ''}{fmtCurr(value)}
      {pct != null && (
        <span className="opacity-75 ml-1">({positive ? '+' : ''}{fmt(pct)}%)</span>
      )}
    </span>
  )
}

function Toast({ message, type, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3500)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div
      className={`fixed top-20 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg border shadow-xl animate-fadeInUp text-sm font-medium
        ${type === 'success'
          ? 'bg-terminal-green/10 border-terminal-green/40 text-terminal-green'
          : 'bg-terminal-red/10 border-terminal-red/40 text-terminal-red'
        }`}
      style={{ backdropFilter: 'blur(8px)', minWidth: '220px' }}
    >
      {type === 'success'
        ? <CheckCircle2 size={15} />
        : <AlertTriangle size={15} />
      }
      {message}
    </div>
  )
}

function SkeletonBlock({ h = 'h-5', w = 'w-full' }) {
  return <div className={`skeleton rounded ${h} ${w}`} />
}

export default function PaperTrading() {
  // Portfolio state
  const [portfolio, setPortfolio] = useState(null)
  const [trades, setTrades] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Order form state
  const [symbol, setSymbol] = useState('RELIANCE')
  const [side, setSide] = useState('BUY')
  const [qty, setQty] = useState(1)
  const [ordering, setOrdering] = useState(false)
  const [orderError, setOrderError] = useState(null)

  // Toast
  const [toast, setToast] = useState(null)

  // Reset confirm
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetting, setResetting] = useState(false)

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [portRes, tradesRes] = await Promise.all([
        fetch(`${API_BASE}/api/paper/portfolio`),
        fetch(`${API_BASE}/api/paper/trades`),
      ])
      if (!portRes.ok) throw new Error(`Portfolio fetch failed: HTTP ${portRes.status}`)
      if (!tradesRes.ok) throw new Error(`Trades fetch failed: HTTP ${tradesRes.status}`)
      const portData = await portRes.json()
      const tradesData = await tradesRes.json()
      setPortfolio(portData)
      setTrades(tradesData.trades || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Mount + auto-refresh
  useEffect(() => {
    fetchAll()
    const id = setInterval(fetchAll, 30000)
    return () => clearInterval(id)
  }, [fetchAll])

  // ── Order actions ──────────────────────────────────────────────────────────

  const executeOrder = async () => {
    if (qty <= 0) {
      setOrderError('Quantity must be at least 1')
      return
    }
    setOrdering(true)
    setOrderError(null)
    try {
      const endpoint = side === 'BUY' ? '/api/paper/buy' : '/api/paper/sell'
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, qty: Number(qty) }),
      })
      const data = await res.json()
      if (!res.ok) {
        const msg = data.detail || `HTTP ${res.status}`
        setOrderError(msg)
        setToast({ message: msg, type: 'error' })
        return
      }
      setToast({
        message: `${side} ${qty} ${symbol} @ ₹${fmt(data.executed_price)} executed!`,
        type: 'success',
      })
      // Refresh portfolio + trades
      fetchAll()
    } catch (e) {
      setOrderError(e.message)
      setToast({ message: e.message, type: 'error' })
    } finally {
      setOrdering(false)
    }
  }

  const handleReset = async () => {
    if (!confirmReset) {
      setConfirmReset(true)
      return
    }
    setResetting(true)
    setConfirmReset(false)
    try {
      const res = await fetch(`${API_BASE}/api/paper/reset`, { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setPortfolio({ ...data, positions: {}, total_market_value: 0, total_pnl: 0, total_pnl_pct: 0, total_value: data.cash })
      setTrades([])
      setToast({ message: 'Portfolio reset to ₹1,00,000', type: 'success' })
    } catch (e) {
      setToast({ message: 'Reset failed: ' + e.message, type: 'error' })
    } finally {
      setResetting(false)
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const positions = portfolio?.positions || {}
  const posSymbols = Object.keys(positions)

  // Estimate value from current position data (or last known price)
  const estPrice = positions[symbol]?.live_price ?? null
  const estValue = estPrice != null ? qty * estPrice : null

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-3 animate-fadeIn">
      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}

      {/* Beginner tip callout */}
      <div
        className="flex items-start gap-3 px-4 py-3 rounded-lg border border-terminal-blue/30 bg-terminal-blue/5"
        style={{ boxShadow: '0 0 16px rgba(59,130,246,0.08)' }}
      >
        <Lightbulb size={16} className="text-terminal-blue mt-0.5 shrink-0" />
        <div className="flex flex-col gap-0.5">
          <span className="text-terminal-blue text-xs font-bold tracking-wider">
            PAPER TRADING MODE — PRACTICE SIMULATOR
          </span>
          <span className="text-terminal-dim text-xs leading-relaxed">
            Practice with <span className="text-terminal-text font-semibold">₹1,00,000 virtual money</span>. No real money involved.
            Master market mechanics, test your instincts, and build confidence before trading with real capital.
          </span>
        </div>
      </div>

      {/* Portfolio summary bar */}
      <div className="terminal-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Total value */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Wallet size={16} className="text-terminal-blue" />
              <span className="terminal-label">PORTFOLIO</span>
            </div>
            {loading && !portfolio ? (
              <div className="flex gap-3">
                <SkeletonBlock h="h-6" w="w-28" />
                <SkeletonBlock h="h-6" w="w-20" />
              </div>
            ) : portfolio ? (
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex flex-col">
                  <span className="text-terminal-dim text-xs">Total Value</span>
                  <span className="glow-text-green font-bold text-lg font-mono tabular-nums">
                    {fmtCurr(portfolio.total_value)}
                  </span>
                </div>
                <PnlBadge value={portfolio.total_pnl} pct={portfolio.total_pnl_pct} size="lg" />
                <div className="flex flex-col">
                  <span className="text-terminal-dim text-xs">Cash Available</span>
                  <span className="text-terminal-text font-mono tabular-nums font-semibold">
                    {fmtCurr(portfolio.cash)}
                  </span>
                </div>
                {posSymbols.length > 0 && (
                  <div className="flex flex-col">
                    <span className="text-terminal-dim text-xs">Market Value</span>
                    <span className="text-terminal-text font-mono tabular-nums font-semibold">
                      {fmtCurr(portfolio.total_market_value)}
                    </span>
                  </div>
                )}
                <div className="flex flex-col">
                  <span className="text-terminal-dim text-xs">Trades</span>
                  <span className="text-terminal-text font-mono tabular-nums font-semibold">
                    {portfolio.num_trades}
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={fetchAll}
              disabled={loading}
              className="btn-secondary flex items-center gap-1.5 text-xs py-1.5 px-3 disabled:opacity-50"
            >
              <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            {confirmReset ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-terminal-red">Sure? This resets to ₹1,00,000</span>
                <button
                  onClick={handleReset}
                  disabled={resetting}
                  className="text-xs px-3 py-1.5 rounded border border-terminal-red/50 bg-terminal-red/10 text-terminal-red hover:bg-terminal-red/20 transition-colors disabled:opacity-50"
                >
                  {resetting ? 'Resetting…' : 'Yes, Reset'}
                </button>
                <button
                  onClick={() => setConfirmReset(false)}
                  className="text-xs px-2 py-1.5 rounded border border-terminal-border text-terminal-dim hover:text-terminal-text transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 text-xs py-1.5 px-3 rounded border border-terminal-border text-terminal-dim hover:text-terminal-text hover:border-terminal-red/40 transition-all"
              >
                <RotateCcw size={11} />
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded border border-terminal-red/30 bg-terminal-red/10 text-terminal-red text-xs">
          <AlertTriangle size={13} />
          {error}
        </div>
      )}

      {/* Main 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        {/* ── Left: Place Order ── */}
        <div className="lg:col-span-2 terminal-card flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <ShoppingCart size={14} className="text-terminal-blue" />
            <span className="terminal-label">PLACE ORDER</span>
          </div>

          {/* Symbol selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-terminal-dim font-medium">Symbol</label>
            <div className="relative">
              <select
                value={symbol}
                onChange={e => setSymbol(e.target.value)}
                className="w-full appearance-none bg-terminal-bg border border-terminal-border rounded px-3 py-2.5 text-sm text-terminal-text font-mono focus:outline-none focus:border-terminal-blue/50 transition-colors pr-8"
              >
                {SYMBOLS.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-terminal-dim pointer-events-none" />
            </div>
            {/* Live price hint */}
            {positions[symbol]?.live_price && (
              <span className="text-xs text-terminal-dim font-mono">
                Last: <span className="text-terminal-text">{fmtCurr(positions[symbol].live_price)}</span>
              </span>
            )}
          </div>

          {/* BUY / SELL toggle */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-terminal-dim font-medium">Order Side</label>
            <div className="flex rounded overflow-hidden border border-terminal-border">
              <button
                onClick={() => setSide('BUY')}
                className={`flex-1 py-2.5 text-sm font-bold tracking-wider transition-all
                  ${side === 'BUY'
                    ? 'bg-terminal-green/20 text-terminal-green border-r border-terminal-green/30'
                    : 'text-terminal-dim hover:text-terminal-text border-r border-terminal-border'
                  }`}
              >
                BUY
              </button>
              <button
                onClick={() => setSide('SELL')}
                className={`flex-1 py-2.5 text-sm font-bold tracking-wider transition-all
                  ${side === 'SELL'
                    ? 'bg-terminal-red/20 text-terminal-red'
                    : 'text-terminal-dim hover:text-terminal-text'
                  }`}
              >
                SELL
              </button>
            </div>
          </div>

          {/* Quantity */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-terminal-dim font-medium">Quantity</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setQty(q => Math.max(1, q - 1))}
                className="w-9 h-9 rounded border border-terminal-border flex items-center justify-center text-terminal-dim hover:text-terminal-text hover:border-terminal-blue/40 transition-all"
              >
                <Minus size={13} />
              </button>
              <input
                type="number"
                min="1"
                step="1"
                value={qty}
                onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="flex-1 bg-terminal-bg border border-terminal-border rounded px-3 py-2 text-center text-sm font-mono text-terminal-text focus:outline-none focus:border-terminal-blue/50 transition-colors"
              />
              <button
                onClick={() => setQty(q => q + 1)}
                className="w-9 h-9 rounded border border-terminal-border flex items-center justify-center text-terminal-dim hover:text-terminal-text hover:border-terminal-blue/40 transition-all"
              >
                <Plus size={13} />
              </button>
            </div>
          </div>

          {/* Estimated value */}
          <div className="flex items-center justify-between px-3 py-2.5 rounded bg-terminal-surface border border-terminal-border/60">
            <span className="text-xs text-terminal-dim">Est. Value</span>
            <span className="text-sm font-mono font-semibold text-terminal-text">
              {estValue != null ? fmtCurr(estValue) : '—'}
            </span>
          </div>

          {/* SELL: show current position info */}
          {side === 'SELL' && positions[symbol] && (
            <div className="flex items-center justify-between px-3 py-2 rounded bg-terminal-green/5 border border-terminal-green/20 text-xs">
              <span className="text-terminal-dim">Your position</span>
              <span className="font-mono text-terminal-green font-semibold">{positions[symbol].qty} units @ {fmtCurr(positions[symbol].avg_price)}</span>
            </div>
          )}
          {side === 'SELL' && !positions[symbol] && (
            <div className="flex items-center gap-1.5 px-3 py-2 rounded bg-terminal-red/5 border border-terminal-red/20 text-xs text-terminal-red">
              <AlertTriangle size={11} />
              You have no position in {symbol}
            </div>
          )}

          {/* Order error */}
          {orderError && (
            <div className="flex items-center gap-1.5 px-3 py-2 rounded bg-terminal-red/10 border border-terminal-red/30 text-xs text-terminal-red">
              <AlertTriangle size={11} />
              {orderError}
            </div>
          )}

          {/* Execute button */}
          <button
            onClick={executeOrder}
            disabled={ordering}
            className={`w-full py-3 rounded font-bold text-sm tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed
              ${side === 'BUY'
                ? 'bg-terminal-green/15 border border-terminal-green/40 text-terminal-green hover:bg-terminal-green/25 hover:shadow-[0_0_12px_rgba(38,166,154,0.3)]'
                : 'bg-terminal-red/15 border border-terminal-red/40 text-terminal-red hover:bg-terminal-red/25 hover:shadow-[0_0_12px_rgba(239,83,80,0.3)]'
              }`}
          >
            {ordering
              ? `EXECUTING ${side}…`
              : `${side === 'BUY' ? 'BUY' : 'SELL'} ${qty} ${symbol}`
            }
          </button>

          {/* Beginner tip for selected action */}
          <div className="text-xs text-terminal-dim leading-relaxed bg-terminal-surface/50 rounded px-3 py-2 border border-terminal-border/40">
            {side === 'BUY' ? (
              <>
                <span className="text-terminal-green font-semibold">BUY</span> — You are purchasing {qty} unit{qty > 1 ? 's' : ''} of {symbol}. The cost will be deducted from your virtual cash.
              </>
            ) : (
              <>
                <span className="text-terminal-red font-semibold">SELL</span> — You are selling {qty} unit{qty > 1 ? 's' : ''} of {symbol}. Proceeds will be added to your virtual cash, and your P&amp;L will be realised.
              </>
            )}
          </div>
        </div>

        {/* ── Right: Positions + Trades ── */}
        <div className="lg:col-span-3 flex flex-col gap-3">
          {/* Positions */}
          <div className="terminal-card flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp size={14} className="text-terminal-green" />
                <span className="terminal-label">MY POSITIONS</span>
              </div>
              {posSymbols.length > 0 && (
                <span className="text-xs text-terminal-dim font-mono">{posSymbols.length} active</span>
              )}
            </div>

            {loading && !portfolio ? (
              <div className="flex flex-col gap-2 animate-pulse">
                {[0, 1, 2].map(i => <SkeletonBlock key={i} h="h-14" />)}
              </div>
            ) : posSymbols.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <TrendingUp size={28} className="text-terminal-dim/40" />
                <span className="text-terminal-dim text-xs text-center">
                  No positions yet. Place your first order using the panel on the left.
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {/* Header row */}
                <div className="grid grid-cols-6 gap-2 px-2 py-1 text-xs text-terminal-dim font-medium border-b border-terminal-border/40">
                  <span className="col-span-1">Symbol</span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">Avg Price</span>
                  <span className="text-right">Live Price</span>
                  <span className="text-right">Mkt Value</span>
                  <span className="text-right">Unrealised P&L</span>
                </div>
                {posSymbols.map((sym, i) => {
                  const pos = positions[sym]
                  const pnlPositive = pos.unrealised_pnl >= 0
                  return (
                    <div
                      key={sym}
                      className="grid grid-cols-6 gap-2 px-2 py-2.5 rounded border border-terminal-border/40 bg-terminal-surface/30 hover:bg-terminal-surface/60 transition-colors animate-fadeInUp"
                      style={{ animationDelay: `${i * 60}ms` }}
                    >
                      <span className="col-span-1 font-mono font-bold text-xs text-terminal-text">{sym}</span>
                      <span className="text-right text-xs font-mono text-terminal-text tabular-nums">{pos.qty}</span>
                      <span className="text-right text-xs font-mono text-terminal-dim tabular-nums">{fmtCurr(pos.avg_price)}</span>
                      <span className="text-right text-xs font-mono text-terminal-text tabular-nums">{fmtCurr(pos.live_price)}</span>
                      <span className="text-right text-xs font-mono text-terminal-text tabular-nums">{fmtCurr(pos.market_value)}</span>
                      <span className={`text-right text-xs font-mono font-semibold tabular-nums ${pnlPositive ? 'text-terminal-green' : 'text-terminal-red'}`}>
                        {pnlPositive ? '+' : ''}{fmtCurr(pos.unrealised_pnl)}
                        <span className="text-xs opacity-70 ml-0.5">
                          ({pnlPositive ? '+' : ''}{fmt(pos.unrealised_pnl_pct)}%)
                        </span>
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Trade History */}
          <div className="terminal-card flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-terminal-blue" />
                <span className="terminal-label">TRADE HISTORY</span>
              </div>
              {trades.length > 0 && (
                <span className="text-xs text-terminal-dim font-mono">{trades.length} trade{trades.length !== 1 ? 's' : ''}</span>
              )}
            </div>

            {loading && !trades.length ? (
              <div className="flex flex-col gap-2 animate-pulse">
                {[0, 1, 2].map(i => <SkeletonBlock key={i} h="h-10" />)}
              </div>
            ) : trades.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 gap-2">
                <Clock size={24} className="text-terminal-dim/40" />
                <span className="text-terminal-dim text-xs text-center">
                  No trades yet. Your executed orders will appear here.
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto pr-1">
                {trades.map((trade, i) => {
                  const isBuy = trade.side === 'BUY'
                  const pnlPositive = (trade.pnl || 0) >= 0
                  const ts = new Date(trade.ts)
                  const timeStr = ts.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
                  const dateStr = ts.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
                  return (
                    <div
                      key={trade.id || i}
                      className="flex items-center justify-between px-3 py-2 rounded border border-terminal-border/30 bg-terminal-surface/20 hover:bg-terminal-surface/50 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        {/* Side badge */}
                        <span
                          className={`text-xs font-bold px-1.5 py-0.5 rounded shrink-0
                            ${isBuy
                              ? 'text-terminal-green bg-terminal-green/15 border border-terminal-green/30'
                              : 'text-terminal-red bg-terminal-red/15 border border-terminal-red/30'
                            }`}
                        >
                          {trade.side}
                        </span>
                        <div className="flex flex-col gap-0">
                          <span className="text-xs font-mono font-semibold text-terminal-text">
                            {trade.qty} {trade.symbol} @ {fmtCurr(trade.price)}
                          </span>
                          <span className="text-xs text-terminal-dim font-mono">
                            Total: {fmtCurr(trade.total)}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-0">
                        {!isBuy && trade.pnl != null && (
                          <span className={`text-xs font-mono font-semibold ${pnlPositive ? 'text-terminal-green' : 'text-terminal-red'}`}>
                            P&L: {pnlPositive ? '+' : ''}{fmtCurr(trade.pnl)}
                          </span>
                        )}
                        <span className="text-xs text-terminal-dim font-mono tabular-nums">
                          {dateStr} {timeStr}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer tip */}
      <div className="flex items-center justify-between text-xs text-terminal-dim px-1">
        <span>All prices are live from Yahoo Finance · Virtual money only · No real trades</span>
        <span className="font-mono">Auto-refresh: 30s</span>
      </div>
    </div>
  )
}
