import { useEffect, useState, useRef, useCallback } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { useWebSocket, API_BASE } from '../hooks/useApi'

// Determine currency symbol based on asset type
function getCurrencySymbol(symbol) {
  if (!symbol) return '₹'
  const s = symbol.toUpperCase()
  if (s === 'BTC' || s === 'ETH' || s.includes('USD')) return '$'
  return '₹'
}

export default function MarketWatch({ onSelect, selected, onQuotesUpdate }) {
  const [quotes, setQuotes] = useState([])
  const prevPrices = useRef({})
  const flashTimers = useRef({})
  const [flashStates, setFlashStates] = useState({})

  const triggerFlash = useCallback((symbol, direction) => {
    // Clear any existing timer
    if (flashTimers.current[symbol]) {
      clearTimeout(flashTimers.current[symbol])
    }

    setFlashStates(prev => ({ ...prev, [symbol]: direction }))

    flashTimers.current[symbol] = setTimeout(() => {
      setFlashStates(prev => {
        const next = { ...prev }
        delete next[symbol]
        return next
      })
    }, 600)
  }, [])

  const updateQuotes = useCallback((newQuotes) => {
    setQuotes(prev => {
      newQuotes.forEach(q => {
        const prevPrice = prevPrices.current[q.symbol]
        if (prevPrice !== undefined && prevPrice !== q.price) {
          triggerFlash(q.symbol, q.price > prevPrice ? 'up' : 'down')
        }
        prevPrices.current[q.symbol] = q.price
      })
      return newQuotes
    })
    onQuotesUpdate?.(newQuotes)
  }, [triggerFlash, onQuotesUpdate])

  useWebSocket('/ws/quotes', (msg) => {
    if (msg.type === 'quotes') updateQuotes(msg.data)
  })

  useEffect(() => {
    fetch(`${API_BASE}/api/quotes`)
      .then(r => r.json())
      .then(d => updateQuotes(d.quotes || []))
  }, [])

  return (
    <div className="animate-fadeInUp bg-terminal-surface border-b border-terminal-border px-3 py-2 overflow-x-auto">
      <div className="flex gap-1 min-w-max">
        {quotes.map((q) => {
          const up = q.change_pct > 0
          const down = q.change_pct < 0
          const isSelected = selected === q.symbol
          const flash = flashStates[q.symbol]
          const currencySymbol = getCurrencySymbol(q.symbol)

          return (
            <button
              key={q.symbol}
              onClick={() => onSelect?.(q.symbol)}
              className={`relative flex items-center gap-2 px-3 py-1.5 rounded cursor-pointer transition-all border text-left overflow-hidden
                ${isSelected
                  ? 'bg-terminal-blue/20 border-terminal-blue/60'
                  : 'bg-terminal-bg hover:bg-terminal-muted border-transparent hover:border-terminal-border'
                }
                ${flash === 'up' ? 'price-flash-up' : flash === 'down' ? 'price-flash-down' : ''}
              `}
            >
              <div>
                <div className="text-xs text-terminal-dim">{q.label}</div>
                <div className="text-sm font-medium">
                  <span className="text-terminal-dim text-xs">{currencySymbol}</span>
                  {q.price?.toLocaleString('en-IN')}
                </div>
              </div>
              <div className={`text-xs flex items-center gap-0.5 ${up ? 'price-up' : down ? 'price-down' : 'text-terminal-dim'}`}>
                {up ? <TrendingUp size={10} /> : down ? <TrendingDown size={10} /> : <Minus size={10} />}
                {q.change_pct > 0 ? '+' : ''}{q.change_pct?.toFixed(2)}%
              </div>

              {/* Thin colored indicator bar at the bottom */}
              <div
                className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b"
                style={{
                  background: up ? '#26a69a' : down ? '#ef5350' : '#374151',
                  opacity: up || down ? 0.8 : 0.3,
                }}
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}
