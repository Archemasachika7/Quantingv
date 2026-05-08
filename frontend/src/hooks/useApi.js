import { useState, useEffect, useCallback } from 'react'

// In production (Vercel), set VITE_API_URL to your Railway backend URL.
// In local dev, Vite proxies /api and /ws to localhost:8000.
const API_BASE = import.meta.env.VITE_API_URL || ''

export function useApi(path, options = {}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetch_ = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api${path}`, options)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [path])

  useEffect(() => { fetch_() }, [fetch_])

  return { data, loading, error, refetch: fetch_ }
}

export async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

export function useWebSocket(path, onMessage) {
  useEffect(() => {
    // Derive WS URL from API_BASE or fall back to same-host proxy
    let wsUrl
    if (API_BASE) {
      wsUrl = API_BASE.replace(/^https?/, (p) => p === 'https' ? 'wss' : 'ws') + path
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      wsUrl = `${protocol}//${window.location.host}${path}`
    }

    let ws
    let closed = false

    const connect = () => {
      ws = new WebSocket(wsUrl)
      ws.onmessage = (e) => onMessage(JSON.parse(e.data))
      ws.onclose = () => { if (!closed) setTimeout(connect, 3000) }
    }
    connect()

    return () => {
      closed = true
      ws?.close()
    }
  }, [path])
}
