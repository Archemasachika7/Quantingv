from __future__ import annotations
import asyncio
import json
import os
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any

import sys
from pathlib import Path

# Make `backend/` importable whether running from repo root or from within backend/
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

from data.assets import ALL_TICKERS, PREDICTION_ASSETS, WATCHLIST
from data.fetcher import (
    fetch_all_live_quotes, fetch_ohlcv_for_chart, fetch_historical,
    fetch_quote_any, fetch_ohlcv_any, search_yahoo,
)
from data.storage import (
    init_db, save_prediction, get_latest_prediction,
    save_sentiment, get_sentiment_avg,
)
from models.ensemble import ensemble_forecast
from sentiment.news_fetcher import fetch_news
from sentiment.scorer import score_articles
from simulation.strategy_runner import run_strategy, list_strategies
from ai.gemini_advisor import explain_prediction, generate_weekly_outlook, critique_strategy
from models.stress_test import run_stress_test
from models.portfolio_optimizer import optimize_portfolio
from ai.alert_engine import check_divergences


# ── Lifespan ────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="QuantingV API", version="1.0.0", lifespan=lifespan)

CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://localhost:3000,https://quantingv.vercel.app"
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── WebSocket connection manager ─────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        self.active = [c for c in self.active if c is not ws]

    async def broadcast(self, data: dict):
        dead = []
        for ws in self.active:
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()


# ── Market Data Endpoints ────────────────────────────────────────────────────

@app.get("/api/quotes")
async def get_quotes():
    """Live quotes for all watchlist assets."""
    quotes = fetch_all_live_quotes()
    return {"quotes": quotes, "ts": datetime.utcnow().isoformat()}


@app.get("/api/quotes/{symbol}")
async def get_quote(symbol: str):
    """Single asset live quote."""
    symbol = symbol.upper()
    if symbol not in ALL_TICKERS:
        raise HTTPException(404, f"Unknown symbol: {symbol}")
    from data.fetcher import fetch_live_quote
    return fetch_live_quote(symbol)


@app.get("/api/chart/{symbol}")
async def get_chart_data(symbol: str, period: str = "6mo", interval: str = "1d"):
    """OHLCV candle data formatted for TradingView Lightweight Charts."""
    symbol = symbol.upper()
    if symbol not in ALL_TICKERS:
        raise HTTPException(404, f"Unknown symbol: {symbol}")
    candles = fetch_ohlcv_for_chart(symbol, period=period, interval=interval)
    return {"symbol": symbol, "candles": candles, "count": len(candles)}


@app.get("/api/watchlist")
async def get_watchlist():
    return WATCHLIST


@app.get("/api/search")
async def search_symbols(q: str):
    """Search Yahoo Finance for matching tickers."""
    if not q or len(q.strip()) < 1:
        return {"results": []}
    return {"results": search_yahoo(q.strip())}


@app.get("/api/quote/any")
async def get_quote_any(ticker: str, label: str = ""):
    """Live quote for any Yahoo Finance ticker, in INR."""
    return fetch_quote_any(ticker, label)


@app.get("/api/chart/any")
async def get_chart_any(ticker: str, period: str = "6mo", interval: str = "1d"):
    """OHLCV candle data for any Yahoo Finance ticker, converted to INR."""
    candles = fetch_ohlcv_any(ticker, period=period, interval=interval)
    return {"ticker": ticker, "candles": candles, "count": len(candles)}


# ── Prediction Endpoints ─────────────────────────────────────────────────────

@app.get("/api/predict/{symbol}")
async def get_prediction(symbol: str, horizon: int = 7, fresh: bool = False):
    """Get ML prediction for a symbol. Uses cache unless fresh=true."""
    symbol = symbol.upper()
    if symbol not in ALL_TICKERS:
        raise HTTPException(404, f"Unknown symbol: {symbol}")

    if not fresh:
        cached = get_latest_prediction(symbol, horizon)
        if cached:
            return cached

    df = fetch_historical(symbol, months=24)
    if df.empty or len(df) < 60:
        raise HTTPException(400, f"Insufficient data for {symbol}")

    prediction = ensemble_forecast(df, symbol, horizon=horizon)

    # Augment with sentiment
    articles = fetch_news(symbol, max_articles=15)
    sentiment = score_articles(articles)
    save_sentiment(symbol, sentiment["avg_score"], sentiment["label"], "newsapi", "batch")

    # Gemini explanation
    explanation = explain_prediction(symbol, prediction, sentiment)
    prediction["ai_explanation"] = explanation
    prediction["sentiment"] = sentiment

    save_prediction(
        symbol=symbol,
        horizon_days=horizon,
        direction=prediction["direction"],
        confidence=prediction["confidence"],
        price_low=prediction["price_low"],
        price_high=prediction["price_high"],
        model_name=prediction["model_name"],
        ai_explanation=explanation,
    )
    return prediction


@app.get("/api/predictions")
async def get_all_predictions(horizon: int = 7):
    """Fetch cached predictions for all prediction assets."""
    results = []
    for sym in PREDICTION_ASSETS:
        p = get_latest_prediction(sym, horizon)
        if p:
            results.append(p)
    return {"predictions": results}


# ── Weekly Outlook ────────────────────────────────────────────────────────────

@app.get("/api/weekly-outlook")
async def get_weekly_outlook():
    """AI-generated weekly market outlook."""
    predictions = []
    sentiment_map = {}
    for sym in PREDICTION_ASSETS:
        p = get_latest_prediction(sym, horizon_days=7)
        if p:
            predictions.append(p)
        s = get_sentiment_avg(sym, hours=48)
        sentiment_map[sym] = s
    outlook = generate_weekly_outlook(predictions, sentiment_map)
    return {"outlook": outlook, "generated_at": datetime.utcnow().isoformat()}


# ── Sentiment ─────────────────────────────────────────────────────────────────

@app.get("/api/sentiment/{symbol}")
async def get_sentiment(symbol: str):
    symbol = symbol.upper()
    articles = fetch_news(symbol, max_articles=20)
    result = score_articles(articles)
    for s in result.get("scores", []):
        save_sentiment(symbol, s["score"], s["label"], s.get("source", ""), s.get("headline", ""))
    db_agg = get_sentiment_avg(symbol, hours=24)
    return {
        "symbol": symbol,
        "live": result,
        "rolling_24h": db_agg,
        "articles": articles[:5],
    }


# ── Strategy House ────────────────────────────────────────────────────────────

class BacktestRequest(BaseModel):
    strategy_name: str = "sma_crossover"
    symbol: str = "NIFTY50"
    months: int = 24
    initial_balance: float = 100_000
    custom_code: str | None = None


@app.post("/api/backtest")
async def run_backtest_endpoint(req: BacktestRequest):
    """Run a backtest and return full results including candle markers."""
    result = run_strategy(
        strategy_name=req.strategy_name,
        symbol=req.symbol.upper(),
        months=req.months,
        initial_balance=req.initial_balance,
        custom_code=req.custom_code,
    )
    if "error" in result and not result.get("metrics"):
        raise HTTPException(400, result["error"])
    return result


@app.get("/api/strategies")
async def get_strategies():
    return {"strategies": list_strategies()}


@app.post("/api/strategy/critique")
async def critique_strategy_endpoint(req: dict):
    name = req.get("strategy_name", "")
    metrics = req.get("metrics", {})
    critique = critique_strategy(name, metrics)
    return {"critique": critique}


# ── WebSocket: Live Feed ─────────────────────────────────────────────────────

@app.websocket("/ws/quotes")
async def websocket_quotes(ws: WebSocket):
    """Push live quotes every 15 seconds to all connected clients."""
    await manager.connect(ws)
    try:
        while True:
            quotes = fetch_all_live_quotes()
            await ws.send_json({"type": "quotes", "data": quotes, "ts": datetime.utcnow().isoformat()})
            await asyncio.sleep(15)
    except WebSocketDisconnect:
        manager.disconnect(ws)


# ── Stress Test ───────────────────────────────────────────────────────────────

@app.get("/api/stress/{symbol}")
async def stress_test(symbol: str, simulations: int = 500, horizon: int = 30):
    """Monte Carlo + scenario stress test for a single asset."""
    symbol = symbol.upper()
    if symbol not in ALL_TICKERS:
        raise HTTPException(404, f"Unknown symbol: {symbol}")
    df = fetch_historical(symbol, months=24)
    if df.empty or len(df) < 20:
        raise HTTPException(400, f"Insufficient data for {symbol}")
    result = run_stress_test(df, symbol, simulations=simulations, horizon=horizon)
    if "error" in result and "symbol" not in result:
        raise HTTPException(500, result["error"])
    return result


# ── Portfolio Optimizer ───────────────────────────────────────────────────────

class PortfolioRequest(BaseModel):
    symbols: list[str] = ["NIFTY50", "GOLD", "BTC", "RELIANCE", "TCS"]
    months: int = 12


@app.post("/api/portfolio/optimize")
async def optimize_portfolio_endpoint(req: PortfolioRequest):
    """Markowitz mean-variance portfolio optimization."""
    symbols = [s.upper() for s in req.symbols]
    result = optimize_portfolio(symbols, months=req.months)
    if "error" in result and "symbols" not in result:
        raise HTTPException(400, result["error"])
    return result


# ── Alerts ────────────────────────────────────────────────────────────────────

@app.get("/api/alerts")
async def get_alerts():
    """Detect ML-forecast vs. sentiment divergences across prediction assets."""
    alerts = check_divergences(PREDICTION_ASSETS)
    return {"alerts": alerts, "count": len(alerts), "ts": datetime.utcnow().isoformat()}


# ── Paper Trading ─────────────────────────────────────────────────────────────

class PaperOrderRequest(BaseModel):
    symbol: str
    qty: float


@app.get("/api/paper/portfolio")
async def get_paper_portfolio_endpoint():
    """Get current paper trading portfolio with live prices."""
    from data.storage import get_paper_portfolio
    from data.fetcher import fetch_live_quote
    port = get_paper_portfolio()
    enriched = {}
    total_market_value = 0.0
    for sym, pos in port["positions"].items():
        quote = fetch_live_quote(sym)
        live_price = quote.get("price", pos["avg_price"])
        market_value = pos["qty"] * live_price
        unrealised_pnl = pos["qty"] * (live_price - pos["avg_price"])
        unrealised_pnl_pct = ((live_price / pos["avg_price"]) - 1) * 100 if pos["avg_price"] > 0 else 0
        total_market_value += market_value
        enriched[sym] = {
            **pos,
            "live_price": round(live_price, 2),
            "market_value": round(market_value, 2),
            "unrealised_pnl": round(unrealised_pnl, 2),
            "unrealised_pnl_pct": round(unrealised_pnl_pct, 2),
        }
    total_value = port["cash"] + total_market_value
    total_pnl = total_value - port["initial_balance"]
    total_pnl_pct = (total_pnl / port["initial_balance"]) * 100
    return {
        **port,
        "positions": enriched,
        "total_market_value": round(total_market_value, 2),
        "total_value": round(total_value, 2),
        "total_pnl": round(total_pnl, 2),
        "total_pnl_pct": round(total_pnl_pct, 2),
    }


@app.post("/api/paper/buy")
async def paper_buy_endpoint(req: PaperOrderRequest):
    from data.storage import paper_buy
    from data.fetcher import fetch_live_quote
    symbol = req.symbol.upper()
    if symbol not in ALL_TICKERS:
        raise HTTPException(404, f"Unknown symbol: {symbol}")
    quote = fetch_live_quote(symbol)
    price = quote.get("price", 0)
    if price <= 0:
        raise HTTPException(400, "Could not fetch live price")
    result = paper_buy(symbol, req.qty, price)
    if "error" in result:
        raise HTTPException(400, result["error"])
    return {**result, "executed_price": price, "symbol": symbol}


@app.post("/api/paper/sell")
async def paper_sell_endpoint(req: PaperOrderRequest):
    from data.storage import paper_sell
    from data.fetcher import fetch_live_quote
    symbol = req.symbol.upper()
    if symbol not in ALL_TICKERS:
        raise HTTPException(404, f"Unknown symbol: {symbol}")
    quote = fetch_live_quote(symbol)
    price = quote.get("price", 0)
    if price <= 0:
        raise HTTPException(400, "Could not fetch live price")
    result = paper_sell(symbol, req.qty, price)
    if "error" in result:
        raise HTTPException(400, result["error"])
    return {**result, "executed_price": price, "symbol": symbol}


@app.get("/api/paper/trades")
async def get_paper_trades_endpoint():
    from data.storage import get_paper_trades
    return {"trades": get_paper_trades()}


@app.post("/api/paper/reset")
async def reset_paper_portfolio_endpoint():
    from data.storage import reset_paper_portfolio
    return reset_paper_portfolio()


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "ts": datetime.utcnow().isoformat()}


@app.get("/api/debug/{symbol}")
async def debug_symbol(symbol: str):
    """Quick test — hits Yahoo Finance v8 chart API directly."""
    from data.fetcher import _yahoo_chart, _HEADERS
    import requests as req
    symbol = symbol.upper()
    meta = ALL_TICKERS.get(symbol)
    if not meta:
        return {"error": f"Unknown symbol {symbol}"}
    ticker = meta["ticker"]
    # Also expose raw HTTP status for diagnosis
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
    try:
        r = req.get(url, params={"range": "5d", "interval": "1d"}, headers=_HEADERS, timeout=15)
        http_status = r.status_code
        raw_keys = list(r.json().get("chart", {}).keys()) if r.ok else r.text[:200]
    except Exception as e:
        return {"ticker": ticker, "error": str(e)}
    try:
        df = _yahoo_chart(ticker, period="5d", interval="1d")
        return {
            "ticker": ticker,
            "http_status": http_status,
            "raw_keys": raw_keys,
            "rows": len(df),
            "last_close": float(df["close"].dropna().iloc[-1]) if not df.empty else None,
        }
    except Exception as e:
        return {"ticker": ticker, "http_status": http_status, "error": str(e)}
