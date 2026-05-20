import { useState, useEffect } from 'react'
import { Newspaper, RefreshCw } from 'lucide-react'
import { API_BASE } from '../hooks/useApi'

export default function WeeklyOutlook() {
  const [outlook, setOutlook] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = () => {
    setLoading(true)
    fetch(`${API_BASE}/api/weekly-outlook`)
      .then(r => r.json())
      .then(d => setOutlook(d))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  return (
    <div className="terminal-card">
      <div className="flex items-center justify-between px-4 py-2 border-b border-terminal-border">
        <div className="flex items-center gap-2">
          <Newspaper size={14} className="text-terminal-yellow" />
          <span className="text-xs font-medium">WEEKLY OUTLOOK</span>
        </div>
        <button onClick={load} disabled={loading} className="text-terminal-dim hover:text-terminal-text">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      <div className="p-4">
        {loading && !outlook && <div className="text-terminal-dim text-xs">Generating outlook...</div>}
        {outlook?.outlook && (
          <pre className="text-xs text-terminal-dim whitespace-pre-wrap leading-relaxed font-mono">
            {outlook.outlook}
          </pre>
        )}
        {outlook?.generated_at && (
          <div className="mt-2 text-terminal-muted text-xs">
            Generated: {new Date(outlook.generated_at).toLocaleString()}
          </div>
        )}
      </div>
    </div>
  )
}
