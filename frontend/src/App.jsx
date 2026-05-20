import { useState, useEffect } from 'react'
import MarketWatch from './components/MarketWatch'
import MarketStats from './components/MarketStats'
import CandleChart from './components/CandleChart'
import AIPrediction from './components/AIPrediction'
import StrategyHouse from './components/StrategyHouse'
import WeeklyOutlook from './components/WeeklyOutlook'
import { Activity } from 'lucide-react'
import { API_BASE } from './hooks/useApi'

const TABS = ['Dashboard', 'Strategy House', 'Weekly Outlook']

function getISTNow() {
  const now = new Date()
  return new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 5.5 * 3600000)
}

function isMarketOpen() {
  const ist = getISTNow()
  const day = ist.getDay()
  if (day === 0 || day === 6) return false
  const mins = ist.getHours() * 60 + ist.getMinutes()
  return mins >= 9 * 60 + 15 && mins < 15 * 60 + 30
}

function LiveClock() {
  const [time, setTime] = useState('')

  useEffect(() => {
    const tick = () => {
      const ist = getISTNow()
      const hh = String(ist.getHours()).padStart(2, '0')
      const mm = String(ist.getMinutes()).padStart(2, '0')
      const ss = String(ist.getSeconds()).padStart(2, '0')
      setTime(`${hh}:${mm}:${ss} IST`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return <span className="text-terminal-text text-xs tabular-nums font-mono">{time}</span>
}

function MarketStatusBadge() {
  const [open, setOpen] = useState(isMarketOpen())

  useEffect(() => {
    const id = setInterval(() => setOpen(isMarketOpen()), 30000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded border text-xs font-medium
      ${open
        ? 'text-terminal-green border-terminal-green/30 bg-terminal-green/10'
        : 'text-terminal-red border-terminal-red/30 bg-terminal-red/10'
      }`}
    >
      <div
        className="w-1.5 h-1.5 rounded-full"
        style={{
          background: open ? '#26a69a' : '#ef5350',
          boxShadow: open ? '0 0 6px rgba(38,166,154,0.8)' : 'none',
          animation: open ? 'livePulse 1.5s ease-in-out infinite' : 'none',
        }}
      />
      {open ? 'MARKET OPEN' : 'MARKET CLOSED'}
    </div>
  )
}

export default function App() {
  const [selectedSymbol, setSelectedSymbol] = useState('GOLD')
  const [chartMarkers, setChartMarkers] = useState([])
  const [chartSymbol, setChartSymbol] = useState('GOLD')
  const [tab, setTab] = useState('Dashboard')
  const [quotes, setQuotes] = useState([])

  const handleMarkersUpdate = (markers, symbol) => {
    setChartMarkers(markers)
    setChartSymbol(symbol)
  }

  const handleSelectSymbol = (sym) => {
    setSelectedSymbol(sym)
    setChartSymbol(sym)
    setChartMarkers([])
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Bar */}
      <header className="border-b border-terminal-border px-4 py-3 flex items-center justify-between bg-terminal-surface/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Activity size={17} className="text-terminal-blue" style={{ filter: 'drop-shadow(0 0 5px rgba(59,130,246,0.5))' }} />
            <span className="font-bold text-sm tracking-widest glow-text-blue">QUANTINGV</span>
          </div>
          <span className="text-terminal-dim text-xs hidden sm:block">AI Quant Research Terminal</span>
        </div>

        <nav className="flex items-center gap-0.5">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`relative px-4 py-1.5 rounded text-xs font-medium transition-all duration-200
                ${tab === t
                  ? 'text-terminal-blue'
                  : 'text-terminal-dim hover:text-terminal-text'
                }`}
            >
              {t}
              {tab === t && (
                <span
                  className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-terminal-blue"
                  style={{ boxShadow: '0 0 6px rgba(59,130,246,0.6)' }}
                />
              )}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2.5">
          <MarketStatusBadge />
          <LiveClock />
          <span className="text-terminal-dim text-xs hidden md:block">
            {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
          </span>
        </div>
      </header>

      {/* Animated gradient line */}
      <div className="gradient-line" />

      {/* Market Watch Strip — also propagates quotes upward for MarketStats */}
      <MarketWatch onSelect={handleSelectSymbol} selected={selectedSymbol} onQuotesUpdate={setQuotes} />

      {/* Market Stats Bar */}
      <MarketStats quotes={quotes} />

      {/* Main Content */}
      <main className="flex-1 p-3 overflow-auto animate-fadeIn">
        {tab === 'Dashboard' && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <CandleChart symbol={chartSymbol} markers={chartMarkers} />
              </div>
              <div>
                <AIPrediction symbol={selectedSymbol} />
              </div>
            </div>
          </div>
        )}

        {tab === 'Strategy House' && (
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <StrategyHouse onMarkersUpdate={handleMarkersUpdate} />
            </div>
            <div className="col-span-2">
              <CandleChart symbol={chartSymbol} markers={chartMarkers} />
            </div>
          </div>
        )}

        {tab === 'Weekly Outlook' && (
          <div className="max-w-2xl">
            <WeeklyOutlook />
          </div>
        )}
      </main>

      {/* Footer: status + news ticker */}
      <footer className="border-t border-terminal-border bg-terminal-surface/60">
        {/* Status bar */}
        <div className="px-4 py-1 flex items-center justify-between text-terminal-dim text-xs border-b border-terminal-border/40">
          <span>Backend: <span className="text-terminal-green">●</span> Connected</span>
          <span>Data: Yahoo Finance · Gemini AI · Paper Trading</span>
          <span>QuantingV v0.1.0-alpha</span>
        </div>
        {/* News ticker */}
        <div className="flex items-center overflow-hidden">
          <div className="px-3 py-1.5 bg-terminal-blue/20 border-r border-terminal-border shrink-0">
            <span className="text-terminal-blue text-xs font-bold tracking-wider">NEWS</span>
          </div>
          <div className="overflow-hidden flex-1">
            <div className="animate-ticker py-1.5 text-xs text-terminal-dim whitespace-nowrap">
              {([
                'NIFTY 50 consolidates near all-time highs as FII buying resumes',
                'RBI holds repo rate steady at 6.5% in latest MPC meeting',
                'Gold hits record high amid global uncertainty and dollar weakness',
                'IT sector rally: TCS, Infosys, Wipro post strong Q4 earnings',
                'India GDP growth projected at 7.2% for FY26 by IMF',
                'BTC crosses $90K as institutional demand surges',
                'Reliance Industries Q4 net profit up 18% YoY',
                'India VIX at multi-month low — markets signal low volatility',
                'HDFC Bank merger synergies drive 22% loan growth in Q4',
                'Sensex crosses 75,000 for first time — bulls in control',
                'NIFTY 50 consolidates near all-time highs as FII buying resumes',
                'RBI holds repo rate steady at 6.5% in latest MPC meeting',
                'Gold hits record high amid global uncertainty and dollar weakness',
                'IT sector rally: TCS, Infosys, Wipro post strong Q4 earnings',
              ]).map((item, i) => (
                <span key={i} className="mx-8 inline-block">
                  <span className="text-terminal-blue mr-2">◆</span>
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
