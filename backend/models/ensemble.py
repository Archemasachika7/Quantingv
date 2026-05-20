import pandas as pd
from models.arima_model import arima_forecast
from models.rf_model import rf_forecast


WEIGHTS = {
    "ARIMA": 0.35,
    "RandomForest": 0.65,
}


def ensemble_forecast(df: pd.DataFrame, symbol: str, horizon: int = 7) -> dict:
    """
    Combine ARIMA + RandomForest predictions into a weighted ensemble.
    Returns unified prediction dict.
    """
    results = {}

    arima_result = arima_forecast(df["close"], horizon)
    results["ARIMA"] = arima_result

    rf_result = rf_forecast(df, horizon)
    results["RandomForest"] = rf_result

    # Weighted vote on direction
    bullish_score = 0.0
    total_weight = 0.0
    weighted_price_low = 0.0
    weighted_price_high = 0.0
    weighted_forecast = 0.0

    for model_name, res in results.items():
        w = WEIGHTS.get(model_name, 0.5)
        direction_score = res["confidence"] if res["direction"] == "Bullish" else (1 - res["confidence"])
        bullish_score += direction_score * w
        total_weight += w
        if res.get("price_low") and res.get("price_high"):
            weighted_price_low += res["price_low"] * w
            weighted_price_high += res["price_high"] * w
        if res.get("forecast_price"):
            weighted_forecast += res["forecast_price"] * w

    bullish_prob = bullish_score / total_weight if total_weight > 0 else 0.5
    direction = "Bullish" if bullish_prob > 0.5 else "Bearish"
    if 0.45 <= bullish_prob <= 0.55:
        direction = "Neutral"

    confidence = abs(bullish_prob - 0.5) * 2 + 0.5
    confidence = round(min(0.95, max(0.5, confidence)), 3)

    last_price = float(df["close"].iloc[-1]) if len(df) > 0 else 0

    return {
        "symbol": symbol,
        "horizon_days": horizon,
        "direction": direction,
        "confidence": confidence,
        "bullish_probability": round(bullish_prob, 3),
        "price_low": round(weighted_price_low / total_weight, 2) if total_weight > 0 else last_price * 0.97,
        "price_high": round(weighted_price_high / total_weight, 2) if total_weight > 0 else last_price * 1.03,
        "forecast_price": round(weighted_forecast / total_weight, 2) if total_weight > 0 else last_price,
        "current_price": round(last_price, 2),
        "model_breakdown": {k: {"direction": v["direction"], "confidence": v["confidence"]} for k, v in results.items()},
        "model_name": "ARIMA+RF_Ensemble",
    }
