import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { useWebSocket, API_BASE } from '../hooks/useApi'

export default function MarketWatch({ onSelect, selected }) {
  const [quotes, setQuotes] = useState([])

  useWebSocket('/ws/quotes', (msg) => {
    if (msg.type === 'quotes') setQuotes(msg.data)
  })

  useEffect(() => {
    fetch(`${API_BASE}/api/quotes`).then(r => r.json()).then(d => setQuotes(d.quotes || []))
  }, [])

  return (
    <div className="terminal-card px-3 py-2 overflow-x-auto">
      <div className="flex gap-1 min-w-max">
        {quotes.map((q) => {
          const up = q.change_pct > 0
          const down = q.change_pct < 0
          const isSelected = selected === q.symbol
          return (
            <button
              key={q.symbol}
              onClick={() => onSelect?.(q.symbol)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded cursor-pointer transition-all border text-left
                ${isSelected
                  ? 'bg-terminal-blue/20 border-terminal-blue'
                  : 'bg-terminal-bg hover:bg-terminal-muted border-transparent hover:border-terminal-border'
                }`}
            >
              <div>
                <div className="text-xs text-terminal-dim">{q.label}</div>
                <div className="text-sm font-medium">{q.price?.toLocaleString('en-IN')}</div>
              </div>
              <div className={`text-xs flex items-center gap-0.5 ${up ? 'price-up' : down ? 'price-down' : 'text-terminal-dim'}`}>
                {up ? <TrendingUp size={10} /> : down ? <TrendingDown size={10} /> : <Minus size={10} />}
                {q.change_pct > 0 ? '+' : ''}{q.change_pct?.toFixed(2)}%
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
