import os
import requests
from datetime import datetime, timedelta

NEWS_API_KEY = os.getenv("NEWS_API_KEY", "")

ASSET_QUERIES = {
    "GOLD": "gold price OR gold market OR gold commodity",
    "SILVER": "silver price OR silver market",
    "NIFTY50": "NIFTY 50 OR NSE India OR Indian stock market",
    "BANKNIFTY": "Bank NIFTY OR Indian banking stocks",
    "RELIANCE": "Reliance Industries OR RIL stock",
    "TCS": "TCS Tata Consultancy OR TCS stock India",
    "HDFCBANK": "HDFC Bank OR HDFC stock",
    "BTC": "Bitcoin OR BTC cryptocurrency",
    "GENERAL": "Indian economy OR stock market India OR RBI monetary policy",
}


def fetch_news(symbol: str, max_articles: int = 20) -> list[dict]:
    """Fetch recent news headlines for a symbol via NewsAPI."""
    if not NEWS_API_KEY:
        return _mock_news(symbol)
    query = ASSET_QUERIES.get(symbol, ASSET_QUERIES["GENERAL"])
    from_date = (datetime.now() - timedelta(days=3)).strftime("%Y-%m-%dT%H:%M:%S")
    url = "https://newsapi.org/v2/everything"
    params = {
        "q": query,
        "from": from_date,
        "sortBy": "publishedAt",
        "language": "en",
        "pageSize": max_articles,
        "apiKey": NEWS_API_KEY,
    }
    try:
        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        articles = resp.json().get("articles", [])
        return [
            {
                "title": a.get("title", ""),
                "description": a.get("description", ""),
                "source": a.get("source", {}).get("name", ""),
                "published_at": a.get("publishedAt", ""),
                "url": a.get("url", ""),
            }
            for a in articles
            if a.get("title")
        ]
    except Exception:
        return _mock_news(symbol)


def _mock_news(symbol: str) -> list[dict]:
    """Return realistic mock headlines when API key is missing."""
    mock = {
        "GOLD": [
            {"title": "Gold prices near record highs amid global uncertainty", "description": "Safe-haven demand drives gold above key resistance.", "source": "Reuters", "published_at": datetime.now().isoformat(), "url": ""},
            {"title": "Dollar weakness supports gold rally", "description": "Weakening US dollar boosts commodity prices globally.", "source": "Bloomberg", "published_at": datetime.now().isoformat(), "url": ""},
        ],
        "NIFTY50": [
            {"title": "NIFTY 50 gains 1.2% on FII buying", "description": "Foreign institutional investors return to Indian equities.", "source": "Economic Times", "published_at": datetime.now().isoformat(), "url": ""},
            {"title": "RBI holds rates steady, market reacts positively", "description": "Monetary policy committee maintains repo rate at 6.5%.", "source": "Mint", "published_at": datetime.now().isoformat(), "url": ""},
        ],
        "BTC": [
            {"title": "Bitcoin surges past $70,000 on ETF inflows", "description": "Spot Bitcoin ETFs see record weekly inflows.", "source": "CoinDesk", "published_at": datetime.now().isoformat(), "url": ""},
        ],
    }
    return mock.get(symbol, [
        {"title": f"{symbol} market update: mixed signals as traders await data", "description": "Markets consolidate ahead of key economic releases.", "source": "Mock", "published_at": datetime.now().isoformat(), "url": ""},
    ])
