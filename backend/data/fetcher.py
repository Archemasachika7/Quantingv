"""
Market data fetcher — calls Yahoo Finance v8 chart API directly via requests.
This avoids yfinance's crumb/cookie mechanism which fails on cloud hosts.
"""
import requests
import pandas as pd
from datetime import datetime, timedelta
from .assets import ALL_TICKERS
from .storage import upsert_ohlcv
from .indicators import compute_indicators

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://finance.yahoo.com",
    "Referer": "https://finance.yahoo.com/",
}

_SESSION: requests.Session | None = None


def _session() -> requests.Session:
    global _SESSION
    if _SESSION is None:
        _SESSION = requests.Session()
        _SESSION.headers.update(_HEADERS)
    return _SESSION


def _yahoo_chart(ticker: str, period: str = "6mo", interval: str = "1d") -> pd.DataFrame:
    """Fetch OHLCV from Yahoo Finance v8 chart endpoint (no crumb needed)."""
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
    params = {
        "range": period,
        "interval": interval,
        "includePrePost": "false",
        "events": "div,splits",
    }
    try:
        resp = _session().get(url, params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        # Fallback mirror
        url2 = url.replace("query1", "query2")
        resp = requests.get(url2, params=params, headers=_HEADERS, timeout=15)
        resp.raise_for_status()
        data = resp.json()

    result = data.get("chart", {}).get("result") or []
    if not result:
        return pd.DataFrame()

    r = result[0]
    timestamps = r.get("timestamp", [])
    if not timestamps:
        return pd.DataFrame()

    quote = r["indicators"]["quote"][0]
    adj = r["indicators"].get("adjclose", [{}])[0].get("adjclose") or quote["close"]

    df = pd.DataFrame({
        "open": quote["open"],
        "high": quote["high"],
        "low": quote["low"],
        "close": adj,
        "volume": quote["volume"],
    }, index=pd.to_datetime(timestamps, unit="s", utc=True).tz_convert(None))

    return df.dropna(subset=["close"])


def _yahoo_chart_range(ticker: str, start: str) -> pd.DataFrame:
    """Fetch OHLCV from a start date using Unix timestamps."""
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
    period1 = int(datetime.strptime(start, "%Y-%m-%d").timestamp())
    period2 = int(datetime.now().timestamp())
    params = {
        "period1": period1,
        "period2": period2,
        "interval": "1d",
        "includePrePost": "false",
        "events": "div,splits",
    }
    try:
        resp = _session().get(url, params=params, timeout=20)
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        url2 = url.replace("query1", "query2")
        resp = requests.get(url2, params=params, headers=_HEADERS, timeout=20)
        resp.raise_for_status()
        data = resp.json()

    result = data.get("chart", {}).get("result") or []
    if not result:
        return pd.DataFrame()

    r = result[0]
    timestamps = r.get("timestamp", [])
    if not timestamps:
        return pd.DataFrame()

    quote = r["indicators"]["quote"][0]
    adj = r["indicators"].get("adjclose", [{}])[0].get("adjclose") or quote["close"]

    df = pd.DataFrame({
        "open": quote["open"],
        "high": quote["high"],
        "low": quote["low"],
        "close": adj,
        "volume": quote["volume"],
    }, index=pd.to_datetime(timestamps, unit="s", utc=True).tz_convert(None))

    return df.dropna(subset=["close"])


def fetch_live_quote(symbol: str) -> dict:
    meta = ALL_TICKERS.get(symbol)
    if not meta:
        return {}
    base = {"symbol": symbol, "label": meta["label"], "price": 0, "change": 0,
            "change_pct": 0, "currency": meta["currency"], "category": meta["category"]}
    try:
        df = _yahoo_chart(meta["ticker"], period="5d", interval="1d")
        if df.empty:
            return base
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
    df = _yahoo_chart_range(meta["ticker"], start=start)
    if df.empty:
        return df
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
    # Yahoo Finance has no 3h interval — resample from 1h
    if interval == "3h":
        df = _yahoo_chart(meta["ticker"], period=period, interval="1h")
        if not df.empty:
            df = df.resample("3h").agg(
                {"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}
            ).dropna(subset=["close"])
    else:
        df = _yahoo_chart(meta["ticker"], period=period, interval=interval)
    if df.empty:
        return []
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
