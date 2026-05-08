import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import TimeSeriesSplit
import warnings

warnings.filterwarnings("ignore")

FEATURE_COLS = [
    "rsi", "macd", "macd_hist", "bb_width", "atr",
    "volume_ratio", "volatility_20", "momentum_10", "roc_10",
    "stoch_k", "stoch_d", "close_to_sma20_pct",
    "daily_return", "sma_20", "sma_50",
    "day_of_week", "month",
]


def _prepare_features(df: pd.DataFrame, horizon: int = 7) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Build X (features) and y (direction + future return)."""
    df = df.copy().dropna(subset=FEATURE_COLS)
    available = [c for c in FEATURE_COLS if c in df.columns]

    # Target: will close be higher in `horizon` days?
    df["future_return"] = df["close"].shift(-horizon) / df["close"] - 1
    df["target_direction"] = (df["future_return"] > 0).astype(int)
    df = df.dropna(subset=["future_return"])

    X = df[available].values
    y_dir = df["target_direction"].values
    y_ret = df["future_return"].values
    return X, y_dir, y_ret, df["close"].values


def rf_forecast(df: pd.DataFrame, horizon: int = 7) -> dict:
    """Train RandomForest on full history (walk-forward) and predict next `horizon` days."""
    if len(df) < 120:
        last = float(df["close"].iloc[-1]) if len(df) > 0 else 0
        return {"direction": "Neutral", "confidence": 0.5, "price_low": last * 0.98, "price_high": last * 1.02}

    try:
        X, y_dir, y_ret, closes = _prepare_features(df, horizon)
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)

        # Use last 20% as implicit "future" for confidence calibration
        split = int(len(X_scaled) * 0.8)
        X_train, y_train = X_scaled[:split], y_dir[:split]

        clf = RandomForestClassifier(n_estimators=200, max_depth=8, random_state=42, n_jobs=-1)
        clf.fit(X_train, y_train)

        reg = RandomForestRegressor(n_estimators=200, max_depth=8, random_state=42, n_jobs=-1)
        reg.fit(X_train, y_ret[:split])

        # Predict on latest data point
        X_latest = X_scaled[-1:].reshape(1, -1)
        direction_proba = clf.predict_proba(X_latest)[0]
        predicted_return = float(reg.predict(X_latest)[0])

        direction_idx = int(clf.predict(X_latest)[0])
        direction = "Bullish" if direction_idx == 1 else "Bearish"
        confidence = float(max(direction_proba))

        last_price = float(closes[-1])
        forecast_price = last_price * (1 + predicted_return)

        # Range: ±1 ATR
        atr = float(df["atr"].iloc[-1]) if "atr" in df.columns else last_price * 0.02
        price_low = min(last_price, forecast_price) - atr * 0.5
        price_high = max(last_price, forecast_price) + atr * 0.5

        return {
            "direction": direction,
            "confidence": round(confidence, 3),
            "price_low": round(price_low, 2),
            "price_high": round(price_high, 2),
            "forecast_price": round(forecast_price, 2),
            "model": "RandomForest",
        }
    except Exception as e:
        last = float(df["close"].iloc[-1]) if len(df) > 0 else 0
        return {
            "direction": "Neutral",
            "confidence": 0.5,
            "price_low": last * 0.98,
            "price_high": last * 1.02,
            "forecast_price": last,
            "model": "RandomForest(fallback)",
            "error": str(e),
        }
