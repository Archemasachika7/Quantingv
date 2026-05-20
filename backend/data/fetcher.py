import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta
from .assets import ALL_TICKERS
from .storage import upsert_ohlcv
from .indicators import compute_indicators


def fetch_live_quote(symbol: str) -> dict:
    """Fetch current quote for a symbol key (e.g. 'GOLD')."""
    meta = ALL_TICKERS.get(symbol)
    if not meta:
        return {}
    base = {"symbol": symbol, "label": meta["label"], "price": 0, "change": 0, "change_pct": 0,
            "currency": meta["currency"], "category": meta["category"]}
    try:
        # Use download() — more reliable on cloud hosts than fast_info
        df = yf.download(meta["ticker"], period="5d", interval="1d", auto_adjust=True,
                         progress=False, timeout=10)
        if df.empty:
            return base
        # Flatten MultiIndex columns if present (yfinance >=0.2.x single ticker can produce them)
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = [c[0].lower() for c in df.columns]
        else:
            df.columns = [c.lower() for c in df.columns]
        closes = df["close"].dropna()
        if len(closes) < 1:
            return base
        price = float(closes.iloc[-1])
        prev_close = float(closes.iloc[-2]) if len(closes) > 1 else price
        change = price - prev_close
        change_pct = (change / prev_close * 100) if prev_close else 0
        return {
            "symbol": symbol,
            "label": meta["label"],
            "price": round(price, 2),
            "change": round(change, 2),
            "change_pct": round(change_pct, 2),
            "currency": meta["currency"],
            "category": meta["category"],
        }
    except Exception:
        return base


def fetch_all_live_quotes() -> list[dict]:
    return [fetch_live_quote(s) for s in ALL_TICKERS]


def fetch_historical(symbol: str, months: int = 60) -> pd.DataFrame:
    """Fetch OHLCV history, compute indicators, return DataFrame."""
    meta = ALL_TICKERS.get(symbol)
    if not meta:
        raise ValueError(f"Unknown symbol: {symbol}")
    start = (datetime.now() - timedelta(days=months * 31)).strftime("%Y-%m-%d")
    df = yf.download(meta["ticker"], start=start, auto_adjust=True, progress=False, timeout=20)
    if df.empty:
        return df
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [c[0].lower() for c in df.columns]
    else:
        df.columns = [c.lower() for c in df.columns]
    df = compute_indicators(df)
    return df


def fetch_and_store_historical(symbol: str, months: int = 60):
    """Fetch historical data and persist to DB."""
    df = fetch_historical(symbol, months)
    if not df.empty:
        upsert_ohlcv(symbol, df[["open", "high", "low", "close", "volume"]])
    return df


def fetch_ohlcv_for_chart(symbol: str, period: str = "6mo", interval: str = "1d") -> list[dict]:
    """Return OHLCV list formatted for TradingView Lightweight Charts."""
    meta = ALL_TICKERS.get(symbol)
    if not meta:
        return []
    df = yf.download(meta["ticker"], period=period, interval=interval, auto_adjust=True,
                     progress=False, timeout=20)
    if df.empty:
        return []
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [c[0].lower() for c in df.columns]
    else:
        df.columns = [c.lower() for c in df.columns]
    records = []
    for ts, row in df.iterrows():
        try:
            t = int(ts.timestamp())
        except Exception:
            t = int(pd.Timestamp(ts).timestamp())
        records.append({
            "time": t,
            "open": round(float(row["open"]), 4),
            "high": round(float(row["high"]), 4),
            "low": round(float(row["low"]), 4),
            "close": round(float(row["close"]), 4),
            "volume": int(row.get("volume", 0) or 0),
        })
    return records
