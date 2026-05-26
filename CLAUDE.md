# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

QuantingV is an AI quant research terminal targeting Indian markets (NIFTY, NSE stocks) plus global commodities and crypto. All prices are displayed in INR — USD-denominated assets are converted at runtime using a cached USDINR=X rate.

## Development Commands

### Backend (FastAPI + Python)
```bash
# From repo root — install dependencies
pip install -r requirements.txt

# Copy and fill in env vars
cp .env.example .env

# Seed historical OHLCV data (first run only, ~2 min)
python scripts/fetch_historical.py --prediction-only

# Run backend with hot reload
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Interactive API docs
open http://localhost:8000/docs
```

### Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev        # → http://localhost:5173
npm run build      # production build
```

### Run both together
```bash
bash start.sh
```

### Apply Supabase schema (one-time)
```bash
python scripts/apply_schema.py
# Or paste supabase/schema.sql into the Supabase SQL Editor
```

## Architecture

### Backend modules (`backend/`)

| Module | Purpose |
|---|---|
| `main.py` | FastAPI app with all routes, WebSocket manager, lifespan init |
| `data/assets.py` | `WATCHLIST`, `ALL_TICKERS`, `PREDICTION_ASSETS` — **single source of truth for supported symbols** |
| `data/fetcher.py` | Calls Yahoo Finance v8 chart API directly via `requests` (avoids yfinance crumb issues). Falls back to `query2` mirror |
| `data/indicators.py` | `compute_indicators()` — adds all TA columns to an OHLCV DataFrame |
| `data/storage.py` | Dual-backend storage: Supabase (PostgreSQL) when `SUPABASE_URL`+`SUPABASE_SERVICE_KEY` are set, otherwise SQLite at `quantingv.db`. Paper trading state lives **in-memory only** (resets on restart) |
| `models/ensemble.py` | Combines ARIMA (35%) + RandomForest (65%) into a weighted prediction dict |
| `models/arima_model.py` | ARIMA/SARIMA time-series forecast |
| `models/rf_model.py` | Random Forest with features from `indicators.py` |
| `models/stress_test.py` | Monte Carlo + scenario stress testing |
| `models/portfolio_optimizer.py` | Markowitz mean-variance optimization |
| `ai/gemini_advisor.py` | Gemini 1.5 Flash wrapper. All three functions (`explain_prediction`, `generate_weekly_outlook`, `critique_strategy`) have static fallbacks so the app works without a key |
| `ai/alert_engine.py` | Detects ML-forecast vs. sentiment divergences |
| `sentiment/news_fetcher.py` | Fetches from NewsAPI; falls back to mock articles |
| `sentiment/scorer.py` | Keyword-based sentiment scoring (no model required) |
| `simulation/strategy_runner.py` | Runs built-in and custom strategies in a **sandboxed `exec()`** with a restricted `__builtins__` allowlist |
| `simulation/backtester.py` | Event-driven backtest engine |

### Frontend components (`frontend/src/`)

The app is a single-page React app with tab navigation. `App.jsx` owns `selectedSymbol`, `chartMarkers`, and `tab` state — tabs are `Dashboard`, `Strategy House`, `Weekly Outlook`, `Risk Lab`, `Portfolio`, `Alerts`, `Paper Trading`.

All API calls go through `src/hooks/useApi.js`, which exports:
- `useApi(path)` — GET with loading/error state
- `apiPost(path, body)` — POST helper
- `useWebSocket(path, onMessage)` — auto-reconnecting WebSocket
- `API_BASE` — empty string in dev (Vite proxies `/api` and `/ws` to `:8000`); set to Railway URL in production via `VITE_API_URL`

### Key data flows

**Prediction pipeline:**  
`fetch_historical()` → `compute_indicators()` → `ensemble_forecast()` → `fetch_news()` + `score_articles()` → `explain_prediction()` (Gemini) → `save_prediction()`

**Backtest pipeline:**  
`fetch_historical()` → `compute_indicators()` → sandboxed `strategy()` fn → `run_backtest()` → `critique_strategy()` (Gemini)

**Live quotes:**  
`/ws/quotes` WebSocket pushes all watchlist quotes every 15 seconds via `fetch_all_live_quotes()`.

## Symbol / Asset System

Symbols use short keys (`GOLD`, `NIFTY50`, `BTC`, `RELIANCE`, etc.) mapped in `data/assets.py` to their Yahoo Finance tickers and currency. To **add a new asset**, add it to `WATCHLIST` in `assets.py` — `ALL_TICKERS` is derived from it automatically.

Custom/arbitrary Yahoo Finance tickers are also supported via `/api/quote/any?ticker=AAPL` and `/api/chart/any?ticker=AAPL` endpoints without adding them to `WATCHLIST`.

USD assets (`currency: "USD"`) have their prices automatically converted to INR at prediction time using a 5-minute cached USDINR=X rate.

## Storage Dual-Backend Pattern

`data/storage.py` checks `USE_SUPABASE = bool(SUPABASE_URL and SUPABASE_SERVICE_KEY)` at import time. Every read/write function has two branches — Supabase client and SQLite. When adding new storage operations, maintain both branches. The SQLite schema is created in `init_db()` (called on FastAPI startup); the Supabase schema is in `supabase/schema.sql`.

Paper trading (`paper_buy`, `paper_sell`, etc.) is in-memory only and is **not** persisted to either database.

## Custom Strategy Sandboxing

Custom Python strategies are executed via `exec()` in a namespace with a restricted `__builtins__` containing only safe builtins (see `ALLOWED_BUILTINS` in `strategy_runner.py`). The `strategy(row, portfolio, history, symbol)` function signature is fixed. `row` is a dict of indicator values; `portfolio` exposes `.buy()`, `.sell()`, `.cash`, and `.positions`.

## Environment Variables

| Variable | Required for | Default behavior |
|---|---|---|
| `GEMINI_API_KEY` | AI explanations | Static fallback text |
| `NEWS_API_KEY` | Live news sentiment | Mock articles |
| `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` | Cloud persistence | SQLite at `quantingv.db` |
| `DATABASE_URL` | Direct Postgres (scripts) | Not used by FastAPI |
| `CORS_ORIGINS` | Cross-origin requests | `localhost:5173,3000` + Vercel |
| `VITE_API_URL` | Frontend → backend in prod | Vite proxy (dev only) |

## Deployment

- **Backend** → Railway (`railway.json` + `nixpacks.toml` auto-configure the build)
- **Frontend** → Vercel (root directory set to `frontend/`; `vercel.json` handles SPA routing)
- **Database** → Supabase (run `supabase/schema.sql` once in SQL Editor)
- After deploying both, update `CORS_ORIGINS` on Railway to include the Vercel URL
