import { useState } from 'react'
import { Play, ChevronDown, BarChart3 } from 'lucide-react'
import { apiPost } from '../hooks/useApi'

const BUILT_IN = [
  { name: 'sma_crossover', label: 'SMA Crossover (20/50)' },
  { name: 'rsi_reversal', label: 'RSI Reversal (30/70)' },
  { name: 'macd_momentum', label: 'MACD Momentum' },
  { name: 'bollinger_bands', label: 'Bollinger Band Reversion' },
  { name: 'custom', label: 'Custom Strategy (Python)' },
]

const CUSTOM_TEMPLATE = `def strategy(row, portfolio, history, symbol):
    # row: dict with close, open, high, low, volume, rsi, macd, sma_20, sma_50, ...
    # portfolio: has .buy(symbol, qty, price) and .sell(symbol, qty, price)
    # history: list of past rows

    rsi = row.get('rsi')
    if rsi is None:
        return

    has_position = symbol in portfolio.positions

    if rsi < 30 and not has_position:
        qty = portfolio.cash * 0.95 / row['close']
        portfolio.buy(symbol, qty=qty, price=row['close'])
    elif rsi > 70 and has_position:
        qty = portfolio.positions[symbol].qty
        portfolio.sell(symbol, qty=qty, price=row['close'])
`

const SYMBOLS = ['GOLD', 'SILVER', 'NIFTY50', 'BANKNIFTY', 'RELIANCE', 'TCS', 'HDFCBANK', 'BTC']
const MONTH_OPTIONS = [6, 12, 24, 36, 60]

export default function StrategyHouse({ onMarkersUpdate }) {
  const [strategy, setStrategy] = useState('sma_crossover')
  const [symbol, setSymbol] = useState('NIFTY50')
  const [months, setMonths] = useState(24)
  const [balance, setBalance] = useState(100000)
  const [customCode, setCustomCode] = useState(CUSTOM_TEMPLATE)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [critiqueLoading, setCritiqueLoading] = useState(false)
  const [critique, setCritique] = useState(null)

  const run = async () => {
    setRunning(true)
    setError(null)
    setResult(null)
    setCritique(null)
    try {
      const res = await apiPost('/backtest', {
        strategy_name: strategy === 'custom' ? 'custom' : strategy,
        symbol,
        months,
        initial_balance: balance,
        custom_code: strategy === 'custom' ? customCode : null,
      })
      setResult(res)
      onMarkersUpdate?.(res.markers || [], symbol)
    } catch (e) {
      setError(e.message)
    } finally {
      setRunning(false)
    }
  }

  const getCritique = async () => {
    if (!result?.metrics) return
    setCritiqueLoading(true)
    try {
      const res = await apiPost('/strategy/critique', {
        strategy_name: strategy,
        metrics: result.metrics,
      })
      setCritique(res.critique)
    } catch (e) {
      setCritique('Could not generate critique.')
    } finally {
      setCritiqueLoading(false)
    }
  }

  const m = result?.metrics

  return (
    <div className="terminal-card flex flex-col gap-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-terminal-border">
        <BarChart3 size={14} className="text-terminal-purple" />
        <span className="text-xs font-medium">STRATEGY HOUSE</span>
      </div>

      <div className="p-4 flex flex-col gap-3">
        {/* Controls */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="terminal-label block mb-1">Strategy</label>
            <select
              value={strategy}
              onChange={e => setStrategy(e.target.value)}
              className="w-full bg-terminal-bg border border-terminal-border rounded px-2 py-1.5 text-xs text-terminal-text"
            >
              {BUILT_IN.map(s => <option key={s.name} value={s.name}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="terminal-label block mb-1">Asset</label>
            <select
              value={symbol}
              onChange={e => setSymbol(e.target.value)}
              className="w-full bg-terminal-bg border border-terminal-border rounded px-2 py-1.5 text-xs text-terminal-text"
            >
              {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="terminal-label block mb-1">History</label>
            <select
              value={months}
              onChange={e => setMonths(Number(e.target.value))}
              className="w-full bg-terminal-bg border border-terminal-border rounded px-2 py-1.5 text-xs text-terminal-text"
            >
              {MONTH_OPTIONS.map(m => <option key={m} value={m}>{m} months</option>)}
            </select>
          </div>
          <div>
            <label className="terminal-label block mb-1">Start Balance</label>
            <input
              type="number"
              value={balance}
              onChange={e => setBalance(Number(e.target.value))}
              className="w-full bg-terminal-bg border border-terminal-border rounded px-2 py-1.5 text-xs text-terminal-text"
            />
          </div>
        </div>

        {/* Custom code editor */}
        {strategy === 'custom' && (
          <div>
            <label className="terminal-label block mb-1">Python Strategy</label>
            <textarea
              value={customCode}
              onChange={e => setCustomCode(e.target.value)}
              rows={10}
              spellCheck={false}
              className="w-full bg-terminal-bg border border-terminal-border rounded px-3 py-2 text-xs text-terminal-text font-mono resize-y"
            />
          </div>
        )}

        <button
          onClick={run}
          disabled={running}
          className={`btn-primary flex items-center gap-2 w-full justify-center ${!running && !result ? 'btn-pulse' : ''}`}
        >
          <Play size={12} />
          {running ? 'Running backtest...' : 'Run Backtest'}
        </button>

        {error && <div className="text-terminal-red text-xs bg-red-900/20 rounded p-2">{error}</div>}

        {/* Results */}
        {m && (
          <div className="space-y-3 animate-fadeInUp">
            {/* Result banner */}
            <div className={`rounded p-2.5 text-center border ${m.total_return_pct > 0
              ? 'border-terminal-green/30 bg-terminal-green/5'
              : 'border-terminal-red/30 bg-terminal-red/5'}`}>
              <div className={`text-lg font-bold ${m.total_return_pct > 0 ? 'glow-text-green' : 'glow-text-red'}`}>
                {m.total_return_pct > 0 ? '▲ PROFITABLE' : '▼ LOSING'}
              </div>
              <div className="text-xs text-terminal-dim mt-0.5">{result.symbol} · {strategy.replace(/_/g, ' ').toUpperCase()}</div>
            </div>

            {/* Key metrics grid */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Total Return', value: `${m.total_return_pct > 0 ? '+' : ''}${m.total_return_pct}%`, color: m.total_return_pct > 0 ? 'price-up' : 'price-down', positive: m.total_return_pct > 0 },
                { label: 'CAGR', value: `${m.cagr_pct > 0 ? '+' : ''}${m.cagr_pct}%`, color: m.cagr_pct > 0 ? 'price-up' : 'price-down', positive: m.cagr_pct > 0 },
                { label: 'Sharpe', value: m.sharpe_ratio, color: m.sharpe_ratio > 1 ? 'price-up' : m.sharpe_ratio > 0 ? 'text-terminal-yellow' : 'price-down', positive: m.sharpe_ratio > 1 },
                { label: 'Max DD', value: `-${m.max_drawdown_pct}%`, color: 'price-down', positive: false },
                { label: 'Win Rate', value: `${m.win_rate_pct}%`, color: m.win_rate_pct > 50 ? 'price-up' : 'price-down', positive: m.win_rate_pct > 50 },
                { label: 'Trades', value: m.num_trades, color: 'text-terminal-dim', positive: null },
                { label: 'Profit Factor', value: m.profit_factor, color: m.profit_factor > 1.5 ? 'price-up' : 'text-terminal-yellow', positive: m.profit_factor > 1.5 },
                { label: 'Final Equity', value: `₹${m.final_equity?.toLocaleString('en-IN')}`, color: 'text-terminal-text', positive: null },
                { label: 'Sortino', value: m.sortino_ratio, color: m.sortino_ratio > 1 ? 'price-up' : 'text-terminal-dim', positive: m.sortino_ratio > 1 },
              ].map((item, i) => (
                <div
                  key={item.label}
                  className="metric-card animate-fadeInUp"
                  style={{
                    animationDelay: `${i * 0.05}s`,
                    borderColor: item.positive === true
                      ? 'rgba(38,166,154,0.25)'
                      : item.positive === false
                        ? 'rgba(239,83,80,0.25)'
                        : undefined,
                  }}
                >
                  <div className="terminal-label">{item.label}</div>
                  <div className={`text-sm font-bold ${item.color}`}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* Trade summary */}
            <div className="text-xs text-terminal-dim">
              {m.num_wins} wins / {m.num_trades - m.num_wins} losses · Gross P: ₹{m.gross_profit?.toLocaleString('en-IN')} · Gross L: ₹{m.gross_loss?.toLocaleString('en-IN')}
            </div>

            {/* AI Critique */}
            <div>
              <button onClick={getCritique} disabled={critiqueLoading} className="btn-secondary text-xs flex items-center gap-1">
                {critiqueLoading ? 'Analyzing...' : '✦ Get AI Critique'}
              </button>
              {critique && (
                <div className="mt-2 glass-card p-2.5 text-xs text-terminal-dim leading-relaxed animate-fadeInUp">
                  {critique}
                </div>
              )}
            </div>

            {/* Error log */}
            {m.errors?.length > 0 && (
              <div className="text-terminal-red text-xs">
                {m.errors.slice(0, 3).join('\n')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
