"""
Alert engine: detects divergences between ML forecasts and sentiment.
Generates actionable alerts when model and sentiment disagree.
"""
from data.storage import get_latest_prediction, get_sentiment_avg

# Alert type constants
BULLISH_MODEL_BEARISH_SENTIMENT = "BULLISH_MODEL_BEARISH_SENTIMENT"
BEARISH_MODEL_BULLISH_SENTIMENT = "BEARISH_MODEL_BULLISH_SENTIMENT"
HIGH_CONFIDENCE_SIGNAL = "HIGH_CONFIDENCE_SIGNAL"
NEUTRAL_BREAKOUT = "NEUTRAL_BREAKOUT"

# Thresholds
HIGH_CONFIDENCE_THRESHOLD = 0.75
MODERATE_CONFIDENCE_THRESHOLD = 0.55
STRONG_SENTIMENT_THRESHOLD = 0.25  # |avg_score| above this = strong sentiment


def _classify_sentiment(avg_score: float) -> str:
    """Classify a numeric sentiment score into a label."""
    if avg_score > STRONG_SENTIMENT_THRESHOLD:
        return "Bullish"
    if avg_score < -STRONG_SENTIMENT_THRESHOLD:
        return "Bearish"
    return "Neutral"


def _check_symbol(symbol: str) -> list[dict]:
    """Run divergence checks for a single symbol; return list of alert dicts."""
    alerts: list[dict] = []

    try:
        prediction = get_latest_prediction(symbol, horizon_days=7)
        sentiment_data = get_sentiment_avg(symbol, hours=48)
    except Exception:
        return alerts

    if not prediction:
        return alerts

    model_direction = prediction.get("direction", "Neutral")
    confidence = float(prediction.get("confidence", 0.5) or 0.5)
    avg_score = float(sentiment_data.get("avg_score", 0.0) or 0.0)
    sentiment_label = sentiment_data.get("label", "Neutral")

    # ── Alert 1: Bullish model + Bearish sentiment ────────────────────────────
    if (
        model_direction == "Bullish"
        and avg_score < -STRONG_SENTIMENT_THRESHOLD
        and confidence >= MODERATE_CONFIDENCE_THRESHOLD
    ):
        severity = "HIGH" if confidence >= HIGH_CONFIDENCE_THRESHOLD else "MEDIUM"
        alerts.append({
            "symbol": symbol,
            "type": BULLISH_MODEL_BEARISH_SENTIMENT,
            "severity": severity,
            "message": (
                f"{symbol}: Model signals BULLISH ({int(confidence * 100)}% confidence) "
                f"but news sentiment is BEARISH (score: {avg_score:.2f}). "
                "Potential divergence — monitor closely before entering long positions."
            ),
            "model_direction": model_direction,
            "sentiment_label": sentiment_label,
            "confidence": round(confidence, 4),
        })

    # ── Alert 2: Bearish model + Bullish sentiment ────────────────────────────
    elif (
        model_direction == "Bearish"
        and avg_score > STRONG_SENTIMENT_THRESHOLD
        and confidence >= MODERATE_CONFIDENCE_THRESHOLD
    ):
        severity = "HIGH" if confidence >= HIGH_CONFIDENCE_THRESHOLD else "MEDIUM"
        alerts.append({
            "symbol": symbol,
            "type": BEARISH_MODEL_BULLISH_SENTIMENT,
            "severity": severity,
            "message": (
                f"{symbol}: Model signals BEARISH ({int(confidence * 100)}% confidence) "
                f"but news sentiment is BULLISH (score: {avg_score:.2f}). "
                "Sentiment may be lagging — consider tightening stop-losses."
            ),
            "model_direction": model_direction,
            "sentiment_label": sentiment_label,
            "confidence": round(confidence, 4),
        })

    # ── Alert 3: High-confidence signal (model + sentiment agree strongly) ────
    if (
        confidence >= HIGH_CONFIDENCE_THRESHOLD
        and model_direction != "Neutral"
    ):
        # Agreement check: model and sentiment point the same way
        sentiment_aligned = (
            (model_direction == "Bullish" and avg_score > 0)
            or (model_direction == "Bearish" and avg_score < 0)
        )
        if sentiment_aligned and not any(a["type"] in (BULLISH_MODEL_BEARISH_SENTIMENT, BEARISH_MODEL_BULLISH_SENTIMENT) for a in alerts):
            alerts.append({
                "symbol": symbol,
                "type": HIGH_CONFIDENCE_SIGNAL,
                "severity": "HIGH",
                "message": (
                    f"{symbol}: High-confidence {model_direction.upper()} signal "
                    f"({int(confidence * 100)}%) with aligned {sentiment_label.lower()} sentiment. "
                    "Strong directional conviction — suitable for position sizing."
                ),
                "model_direction": model_direction,
                "sentiment_label": sentiment_label,
                "confidence": round(confidence, 4),
            })

    # ── Alert 4: Neutral model but extreme sentiment (potential breakout) ─────
    if (
        model_direction == "Neutral"
        and abs(avg_score) > STRONG_SENTIMENT_THRESHOLD
    ):
        sentiment_bias = "bullish" if avg_score > 0 else "bearish"
        alerts.append({
            "symbol": symbol,
            "type": NEUTRAL_BREAKOUT,
            "severity": "LOW",
            "message": (
                f"{symbol}: Model is NEUTRAL but sentiment is strongly {sentiment_bias} "
                f"(score: {avg_score:.2f}). Possible breakout candidate — watch for "
                "confirmation before acting."
            ),
            "model_direction": model_direction,
            "sentiment_label": sentiment_label,
            "confidence": round(confidence, 4),
        })

    return alerts


def check_divergences(symbols: list[str]) -> list[dict]:
    """
    Check each symbol for ML-forecast vs. sentiment divergences.
    Returns a list of alert dicts sorted by severity (HIGH first).
    """
    all_alerts: list[dict] = []

    for sym in symbols:
        try:
            symbol_alerts = _check_symbol(sym)
            all_alerts.extend(symbol_alerts)
        except Exception:
            continue

    # Sort: HIGH > MEDIUM > LOW
    severity_order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
    all_alerts.sort(key=lambda a: severity_order.get(a.get("severity", "LOW"), 2))

    return all_alerts
