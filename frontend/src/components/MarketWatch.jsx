import { useEffect, useState, useRef, useCallback } from 'react'
import { TrendingUp, TrendingDown, Minus, Search, X, Plus } from 'lucide-react'
import { useWebSocket, API_BASE } from '../hooks/useApi'

const CUSTOM_KEY = 'quantingv_custom_symbols'

function loadCustomSymbols() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]')
  } catch {
    return []
  }
}

function saveCustomSymbols(symbols) {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(symbols))
}

export default function MarketWatch({ onSelect, selected, onQuotesUpdate }) {
  const [quotes, setQuotes] = useState([])
  const [customSymbols, setCustomSymbols] = useState(loadCustomSymbols)
  const [customQuotes, setCustomQuotes] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const prevPrices = useRef({})
  const flashTimers = useRef({})
  const [flashStates, setFlashStates] = useState({})
  const searchRef = useRef(null)
  const debounceRef = useRef(null)

  const triggerFlash = useCallback((symbol, direction) => {
    if (flashTimers.current[symbol]) clearTimeout(flashTimers.current[symbol])
    setFlashStates(prev => ({ ...prev, [symbol]: direction }))
    flashTimers.current[symbol] = setTimeout(() => {
      setFlashStates(prev => { const n = { ...prev }; delete n[symbol]; return n })
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

  // Fetch quotes for custom symbols
  const refreshCustomQuotes = useCallback(async () => {
    if (!customSymbols.length) { setCustomQuotes([]); return }
    const results = await Promise.allSettled(
      customSymbols.map(cs =>
        fetch(`${API_BASE}/api/quote/any?ticker=${encodeURIComponent(cs.ticker)}&label=${encodeURIComponent(cs.label)}`)
          .then(r => r.json())
      )
    )
    const resolved = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value)
    setCustomQuotes(resolved)
  }, [customSymbols])

  useEffect(() => {
    refreshCustomQuotes()
    const id = setInterval(refreshCustomQuotes, 60_000)
    return () => clearInterval(id)
  }, [refreshCustomQuotes])

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      setSearching(false)
      return
    }
    clearTimeout(debounceRef.current)
    setSearching(true)
    debounceRef.current = setTimeout(() => {
      fetch(`${API_BASE}/api/search?q=${encodeURIComponent(searchQuery)}`)
        .then(r => r.json())
        .then(d => {
          setSearchResults(d.results || [])
          setSearching(false)
        })
        .catch(() => setSearching(false))
    }, 400)
    return () => clearTimeout(debounceRef.current)
  }, [searchQuery])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function addCustomSymbol(result) {
    const existing = customSymbols.find(c => c.ticker === result.ticker)
    if (existing) return
    const updated = [...customSymbols, { ticker: result.ticker, label: result.label }]
    setCustomSymbols(updated)
    saveCustomSymbols(updated)
    setSearchQuery('')
    setSearchOpen(false)
  }

  function removeCustomSymbol(ticker) {
    const updated = customSymbols.filter(c => c.ticker !== ticker)
    setCustomSymbols(updated)
    saveCustomSymbols(updated)
    setCustomQuotes(prev => prev.filter(q => q.symbol !== ticker))
  }

  const allQuotes = [...quotes, ...customQuotes]

  return (
    <div className="animate-fadeInUp bg-terminal-surface border-b border-terminal-border px-3 py-2">
      <div className="flex items-center gap-2">
        {/* Ticker tape */}
        <div className="flex gap-1 overflow-x-auto flex-1 min-w-0">
          {allQuotes.map((q) => {
            const up = q.change_pct > 0
            const down = q.change_pct < 0
            const isSelected = selected === q.symbol
            const flash = flashStates[q.symbol]
            const isCustom = customSymbols.some(c => c.ticker === q.symbol)

            return (
              <div key={q.symbol} className="relative flex-shrink-0">
                <button
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
                      <span className="text-terminal-dim text-xs">₹</span>
                      {q.price?.toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div className={`text-xs flex items-center gap-0.5 ${up ? 'price-up' : down ? 'price-down' : 'text-terminal-dim'}`}>
                    {up ? <TrendingUp size={10} /> : down ? <TrendingDown size={10} /> : <Minus size={10} />}
                    {q.change_pct > 0 ? '+' : ''}{q.change_pct?.toFixed(2)}%
                  </div>
                  <div
                    className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b"
                    style={{
                      background: up ? '#26a69a' : down ? '#ef5350' : '#374151',
                      opacity: up || down ? 0.8 : 0.3,
                    }}
                  />
                </button>
                {isCustom && (
                  <button
                    onClick={() => removeCustomSymbol(q.symbol)}
                    className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-terminal-red/80 hover:bg-terminal-red rounded-full flex items-center justify-center z-10"
                    title="Remove"
                  >
                    <X size={8} />
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* Search bar */}
        <div ref={searchRef} className="relative flex-shrink-0">
          <div className="flex items-center gap-1 bg-terminal-bg border border-terminal-border rounded px-2 py-1">
            <Search size={11} className="text-terminal-dim" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true) }}
              onFocus={() => setSearchOpen(true)}
              placeholder="Add symbol…"
              className="bg-transparent text-xs text-terminal-text placeholder:text-terminal-muted outline-none w-24"
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(''); setSearchResults([]) }}>
                <X size={10} className="text-terminal-dim hover:text-terminal-text" />
              </button>
            )}
          </div>

          {/* Dropdown */}
          {searchOpen && (searchResults.length > 0 || searching) && (
            <div className="absolute right-0 top-full mt-1 w-72 bg-terminal-surface border border-terminal-border rounded shadow-xl z-50 max-h-60 overflow-y-auto">
              {searching && (
                <div className="px-3 py-2 text-xs text-terminal-dim">Searching…</div>
              )}
              {!searching && searchResults.map(r => (
                <button
                  key={r.ticker}
                  onClick={() => addCustomSymbol(r)}
                  className="w-full flex items-center justify-between px-3 py-2 hover:bg-terminal-muted text-left transition-colors"
                >
                  <div>
                    <div className="text-xs font-medium text-terminal-text">{r.ticker}</div>
                    <div className="text-xs text-terminal-dim truncate max-w-[180px]">{r.label}</div>
                    <div className="text-xs text-terminal-muted">{r.exchange} · {r.type}</div>
                  </div>
                  <Plus size={12} className="text-terminal-blue flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
