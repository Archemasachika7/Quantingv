import yfinance as yf
import pandas as pd
import requests
from datetime import datetime, timedelta
from .assets import ALL_TICKERS
from .storage import upsert_ohlcv
from .indicators import compute_indicators

_SESSION = None


def _get_session() -> requests.Session:
    """Reusable session with browser User-Agent to avoid Yahoo Finance bot blocks."""
    global _SESSION
    if _SESSION is None:
        _SESSION = requests.Session()
        _SESSION.headers.update({
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        })
    return _SESSION


def _flatten_cols(df: pd.DataFrame) -> pd.DataFrame:
    """Flatten MultiIndex columns yfinance >=0.2.x sometimes produces."""
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [c[0].lower() for c in df.columns]
    else:
        df.columns = [c.lower() for c in df.columns]
    return df


def fetch_live_quote(symbol: str) -> dict:
    meta = ALL_TICKERS.get(symbol)
    if not meta:
        return {}
    base = {"symbol": symbol, "label": meta["label"], "price": 0, "change": 0,
            "change_pct": 0, "currency": meta["currency"], "category": meta["category"]}
    try:
        df = yf.download(
            meta["ticker"], period="5d", interval="1d",
            auto_adjust=True, progress=False,
            session=_get_session(),
        )
        if df.empty:
            return base
        df = _flatten_cols(df)
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
    meta = ALL_TICKERS.get(symbol)
    if not meta:
        raise ValueError(f"Unknown symbol: {symbol}")
    start = (datetime.now() - timedelta(days=months * 31)).strftime("%Y-%m-%d")
    df = yf.download(
        meta["ticker"], start=start, auto_adjust=True, progress=False,
        session=_get_session(),
    )
    if df.empty:
        return df
    df = _flatten_cols(df)
    df = compute_indicators(df)
    return df


def fetch_and_store_historical(symbol: str, months: int = 60):
    df = fetch_historical(symbol, months)
    if not df.empty:
        upsert_ohlcv(symbol, df[["open", "high", "low", "close", "volume"]])
    return df


def fetch_ohlcv_for_chart(symbol: str, period: str = "6mo", interval: str = "1d") -> list[dict]:
    meta = ALL_TICKERS.get(symbol)
    if not meta:
        return []
    df = yf.download(
        meta["ticker"], period=period, interval=interval,
        auto_adjust=True, progress=False,
        session=_get_session(),
    )
    if df.empty:
        return []
    df = _flatten_cols(df)
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
