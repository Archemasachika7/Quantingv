import { useState } from 'react'
import MarketWatch from './components/MarketWatch'
import CandleChart from './components/CandleChart'
import AIPrediction from './components/AIPrediction'
import StrategyHouse from './components/StrategyHouse'
import WeeklyOutlook from './components/WeeklyOutlook'
import { Activity } from 'lucide-react'

const TABS = ['Dashboard', 'Strategy House', 'Weekly Outlook']

export default function App() {
  const [selectedSymbol, setSelectedSymbol] = useState('GOLD')
  const [chartMarkers, setChartMarkers] = useState([])
  const [chartSymbol, setChartSymbol] = useState('GOLD')
  const [tab, setTab] = useState('Dashboard')

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
      <header className="border-b border-terminal-border px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-terminal-blue" />
          <span className="font-semibold text-sm tracking-wide">QUANTINGV</span>
          <span className="text-terminal-dim text-xs">AI Quant Research Terminal</span>
        </div>
        <div className="flex items-center gap-1">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1 rounded text-xs transition-colors
                ${tab === t ? 'bg-terminal-blue/20 text-terminal-blue border border-terminal-blue/30' : 'text-terminal-dim hover:text-terminal-text'}`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="text-terminal-dim text-xs">
          {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
        </div>
      </header>

      {/* Market Watch Strip */}
      <div className="border-b border-terminal-border">
        <MarketWatch onSelect={handleSelectSymbol} selected={selectedSymbol} />
      </div>

      {/* Main Content */}
      <main className="flex-1 p-3 overflow-auto">
        {tab === 'Dashboard' && (
          <div className="flex flex-col gap-3">
            {/* Chart + AI Panel */}
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

      {/* Status bar */}
      <footer className="border-t border-terminal-border px-4 py-1 flex items-center justify-between text-terminal-dim text-xs">
        <span>Backend: <span className="text-terminal-green">●</span> Connected</span>
        <span>Data: Yahoo Finance · Gemini AI · Paper Trading</span>
        <span>QuantingV v0.1.0-alpha</span>
      </footer>
    </div>
  )
}
