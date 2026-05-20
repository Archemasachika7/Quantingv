"""
Backtesting engine.
Users write Python strategies as a function:

    def strategy(row, portfolio, history):
        # row: current candle dict (open, high, low, close, volume, rsi, macd, ...)
        # portfolio: Portfolio instance
        # history: list of past rows
        if row['rsi'] < 30:
            portfolio.buy('ASSET', qty=1, price=row['close'])
        elif row['rsi'] > 70:
            portfolio.sell('ASSET', qty=1, price=row['close'])
"""
import math
import pandas as pd
import numpy as np
from simulation.portfolio import Portfolio


def run_backtest(
    df: pd.DataFrame,
    strategy_fn,
    symbol: str,
    initial_balance: float = 100_000,
    commission_pct: float = 0.001,  # 0.1% per trade
) -> dict:
    """
    Run strategy_fn over df row-by-row.
    Returns performance metrics + equity curve + trade list + candle markers.
    """
    portfolio = Portfolio(initial_balance=initial_balance)
    equity_curve: list[dict] = []
    markers: list[dict] = []
    history: list[dict] = []
    errors: list[str] = []

    rows = df.to_dict("records")

    for i, row in enumerate(rows):
        current_price = float(row.get("close", 0))
        ts = str(df.index[i])[:10] if hasattr(df.index[i], "strftime") else str(df.index[i])

        # Let strategy decide
        try:
            strategy_fn(row, portfolio, history[:], symbol)
        except Exception as e:
            if len(errors) < 5:
                errors.append(f"Row {i} ({ts}): {e}")

        history.append(row)
        prices = {symbol: current_price}
        equity = portfolio.total_equity(prices)
        equity_curve.append({"time": ts, "equity": round(equity, 2), "price": round(current_price, 2)})

    # Build candle markers from trades
    for trade in portfolio.trades:
        ts_short = trade.ts[:10]
        markers.append({
            "time": ts_short,
            "position": "belowBar" if trade.side == "BUY" else "aboveBar",
            "color": "#26a69a" if trade.side == "BUY" else "#ef5350",
            "shape": "arrowUp" if trade.side == "BUY" else "arrowDown",
            "text": f"{trade.side} {trade.qty} @ {trade.price:.0f}",
            "side": trade.side,
            "price": trade.price,
            "pnl": trade.pnl,
        })

    # Compute metrics
    metrics = _compute_metrics(equity_curve, portfolio, initial_balance)
    metrics["errors"] = errors

    return {
        "metrics": metrics,
        "equity_curve": equity_curve,
        "markers": markers,
        "trades": [
            {
                "id": t.id,
                "symbol": t.symbol,
                "side": t.side,
                "qty": t.qty,
                "price": t.price,
                "ts": t.ts,
                "pnl": t.pnl,
            }
            for t in portfolio.trades
        ],
        "final_portfolio": portfolio.snapshot({symbol: float(df["close"].iloc[-1])}),
    }


def _compute_metrics(equity_curve: list[dict], portfolio: Portfolio, initial_balance: float) -> dict:
    if not equity_curve:
        return {}

    equities = [e["equity"] for e in equity_curve]
    returns = [
        (equities[i] - equities[i - 1]) / equities[i - 1]
        for i in range(1, len(equities))
        if equities[i - 1] != 0
    ]

    total_return = (equities[-1] / initial_balance - 1) if initial_balance > 0 else 0

    # Annualized
    n_days = len(equity_curve)
    cagr = (equities[-1] / initial_balance) ** (252 / max(n_days, 1)) - 1 if equities[-1] > 0 else -1

    # Sharpe
    rf_daily = 0.065 / 252  # 6.5% risk-free
    excess = [r - rf_daily for r in returns]
    sharpe = (np.mean(excess) / np.std(excess) * math.sqrt(252)) if np.std(excess) > 0 else 0

    # Sortino
    downside = [r for r in excess if r < 0]
    sortino = (np.mean(excess) / np.std(downside) * math.sqrt(252)) if downside and np.std(downside) > 0 else 0

    # Max Drawdown
    peak = initial_balance
    max_dd = 0.0
    for eq in equities:
        peak = max(peak, eq)
        dd = (peak - eq) / peak if peak > 0 else 0
        max_dd = max(max_dd, dd)

    # Win rate
    sell_trades = [t for t in portfolio.trades if t.side == "SELL"]
    wins = [t for t in sell_trades if t.pnl > 0]
    win_rate = len(wins) / len(sell_trades) if sell_trades else 0

    # Profit factor
    gross_profit = sum(t.pnl for t in wins)
    gross_loss = abs(sum(t.pnl for t in sell_trades if t.pnl < 0))
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else float("inf")

    return {
        "total_return": round(total_return, 4),
        "total_return_pct": round(total_return * 100, 2),
        "cagr": round(cagr, 4),
        "cagr_pct": round(cagr * 100, 2),
        "sharpe_ratio": round(sharpe, 3),
        "sortino_ratio": round(sortino, 3),
        "max_drawdown": round(max_dd, 4),
        "max_drawdown_pct": round(max_dd * 100, 2),
        "win_rate": round(win_rate, 4),
        "win_rate_pct": round(win_rate * 100, 1),
        "num_trades": len(portfolio.trades),
        "num_wins": len(wins),
        "gross_profit": round(gross_profit, 2),
        "gross_loss": round(gross_loss, 2),
        "profit_factor": round(profit_factor, 3) if profit_factor != float("inf") else 999,
        "final_equity": round(equities[-1], 2),
        "initial_balance": initial_balance,
    }
