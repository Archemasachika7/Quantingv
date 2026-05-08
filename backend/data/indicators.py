import pandas as pd
import numpy as np


def compute_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Compute all technical indicators on an OHLCV DataFrame."""
    df = df.copy()
    close = df["close"]
    high = df["high"]
    low = df["low"]
    volume = df["volume"]

    # SMAs
    df["sma_20"] = close.rolling(20).mean()
    df["sma_50"] = close.rolling(50).mean()
    df["sma_200"] = close.rolling(200).mean()

    # EMAs
    df["ema_12"] = close.ewm(span=12, adjust=False).mean()
    df["ema_26"] = close.ewm(span=26, adjust=False).mean()

    # MACD
    df["macd"] = df["ema_12"] - df["ema_26"]
    df["macd_signal"] = df["macd"].ewm(span=9, adjust=False).mean()
    df["macd_hist"] = df["macd"] - df["macd_signal"]

    # RSI
    delta = close.diff()
    gain = delta.clip(lower=0).rolling(14).mean()
    loss = (-delta.clip(upper=0)).rolling(14).mean()
    rs = gain / loss.replace(0, np.nan)
    df["rsi"] = 100 - (100 / (1 + rs))

    # Bollinger Bands
    bb_mid = close.rolling(20).mean()
    bb_std = close.rolling(20).std()
    df["bb_upper"] = bb_mid + 2 * bb_std
    df["bb_lower"] = bb_mid - 2 * bb_std
    df["bb_mid"] = bb_mid
    df["bb_width"] = (df["bb_upper"] - df["bb_lower"]) / bb_mid

    # ATR
    tr1 = high - low
    tr2 = (high - close.shift()).abs()
    tr3 = (low - close.shift()).abs()
    df["atr"] = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1).rolling(14).mean()

    # Volume indicators
    df["volume_sma_20"] = volume.rolling(20).mean()
    df["volume_ratio"] = volume / df["volume_sma_20"]

    # Returns
    df["daily_return"] = close.pct_change()
    df["log_return"] = np.log(close / close.shift())
    df["volatility_20"] = df["log_return"].rolling(20).std() * np.sqrt(252)

    # Momentum
    df["momentum_10"] = close - close.shift(10)
    df["roc_10"] = (close - close.shift(10)) / close.shift(10) * 100

    # Stochastic
    low_14 = low.rolling(14).min()
    high_14 = high.rolling(14).max()
    df["stoch_k"] = 100 * (close - low_14) / (high_14 - low_14).replace(0, np.nan)
    df["stoch_d"] = df["stoch_k"].rolling(3).mean()

    # Price position
    df["close_to_sma20_pct"] = (close - df["sma_20"]) / df["sma_20"] * 100
    df["close_to_52wh"] = close / high.rolling(252).max()

    # Calendar features
    if hasattr(df.index, "dayofweek"):
        df["day_of_week"] = df.index.dayofweek
        df["month"] = df.index.month
        df["quarter"] = df.index.quarter

    return df


def get_feature_columns() -> list[str]:
    return [
        "open", "high", "low", "close", "volume",
        "sma_20", "sma_50", "ema_12", "ema_26",
        "macd", "macd_signal", "macd_hist",
        "rsi", "bb_upper", "bb_lower", "bb_width",
        "atr", "volume_ratio",
        "daily_return", "volatility_20",
        "momentum_10", "roc_10",
        "stoch_k", "stoch_d",
        "close_to_sma20_pct",
        "day_of_week", "month", "quarter",
    ]
