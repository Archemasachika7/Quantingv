"""
Market data fetcher — calls Yahoo Finance v8 chart API directly via requests.
This avoids yfinance's crumb/cookie mechanism which fails on cloud hosts.
"""
import time
import requests
import pandas as pd
from datetime import datetime, timedelta
from .assets import ALL_TICKERS
from .storage import upsert_ohlcv
from .indicators import compute_indicators

# USD/INR exchange rate — cached for 5 minutes
_USD_INR_CACHE: dict = {"rate": None, "ts": 0.0}
_USD_INR_TTL = 300


def get_usd_inr_rate() -> float:
    now = time.time()
    if _USD_INR_CACHE["rate"] and (now - _USD_INR_CACHE["ts"]) < _USD_INR_TTL:
        return float(_USD_INR_CACHE["rate"])
    try:
        df = _yahoo_chart("USDINR=X", period="5d", interval="1d")
        if not df.empty:
            rate = float(df["close"].iloc[-1])
            _USD_INR_CACHE.update({"rate": rate, "ts": now})
            return rate
    except Exception:
        pass
    return float(_USD_INR_CACHE["rate"] or 84.0)


def _is_usd_ticker(ticker: str) -> bool:
    """Heuristic: USD-denominated Yahoo Finance tickers."""
    return ticker.endswith("-USD") or ticker.endswith("=F") or ticker.endswith("=X")

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
            "change_pct": 0, "currency": "INR", "category": meta["category"]}
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
        # Convert USD-denominated assets to INR
        if meta["currency"] == "USD":
            rate = get_usd_inr_rate()
            price = price * rate
            change = change * rate
        return {
            "symbol": symbol,
            "label": meta["label"],
            "price": round(price, 2),
            "change": round(change, 2),
            "change_pct": round(change_pct, 2),
            "currency": "INR",
            "category": meta["category"],
        }
    except Exception:
        return base


def fetch_quote_any(ticker: str, label: str = "") -> dict:
    """Fetch a live quote for any Yahoo Finance ticker, converted to INR."""
    display = label or ticker
    base = {"symbol": ticker, "label": display, "price": 0, "change": 0,
            "change_pct": 0, "currency": "INR", "category": "custom"}
    try:
        df = _yahoo_chart(ticker, period="5d", interval="1d")
        if df.empty:
            return base
        closes = df["close"].dropna()
        if len(closes) < 1:
            return base
        price = float(closes.iloc[-1])
        prev = float(closes.iloc[-2]) if len(closes) > 1 else price
        change = price - prev
        change_pct = (change / prev * 100) if prev else 0
        if _is_usd_ticker(ticker):
            rate = get_usd_inr_rate()
            price *= rate
            change *= rate
        return {
            "symbol": ticker,
            "label": display,
            "price": round(price, 2),
            "change": round(change, 2),
            "change_pct": round(change_pct, 2),
            "currency": "INR",
            "category": "custom",
        }
    except Exception:
        return base


_ALLOWED_EXCHANGES = {
    # Indian
    "NSI", "NSE", "BSE", "BOM",
    # US
    "NasdaqGS", "NasdaqGM", "NasdaqCM", "Nasdaq", "NASDAQ",
    "NYSE", "NYQ", "NYSEArca", "NYSEARCA",
    # Crypto (cross-listed, always INR-converted)
    "CCC", "CCY",
}


def search_yahoo(q: str) -> list[dict]:
    """Search Yahoo Finance — filtered to Indian (NSE/BSE) and US (NASDAQ/NYSE) markets."""
    url = "https://query1.finance.yahoo.com/v1/finance/search"
    params = {"q": q, "lang": "en-US", "region": "IN", "quotesCount": 20, "newsCount": 0}
    try:
        resp = _session().get(url, params=params, timeout=10)
        resp.raise_for_status()
        results = resp.json().get("quotes", [])
        out = []
        for r in results:
            sym = r.get("symbol", "")
            if not sym:
                continue
            exch = r.get("exchange", "")
            exch_disp = r.get("exchDisp", "")
            type_disp = r.get("typeDisp", "")
            # Accept NSE/BSE by suffix or exchange code, US exchanges, crypto
            is_india = sym.endswith(".NS") or sym.endswith(".BO") or exch in {"NSI", "BSE", "BOM"}
            is_us = exch_disp in _ALLOWED_EXCHANGES or exch in {"NMS", "NGM", "NCM", "NYQ", "ASE"}
            is_crypto = type_disp == "Cryptocurrency"
            if not (is_india or is_us or is_crypto):
                continue
            out.append({
                "ticker": sym,
                "label": r.get("shortname") or r.get("longname") or sym,
                "exchange": exch_disp or exch,
                "type": type_disp,
            })
        return out[:10]
    except Exception:
        return []


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


def fetch_historical_any(ticker: str, months: int = 60) -> pd.DataFrame:
    """Fetch and indicator-compute historical OHLCV for any Yahoo Finance ticker."""
    start = (datetime.now() - timedelta(days=months * 31)).strftime("%Y-%m-%d")
    df = _yahoo_chart_range(ticker, start=start)
    if df.empty:
        return df
    df = compute_indicators(df)
    return df


def fetch_and_store_historical(symbol: str, months: int = 60):
    df = fetch_historical(symbol, months)
    if not df.empty:
        upsert_ohlcv(symbol, df[["open", "high", "low", "close", "volume"]])
    return df


def _df_to_candles(df: pd.DataFrame, usd_to_inr: bool = False) -> list[dict]:
    rate = get_usd_inr_rate() if usd_to_inr else 1.0
    records = []
    for ts, row in df.iterrows():
        try:
            t = int(ts.timestamp())
        except Exception:
            t = int(pd.Timestamp(ts).timestamp())
        records.append({
            "time": t,
            "open": round(float(row["open"]) * rate, 2),
            "high": round(float(row["high"]) * rate, 2),
            "low": round(float(row["low"]) * rate, 2),
            "close": round(float(row["close"]) * rate, 2),
            "volume": int(row.get("volume", 0) or 0),
        })
    return records


def _fetch_df(ticker: str, period: str, interval: str) -> pd.DataFrame:
    if interval == "3h":
        df = _yahoo_chart(ticker, period=period, interval="1h")
        if not df.empty:
            df = df.resample("3h").agg(
                {"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}
            ).dropna(subset=["close"])
        return df
    return _yahoo_chart(ticker, period=period, interval=interval)


def fetch_ohlcv_for_chart(symbol: str, period: str = "6mo", interval: str = "1d") -> list[dict]:
    meta = ALL_TICKERS.get(symbol)
    if not meta:
        return []
    df = _fetch_df(meta["ticker"], period=period, interval=interval)
    if df.empty:
        return []
    return _df_to_candles(df, usd_to_inr=(meta["currency"] == "USD"))


def fetch_ohlcv_any(ticker: str, period: str = "6mo", interval: str = "1d") -> list[dict]:
    """Fetch OHLCV for any Yahoo Finance ticker, converted to INR if USD-denominated."""
    df = _fetch_df(ticker, period=period, interval=interval)
    if df.empty:
        return []
    return _df_to_candles(df, usd_to_inr=_is_usd_ticker(ticker))
