# QuantingV — Setup & Deployment Guide

## API Keys You Need

| Key | Where to get it | Free? | Used for |
|---|---|---|---|
| `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com) → Get API key | Yes (1500 req/day) | AI explanations, weekly outlook, strategy critique |
| `NEWS_API_KEY` | [newsapi.org/register](https://newsapi.org/register) | Yes (100 req/day) | News sentiment per asset |
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL | Yes | Database + auth |
| `SUPABASE_ANON_KEY` | Supabase → Settings → API → `anon public` | Yes | Frontend auth |
| `SUPABASE_SERVICE_KEY` | Supabase → Settings → API → `service_role secret` | Yes | Backend DB writes |
| `DATABASE_URL` | Supabase → Settings → Database → Connection string (URI) | Yes | PostgreSQL connection |
| `VITE_API_URL` | Your Railway backend URL (set in Vercel dashboard) | — | Frontend → backend routing |

> **App works without any keys** — falls back to SQLite, mock news, keyword sentiment, and static AI responses.

---

## Supabase Setup (First Time)

1. Go to [supabase.com](https://supabase.com) → New Project
2. Choose a name, password (save it — needed for `DATABASE_URL`), and region (closest to you)
3. Wait ~2 min for project to spin up
4. Go to **SQL Editor** → **New Query**
5. Paste the entire contents of `supabase/schema.sql` and click **Run**
6. Go to **Settings → API** and copy your keys into `.env`

---

## Local Development

```bash
# 1. Clone and install Python deps
git clone https://github.com/Archemasachika7/Quantingv
cd Quantingv
pip install -r requirements.txt

# 2. Set up environment
cp .env.example .env
# Edit .env with your keys

# 3. Seed historical data (first run only — takes ~2 min)
python scripts/fetch_historical.py --prediction-only

# 4. Start backend
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# 5. Start frontend (new terminal)
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

---

## Production Deployment

### Backend → Railway

1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Select the `Quantingv` repo
3. Railway auto-detects `railway.json` and builds with Nixpacks
4. Go to **Variables** and add all backend env vars:
   ```
   GEMINI_API_KEY=...
   NEWS_API_KEY=...
   SUPABASE_URL=...
   SUPABASE_SERVICE_KEY=...
   DATABASE_URL=...
   CORS_ORIGINS=https://your-app.vercel.app
   ```
5. Railway gives you a URL like `https://quantingv-production.up.railway.app` — copy it

### Frontend → Vercel

1. Go to [vercel.com](https://vercel.com) → New Project → Import from GitHub
2. Select `Quantingv` repo
3. Set **Root Directory** to `frontend`
4. Add environment variable:
   ```
   VITE_API_URL = https://quantingv-production.up.railway.app
   ```
5. Deploy — Vercel auto-detects Vite, builds, and gives you `https://quantingv.vercel.app`

### Final step: update CORS

Back in Railway, update `CORS_ORIGINS` to include your Vercel URL:
```
CORS_ORIGINS=https://quantingv.vercel.app,http://localhost:5173
```

---

## API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Health check |
| `/api/quotes` | GET | All live quotes |
| `/api/quotes/{symbol}` | GET | Single asset quote |
| `/api/chart/{symbol}?period=6mo` | GET | Candle data for chart |
| `/api/predict/{symbol}?fresh=false` | GET | ML + AI prediction (7-day) |
| `/api/predictions` | GET | All cached predictions |
| `/api/sentiment/{symbol}` | GET | News sentiment |
| `/api/weekly-outlook` | GET | AI weekly report |
| `/api/backtest` | POST | Run strategy backtest |
| `/api/strategies` | GET | List built-in strategies |
| `/api/strategy/critique` | POST | AI strategy evaluation |
| `/ws/quotes` | WS | Live quote WebSocket (15s) |

## Backtest Request Format

```json
{
  "strategy_name": "rsi_reversal",
  "symbol": "GOLD",
  "months": 24,
  "initial_balance": 100000,
  "custom_code": null
}
```

Custom strategy (Python):
```python
def strategy(row, portfolio, history, symbol):
    rsi = row.get('rsi')
    if rsi is None:
        return
    if rsi < 30 and symbol not in portfolio.positions:
        qty = portfolio.cash * 0.95 / row['close']
        portfolio.buy(symbol, qty=qty, price=row['close'])
    elif rsi > 70 and symbol in portfolio.positions:
        portfolio.sell(symbol, qty=portfolio.positions[symbol].qty, price=row['close'])
```

## Phase Roadmap

| Phase | Status | Features |
|---|---|---|
| **1 — MVP** | ✅ Built | Live dashboard, candle charts, trade markers, paper trading, backtesting, ML forecasts, Gemini AI, Supabase |
| **2 — AI** | Planned | LSTM models, FinBERT sentiment, market replay engine |
| **3 — Advanced** | Planned | RL agents, portfolio optimizer, multi-strategy |
| **4 — Platform** | Planned | Strategy marketplace, multi-agent simulation, AI trade journal |
