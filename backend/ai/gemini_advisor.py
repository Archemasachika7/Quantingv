import os
import json
from datetime import datetime

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

_gemini_client = None
_attempted = False


def _get_client():
    global _gemini_client, _attempted
    if _attempted:
        return _gemini_client
    _attempted = True
    if not GEMINI_API_KEY:
        return None
    try:
        import google.generativeai as genai
        genai.configure(api_key=GEMINI_API_KEY)
        _gemini_client = genai.GenerativeModel("gemini-1.5-flash")
    except Exception:
        _gemini_client = None
    return _gemini_client


def _call_gemini(prompt: str, fallback: str) -> str:
    client = _get_client()
    if not client:
        return fallback
    try:
        response = client.generate_content(prompt)
        return response.text.strip()
    except Exception:
        return fallback


def explain_prediction(symbol: str, prediction: dict, sentiment: dict) -> str:
    """Generate a natural language explanation for a numerical prediction."""
    direction = prediction.get("direction", "Neutral")
    confidence = int(prediction.get("confidence", 0.5) * 100)
    price_low = prediction.get("price_low", 0)
    price_high = prediction.get("price_high", 0)
    sentiment_label = sentiment.get("label", "Neutral")
    sentiment_score = sentiment.get("avg_score", 0)

    prompt = f"""You are a professional financial analyst. Explain this market prediction concisely in 2-3 sentences.

Asset: {symbol}
Forecast Direction: {direction}
Confidence: {confidence}%
7-Day Expected Price Range: {price_low:.2f} – {price_high:.2f}
News Sentiment: {sentiment_label} (score: {sentiment_score:.2f})

Write a professional, factual explanation. Do not use markdown. Be specific about the likely drivers."""

    fallback = (
        f"{symbol} shows a {direction.lower()} outlook with {confidence}% confidence based on technical momentum "
        f"and {sentiment_label.lower()} market sentiment. The model projects a price range of "
        f"{price_low:.0f}–{price_high:.0f} over the next 7 days."
    )
    return _call_gemini(prompt, fallback)


def generate_weekly_outlook(predictions: list[dict], sentiment_map: dict) -> str:
    """Generate a weekly market outlook report for all tracked assets."""
    lines = []
    for p in predictions:
        sym = p.get("symbol", "")
        sent = sentiment_map.get(sym, {})
        lines.append(
            f"- {sym}: {p.get('direction', 'Neutral')} ({int(p.get('confidence', 0.5)*100)}% conf) | "
            f"Sentiment: {sent.get('label', 'Neutral')}"
        )
    summary_block = "\n".join(lines)

    prompt = f"""You are a senior quant analyst writing a weekly market outlook report.

Current predictions:
{summary_block}

Write a structured weekly outlook in 3-4 bullet points covering:
1. Overall market bias
2. Key drivers to watch
3. Risk factors
4. Top opportunity

Keep it professional and concise. No markdown headers."""

    fallback = f"""Weekly Market Outlook — {datetime.now().strftime('%B %d, %Y')}

• Markets show mixed signals with commodities outperforming equities this week.
• Key drivers: global risk appetite, central bank commentary, and commodity demand.
• Risk factors: geopolitical tensions and currency volatility remain elevated.
• Watch: Gold and NIFTY 50 for directional breakout signals."""
    return _call_gemini(prompt, fallback)


def critique_strategy(strategy_name: str, metrics: dict) -> str:
    """Have Gemini evaluate a backtested strategy's performance."""
    prompt = f"""You are a quantitative trading analyst. Evaluate this strategy's backtested performance:

Strategy: {strategy_name}
Win Rate: {metrics.get('win_rate', 0)*100:.1f}%
Sharpe Ratio: {metrics.get('sharpe_ratio', 0):.2f}
Max Drawdown: {metrics.get('max_drawdown', 0)*100:.1f}%
Total Return: {metrics.get('total_return', 0)*100:.1f}%
Number of Trades: {metrics.get('num_trades', 0)}

Write a 2-3 sentence evaluation covering strengths, weaknesses, and one specific improvement suggestion."""

    fallback = (
        f"The {strategy_name} strategy shows a win rate of {metrics.get('win_rate',0)*100:.0f}% with a "
        f"Sharpe ratio of {metrics.get('sharpe_ratio',0):.2f}. "
        "Consider refining entry conditions to reduce drawdown during high-volatility periods."
    )
    return _call_gemini(prompt, fallback)
