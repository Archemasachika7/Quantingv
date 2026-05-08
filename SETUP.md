# QuantingV Setup Guide

## Prerequisites
- Python 3.11+
- Node.js 18+

## 1. Backend Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r ../requirements.txt
```

## 2. Environment Variables

Copy and fill in `.env.example` → `.env`:
```bash
cp .env.example .env
```

Required for full functionality:
| Variable | Source | Free? |
|---|---|---|
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com) | Yes (free tier) |
| `NEWS_API_KEY` | [newsapi.org](https://newsapi.org) | Yes (free tier) |
| `GOLDAPI_KEY` | [goldapi.io](https://goldapi.io) | Optional |

> **Without API keys:** The app works with mock data and keyword-based sentiment. Add keys to unlock Gemini AI explanations and real news.

## 3. Seed Historical Data (First Run Only)

```bash
# From repo root — pulls 60 months of data for all assets
python scripts/fetch_historical.py

# Or just prediction assets (faster):
python scripts/fetch_historical.py --prediction-only

# Or specific symbols:
python scripts/fetch_historical.py --symbols GOLD NIFTY50 BTC --months 36
```

## 4. Start Backend

```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

API docs: http://localhost:8000/docs

## 5. Start Frontend

```bash
cd frontend
npm install
npm run dev
```

Open: http://localhost:5173

## 6. Quick Start (Both Together)

```bash
chmod +x start.sh
./start.sh
```

---

## API Reference

| Endpoint | Description |
|---|---|
| `GET /api/quotes` | All live quotes |
| `GET /api/chart/{symbol}?period=6mo` | Candle data for chart |
| `GET /api/predict/{symbol}` | ML + AI prediction |
| `GET /api/predictions` | All cached predictions |
| `GET /api/sentiment/{symbol}` | News sentiment |
| `GET /api/weekly-outlook` | AI weekly report |
| `POST /api/backtest` | Run strategy backtest |
| `GET /api/strategies` | List built-in strategies |
| `WS /ws/quotes` | Live quote WebSocket |

## Backtesting

POST `/api/backtest`:
```json
{
  "strategy_name": "rsi_reversal",
  "symbol": "GOLD",
  "months": 24,
  "initial_balance": 100000,
  "custom_code": null
}
```

Custom strategy format:
```python
def strategy(row, portfolio, history, symbol):
    # row: dict with all OHLCV + indicators
    # portfolio.buy(symbol, qty, price)
    # portfolio.sell(symbol, qty, price)
    rsi = row.get('rsi')
    if rsi and rsi < 30 and symbol not in portfolio.positions:
        qty = portfolio.cash * 0.95 / row['close']
        portfolio.buy(symbol, qty=qty, price=row['close'])
```

## Built-in Strategies
- `sma_crossover` — SMA 20/50 crossover
- `rsi_reversal` — RSI oversold/overbought
- `macd_momentum` — MACD signal crossover
- `bollinger_bands` — Bollinger Band reversion

## Phase Roadmap
- **Phase 1 (Current):** Live dashboard, candlestick charts with trade markers, paper trading, backtesting, ML forecasts, Gemini AI explanations
- **Phase 2:** LSTM models, market replay engine, FinBERT sentiment
- **Phase 3:** Reinforcement learning agents, portfolio optimization
- **Phase 4:** Strategy marketplace, multi-agent simulation
