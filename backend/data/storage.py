"""
Storage layer — uses Supabase (PostgreSQL) when SUPABASE_URL is set,
falls back to SQLite for local dev without credentials.
"""
from __future__ import annotations
import os
import sqlite3
import pandas as pd
from pathlib import Path
from datetime import datetime

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
USE_SUPABASE = bool(SUPABASE_URL and SUPABASE_SERVICE_KEY)

DB_PATH = Path(__file__).parent.parent.parent / "quantingv.db"

# ── Supabase client (lazy) ────────────────────────────────────────────────────

_supabase = None

def _get_supabase():
    global _supabase
    if _supabase is None:
        from supabase import create_client
        _supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    return _supabase


# ── SQLite fallback ───────────────────────────────────────────────────────────

def _sqlite_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Only needed for SQLite fallback."""
    if USE_SUPABASE:
        return
    with _sqlite_conn() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS ohlcv (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL, ts TEXT NOT NULL,
            open REAL, high REAL, low REAL, close REAL, volume REAL,
            UNIQUE(symbol, ts)
        );
        CREATE INDEX IF NOT EXISTS idx_ohlcv_symbol_ts ON ohlcv(symbol, ts);
        CREATE TABLE IF NOT EXISTS predictions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL, created_at TEXT NOT NULL, horizon_days INTEGER NOT NULL,
            direction TEXT, confidence REAL, price_low REAL, price_high REAL,
            forecast_price REAL, model_name TEXT, ai_explanation TEXT,
            UNIQUE(symbol, created_at, horizon_days)
        );
        CREATE TABLE IF NOT EXISTS sentiment (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT, ts TEXT NOT NULL, score REAL, label TEXT, source TEXT, headline TEXT
        );
        CREATE TABLE IF NOT EXISTS portfolios (
            id TEXT PRIMARY KEY, user_id TEXT, name TEXT NOT NULL,
            initial_balance REAL NOT NULL DEFAULT 100000,
            currency TEXT NOT NULL DEFAULT 'INR', created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS trades (
            id TEXT PRIMARY KEY, portfolio_id TEXT NOT NULL, user_id TEXT,
            symbol TEXT NOT NULL, side TEXT NOT NULL, qty REAL NOT NULL,
            price REAL NOT NULL, pnl REAL DEFAULT 0,
            strategy_name TEXT, notes TEXT, ts TEXT NOT NULL
        );
        """)


# ── OHLCV ─────────────────────────────────────────────────────────────────────

def upsert_ohlcv(symbol: str, df: pd.DataFrame):
    df = df.reset_index()
    date_col = "Date" if "Date" in df.columns else df.columns[0]
    records = [
        {
            "symbol": symbol,
            "ts": str(row[date_col])[:10],
            "open": float(row.get("open", 0) or 0),
            "high": float(row.get("high", 0) or 0),
            "low": float(row.get("low", 0) or 0),
            "close": float(row.get("close", 0) or 0),
            "volume": float(row.get("volume", 0) or 0),
        }
        for _, row in df.iterrows()
    ]
    if USE_SUPABASE:
        sb = _get_supabase()
        # upsert in chunks of 500
        for i in range(0, len(records), 500):
            sb.table("ohlcv").upsert(records[i:i+500], on_conflict="symbol,ts").execute()
    else:
        with _sqlite_conn() as conn:
            conn.executemany(
                "INSERT OR REPLACE INTO ohlcv (symbol,ts,open,high,low,close,volume) VALUES(:symbol,:ts,:open,:high,:low,:close,:volume)",
                records,
            )


def load_ohlcv(symbol: str, start: str | None = None, end: str | None = None) -> pd.DataFrame:
    if USE_SUPABASE:
        sb = _get_supabase()
        query = sb.table("ohlcv").select("ts,open,high,low,close,volume").eq("symbol", symbol).order("ts")
        if start:
            query = query.gte("ts", start)
        if end:
            query = query.lte("ts", end)
        rows = query.execute().data
        if not rows:
            return pd.DataFrame()
        df = pd.DataFrame(rows)
        df["ts"] = pd.to_datetime(df["ts"])
        return df.set_index("ts")
    else:
        query = "SELECT ts, open, high, low, close, volume FROM ohlcv WHERE symbol = ?"
        params: list = [symbol]
        if start:
            query += " AND ts >= ?"; params.append(start)
        if end:
            query += " AND ts <= ?"; params.append(end)
        query += " ORDER BY ts ASC"
        with _sqlite_conn() as conn:
            return pd.read_sql_query(query, conn, params=params, parse_dates=["ts"], index_col="ts")


# ── Predictions ───────────────────────────────────────────────────────────────

def save_prediction(symbol: str, horizon_days: int, direction: str, confidence: float,
                    price_low: float, price_high: float, model_name: str,
                    ai_explanation: str = "", forecast_price: float = 0.0):
    now = datetime.utcnow().isoformat()
    record = {
        "symbol": symbol, "created_at": now, "horizon_days": horizon_days,
        "direction": direction, "confidence": confidence,
        "price_low": price_low, "price_high": price_high,
        "forecast_price": forecast_price, "model_name": model_name,
        "ai_explanation": ai_explanation,
    }
    if USE_SUPABASE:
        _get_supabase().table("predictions").upsert(record).execute()
    else:
        with _sqlite_conn() as conn:
            conn.execute(
                """INSERT OR REPLACE INTO predictions
                   (symbol,created_at,horizon_days,direction,confidence,price_low,price_high,forecast_price,model_name,ai_explanation)
                   VALUES (:symbol,:created_at,:horizon_days,:direction,:confidence,:price_low,:price_high,:forecast_price,:model_name,:ai_explanation)""",
                record,
            )


def get_latest_prediction(symbol: str, horizon_days: int = 7) -> dict | None:
    if USE_SUPABASE:
        rows = (
            _get_supabase().table("predictions")
            .select("*").eq("symbol", symbol).eq("horizon_days", horizon_days)
            .order("created_at", desc=True).limit(1).execute().data
        )
        return rows[0] if rows else None
    else:
        with _sqlite_conn() as conn:
            row = conn.execute(
                "SELECT * FROM predictions WHERE symbol=? AND horizon_days=? ORDER BY created_at DESC LIMIT 1",
                (symbol, horizon_days),
            ).fetchone()
        return dict(row) if row else None


# ── Sentiment ─────────────────────────────────────────────────────────────────

def save_sentiment(symbol: str | None, score: float, label: str, source: str, headline: str):
    record = {"symbol": symbol, "ts": datetime.utcnow().isoformat(), "score": score, "label": label, "source": source, "headline": headline}
    if USE_SUPABASE:
        _get_supabase().table("sentiment").insert(record).execute()
    else:
        with _sqlite_conn() as conn:
            conn.execute(
                "INSERT INTO sentiment (symbol,ts,score,label,source,headline) VALUES (:symbol,:ts,:score,:label,:source,:headline)",
                record,
            )


def get_sentiment_avg(symbol: str, hours: int = 24) -> dict:
    if USE_SUPABASE:
        from datetime import timedelta
        since = (datetime.utcnow() - timedelta(hours=hours)).isoformat()
        rows = (
            _get_supabase().table("sentiment")
            .select("score").eq("symbol", symbol).gte("ts", since).execute().data
        )
        scores = [r["score"] for r in rows if r.get("score") is not None]
        avg = sum(scores) / len(scores) if scores else 0.0
        label = "Bullish" if avg > 0.15 else ("Bearish" if avg < -0.15 else "Neutral")
        return {"avg_score": round(avg, 4), "count": len(scores), "label": label}
    else:
        with _sqlite_conn() as conn:
            row = conn.execute(
                "SELECT AVG(score) as avg_score, COUNT(*) as count FROM sentiment WHERE (symbol=? OR symbol IS NULL) AND ts >= datetime('now',?)",
                (symbol, f"-{hours} hours"),
            ).fetchone()
        avg = row["avg_score"] if row and row["avg_score"] is not None else 0.0
        label = "Bullish" if avg > 0.15 else ("Bearish" if avg < -0.15 else "Neutral")
        return {"avg_score": round(avg, 4), "count": row["count"] if row else 0, "label": label}


# ── Portfolio (Supabase-backed) ───────────────────────────────────────────────

def create_portfolio(user_id: str, name: str = "My Portfolio",
                     initial_balance: float = 100_000, currency: str = "INR") -> dict:
    record = {
        "user_id": user_id, "name": name,
        "initial_balance": initial_balance, "currency": currency,
    }
    if USE_SUPABASE:
        res = _get_supabase().table("portfolios").insert(record).execute()
        return res.data[0] if res.data else {}
    else:
        import uuid
        pid = str(uuid.uuid4())[:8]
        record.update({"id": pid, "created_at": datetime.utcnow().isoformat()})
        with _sqlite_conn() as conn:
            conn.execute(
                "INSERT INTO portfolios (id,user_id,name,initial_balance,currency,created_at) VALUES (:id,:user_id,:name,:initial_balance,:currency,:created_at)",
                record,
            )
        return record


def get_portfolios(user_id: str) -> list[dict]:
    if USE_SUPABASE:
        return _get_supabase().table("portfolios").select("*").eq("user_id", user_id).execute().data
    else:
        with _sqlite_conn() as conn:
            rows = conn.execute("SELECT * FROM portfolios WHERE user_id=?", (user_id,)).fetchall()
        return [dict(r) for r in rows]


def save_trade(portfolio_id: str, user_id: str, symbol: str, side: str,
               qty: float, price: float, pnl: float = 0.0,
               strategy_name: str = "", notes: str = "") -> dict:
    record = {
        "portfolio_id": portfolio_id, "user_id": user_id,
        "symbol": symbol, "side": side, "qty": qty, "price": price,
        "pnl": pnl, "strategy_name": strategy_name, "notes": notes,
    }
    if USE_SUPABASE:
        res = _get_supabase().table("trades").insert(record).execute()
        return res.data[0] if res.data else {}
    else:
        import uuid
        record.update({"id": str(uuid.uuid4())[:8], "ts": datetime.utcnow().isoformat()})
        with _sqlite_conn() as conn:
            conn.execute(
                "INSERT INTO trades (id,portfolio_id,user_id,symbol,side,qty,price,pnl,strategy_name,notes,ts) VALUES (:id,:portfolio_id,:user_id,:symbol,:side,:qty,:price,:pnl,:strategy_name,:notes,:ts)",
                record,
            )
        return record


def get_trades(portfolio_id: str) -> list[dict]:
    if USE_SUPABASE:
        return _get_supabase().table("trades").select("*").eq("portfolio_id", portfolio_id).order("ts", desc=True).execute().data
    else:
        with _sqlite_conn() as conn:
            rows = conn.execute("SELECT * FROM trades WHERE portfolio_id=? ORDER BY ts DESC", (portfolio_id,)).fetchall()
        return [dict(r) for r in rows]


# ── Paper Trading (session-based, in-memory + SQLite) ─────────────────────────

import time as _time

_PAPER_STATE: dict = {
    "cash": 100_000.0,
    "positions": {},       # {symbol: {"qty": float, "avg_price": float, "label": str}}
    "initial_balance": 100_000.0,
}
_PAPER_TRADES: list[dict] = []
_PAPER_TRADE_COUNTER: list[int] = [0]  # mutable counter


def get_paper_portfolio() -> dict:
    """Return current paper portfolio state."""
    positions = _PAPER_STATE["positions"]
    market_value = sum(pos["qty"] * pos["avg_price"] for pos in positions.values())
    cash = _PAPER_STATE["cash"]
    initial = _PAPER_STATE["initial_balance"]
    total_value = cash + market_value
    pnl_total = total_value - initial
    pnl_pct = (pnl_total / initial) * 100 if initial > 0 else 0.0
    return {
        "cash": round(cash, 2),
        "initial_balance": round(initial, 2),
        "positions": {sym: dict(pos) for sym, pos in positions.items()},
        "total_value": round(total_value, 2),
        "pnl_total": round(pnl_total, 2),
        "pnl_pct": round(pnl_pct, 2),
        "num_trades": len(_PAPER_TRADES),
    }


def paper_buy(symbol: str, qty: float, price: float) -> dict:
    """Execute a paper buy. Returns updated portfolio."""
    if qty <= 0:
        return {"error": "Quantity must be greater than 0"}
    cost = qty * price
    if _PAPER_STATE["cash"] < cost:
        return {"error": f"Insufficient cash. Need ₹{cost:,.2f}, have ₹{_PAPER_STATE['cash']:,.2f}"}

    _PAPER_STATE["cash"] -= cost

    positions = _PAPER_STATE["positions"]
    if symbol in positions:
        existing = positions[symbol]
        total_qty = existing["qty"] + qty
        avg_price = (existing["qty"] * existing["avg_price"] + qty * price) / total_qty
        positions[symbol]["qty"] = total_qty
        positions[symbol]["avg_price"] = round(avg_price, 4)
    else:
        positions[symbol] = {"qty": qty, "avg_price": round(price, 4), "label": symbol}

    _PAPER_TRADE_COUNTER[0] += 1
    trade = {
        "id": _PAPER_TRADE_COUNTER[0],
        "symbol": symbol,
        "side": "BUY",
        "qty": qty,
        "price": round(price, 4),
        "total": round(cost, 2),
        "pnl": 0.0,
        "ts": datetime.utcnow().isoformat(),
        "label": symbol,
    }
    _PAPER_TRADES.insert(0, trade)

    return get_paper_portfolio()


def paper_sell(symbol: str, qty: float, price: float) -> dict:
    """Execute a paper sell. Returns updated portfolio and trade PnL."""
    if qty <= 0:
        return {"error": "Quantity must be greater than 0"}

    positions = _PAPER_STATE["positions"]
    if symbol not in positions:
        return {"error": f"No position in {symbol}"}

    pos = positions[symbol]
    if pos["qty"] < qty:
        return {"error": f"Insufficient position. Have {pos['qty']}, trying to sell {qty}"}

    avg_price = pos["avg_price"]
    pnl = qty * (price - avg_price)
    proceeds = qty * price

    _PAPER_STATE["cash"] += proceeds
    pos["qty"] = round(pos["qty"] - qty, 8)

    if pos["qty"] <= 1e-8:
        del positions[symbol]

    _PAPER_TRADE_COUNTER[0] += 1
    trade = {
        "id": _PAPER_TRADE_COUNTER[0],
        "symbol": symbol,
        "side": "SELL",
        "qty": qty,
        "price": round(price, 4),
        "total": round(proceeds, 2),
        "pnl": round(pnl, 2),
        "ts": datetime.utcnow().isoformat(),
        "label": symbol,
    }
    _PAPER_TRADES.insert(0, trade)

    return get_paper_portfolio()


def get_paper_trades() -> list[dict]:
    """Return all paper trades sorted by time desc."""
    return list(_PAPER_TRADES)


def reset_paper_portfolio() -> dict:
    """Reset portfolio to initial state (₹1,00,000 cash)."""
    _PAPER_STATE["cash"] = 100_000.0
    _PAPER_STATE["positions"] = {}
    _PAPER_STATE["initial_balance"] = 100_000.0
    _PAPER_TRADES.clear()
    _PAPER_TRADE_COUNTER[0] = 0
    return get_paper_portfolio()
