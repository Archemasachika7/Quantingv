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
from data.fetcher import fetch_all_live_quotes, fetch_ohlcv_for_chart, fetch_historical
from data.storage import (
    init_db, save_prediction, get_latest_prediction,
    save_sentiment, get_sentiment_avg,
)
from models.ensemble import ensemble_forecast
from sentiment.news_fetcher import fetch_news
from sentiment.scorer import score_articles
from simulation.strategy_runner import run_strategy, list_strategies
from ai.gemini_advisor import explain_prediction, generate_weekly_outlook, critique_strategy


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


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "ts": datetime.utcnow().isoformat()}
