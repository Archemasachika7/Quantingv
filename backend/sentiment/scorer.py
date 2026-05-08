"""
Sentiment scoring using a lightweight keyword-based approach as default,
with optional FinBERT when transformers are available.
FinBERT is loaded lazily to avoid boot-time delay.
"""
import re

_finbert = None
_finbert_attempted = False


def _load_finbert():
    global _finbert, _finbert_attempted
    if _finbert_attempted:
        return _finbert
    _finbert_attempted = True
    try:
        from transformers import pipeline
        _finbert = pipeline(
            "text-classification",
            model="ProsusAI/finbert",
            truncation=True,
            max_length=512,
        )
    except Exception:
        _finbert = None
    return _finbert


BULLISH_WORDS = {
    "surge", "rally", "gain", "rise", "bull", "bullish", "strong", "growth",
    "record", "high", "positive", "upside", "beat", "exceed", "outperform",
    "buy", "upgrade", "optimistic", "recover", "rebound", "soar", "jump",
    "boost", "breakout", "momentum",
}
BEARISH_WORDS = {
    "fall", "drop", "decline", "crash", "bear", "bearish", "weak", "loss",
    "low", "negative", "miss", "underperform", "sell", "downgrade", "pessimistic",
    "slump", "plunge", "tumble", "correction", "downside", "risk", "concern",
    "recession", "inflation", "fear", "uncertainty",
}


def keyword_score(text: str) -> float:
    words = set(re.findall(r"\b\w+\b", text.lower()))
    bull = len(words & BULLISH_WORDS)
    bear = len(words & BEARISH_WORDS)
    total = bull + bear
    if total == 0:
        return 0.0
    return round((bull - bear) / total, 4)


def score_headline(text: str) -> dict:
    """Score a single headline. Returns score (-1 to +1) and label."""
    pipe = _load_finbert()
    if pipe:
        try:
            result = pipe(text[:512])[0]
            label_map = {"positive": 1.0, "negative": -1.0, "neutral": 0.0}
            score = label_map.get(result["label"].lower(), 0.0) * result["score"]
            label = "Bullish" if score > 0.1 else ("Bearish" if score < -0.1 else "Neutral")
            return {"score": round(score, 4), "label": label, "method": "finbert"}
        except Exception:
            pass

    score = keyword_score(text)
    label = "Bullish" if score > 0.1 else ("Bearish" if score < -0.1 else "Neutral")
    return {"score": score, "label": label, "method": "keyword"}


def score_articles(articles: list[dict]) -> dict:
    """Score a list of articles and return aggregate sentiment."""
    if not articles:
        return {"avg_score": 0.0, "label": "Neutral", "count": 0, "scores": []}

    scores = []
    for article in articles:
        text = f"{article.get('title', '')} {article.get('description', '')}".strip()
        if text:
            result = score_headline(text)
            scores.append({
                "headline": article.get("title", ""),
                "score": result["score"],
                "label": result["label"],
                "source": article.get("source", ""),
            })

    avg = sum(s["score"] for s in scores) / len(scores) if scores else 0.0
    label = "Bullish" if avg > 0.15 else ("Bearish" if avg < -0.15 else "Neutral")
    return {
        "avg_score": round(avg, 4),
        "label": label,
        "count": len(scores),
        "scores": scores[:10],
    }
