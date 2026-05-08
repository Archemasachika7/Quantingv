import numpy as np
import pandas as pd
from statsmodels.tsa.arima.model import ARIMA
import warnings

warnings.filterwarnings("ignore")


def arima_forecast(series: pd.Series, horizon: int = 7) -> dict:
    """
    Fit ARIMA on closing price series and forecast `horizon` steps ahead.
    Returns direction, confidence, and price range.
    """
    if len(series) < 60:
        return {"direction": "Neutral", "confidence": 0.5, "price_low": None, "price_high": None}

    try:
        series = series.dropna().tail(252)  # last ~1 year for speed
        model = ARIMA(series, order=(2, 1, 2))
        fit = model.fit()
        forecast = fit.get_forecast(steps=horizon)
        mean_vals = forecast.predicted_mean
        conf_int = forecast.conf_int(alpha=0.2)  # 80% CI

        last_price = float(series.iloc[-1])
        forecast_price = float(mean_vals.iloc[-1])
        price_low = float(conf_int.iloc[-1, 0])
        price_high = float(conf_int.iloc[-1, 1])

        direction = "Bullish" if forecast_price > last_price else "Bearish"
        magnitude = abs(forecast_price - last_price) / last_price

        # Confidence from CI width — tighter CI = higher confidence
        ci_width_pct = (price_high - price_low) / last_price
        confidence = max(0.3, min(0.95, 1 - ci_width_pct * 2))

        return {
            "direction": direction,
            "confidence": round(confidence, 3),
            "price_low": round(price_low, 2),
            "price_high": round(price_high, 2),
            "forecast_price": round(forecast_price, 2),
            "model": "ARIMA(2,1,2)",
        }
    except Exception as e:
        last = float(series.iloc[-1]) if len(series) > 0 else 0
        return {
            "direction": "Neutral",
            "confidence": 0.5,
            "price_low": last * 0.98,
            "price_high": last * 1.02,
            "forecast_price": last,
            "model": "ARIMA(fallback)",
            "error": str(e),
        }
