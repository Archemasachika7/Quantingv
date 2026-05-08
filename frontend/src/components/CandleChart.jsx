import { useEffect, useRef, useState } from 'react'
import { createChart, CrosshairMode } from 'lightweight-charts'

const PERIODS = ['1mo', '3mo', '6mo', '1y', '2y', '5y']

export default function CandleChart({ symbol, markers = [] }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const candleRef = useRef(null)
  const volumeRef = useRef(null)
  const markerSeriesRef = useRef(null)
  const [period, setPeriod] = useState('6mo')
  const [loading, setLoading] = useState(true)
  const [crosshair, setCrosshair] = useState(null)

  // Init chart once
  useEffect(() => {
    if (!containerRef.current) return
    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: '#111827' },
        textColor: '#9ca3af',
      },
      grid: {
        vertLines: { color: '#1f2937' },
        horzLines: { color: '#1f2937' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#1f2937' },
      timeScale: { borderColor: '#1f2937', timeVisible: true },
      width: containerRef.current.clientWidth,
      height: 380,
    })

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderDownColor: '#ef5350',
      borderUpColor: '#26a69a',
      wickDownColor: '#ef5350',
      wickUpColor: '#26a69a',
    })

    const volumeSeries = chart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      scaleMargins: { top: 0.85, bottom: 0 },
    })

    chart.subscribeCrosshairMove((param) => {
      if (param.time && candleRef.current) {
        const price = param.seriesData.get(candleSeries)
        if (price) setCrosshair({ time: param.time, ...price })
      }
    })

    const resize = () => {
      chart.applyOptions({ width: containerRef.current?.clientWidth || 800 })
    }
    window.addEventListener('resize', resize)

    chartRef.current = chart
    candleRef.current = candleSeries
    volumeRef.current = volumeSeries

    return () => {
      window.removeEventListener('resize', resize)
      chart.remove()
    }
  }, [])

  // Load data when symbol or period changes
  useEffect(() => {
    if (!candleRef.current) return
    setLoading(true)
    fetch(`/api/chart/${symbol}?period=${period}`)
      .then(r => r.json())
      .then(d => {
        const candles = d.candles || []
        candleRef.current.setData(candles)
        volumeRef.current.setData(
          candles.map(c => ({
            time: c.time,
            value: c.volume,
            color: c.close >= c.open ? '#26a69a33' : '#ef535033',
          }))
        )
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [symbol, period])

  // Apply trade markers
  useEffect(() => {
    if (!candleRef.current || !markers.length) return
    candleRef.current.setMarkers(
      markers.map(m => ({
        time: m.time,
        position: m.position || (m.side === 'BUY' ? 'belowBar' : 'aboveBar'),
        color: m.side === 'BUY' ? '#26a69a' : '#ef5350',
        shape: m.side === 'BUY' ? 'arrowUp' : 'arrowDown',
        text: m.text || '',
        size: 1,
      }))
    )
  }, [markers])

  return (
    <div className="terminal-card flex flex-col">
      {/* Chart Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-terminal-border">
        <div className="flex items-center gap-3">
          <span className="font-medium">{symbol}</span>
          {crosshair && (
            <span className="text-terminal-dim text-xs">
              O:{crosshair.open?.toFixed(2)} H:{crosshair.high?.toFixed(2)} L:{crosshair.low?.toFixed(2)} C:{crosshair.close?.toFixed(2)}
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {PERIODS.map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-2 py-0.5 rounded text-xs transition-colors
                ${period === p ? 'bg-terminal-blue text-white' : 'text-terminal-dim hover:text-terminal-text'}`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-terminal-surface/80 z-10">
            <span className="text-terminal-dim text-xs">Loading chart...</span>
          </div>
        )}
        <div ref={containerRef} />
      </div>

      {/* Legend */}
      {markers.length > 0 && (
        <div className="flex items-center gap-4 px-4 py-1.5 border-t border-terminal-border text-xs text-terminal-dim">
          <span className="flex items-center gap-1">
            <span className="text-terminal-green">▲</span> BUY entry
          </span>
          <span className="flex items-center gap-1">
            <span className="text-terminal-red">▼</span> SELL exit
          </span>
          <span className="text-terminal-muted">{markers.length} trades marked</span>
        </div>
      )}
    </div>
  )
}
