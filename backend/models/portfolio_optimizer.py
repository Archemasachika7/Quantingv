"""
Markowitz mean-variance portfolio optimization.
Uses scipy.optimize to find minimum variance and maximum Sharpe portfolios.
"""
import numpy as np
import pandas as pd
from scipy.optimize import minimize

from data.fetcher import fetch_historical


def optimize_portfolio(symbols: list[str], months: int = 12) -> dict:
    """
    Fetch historical returns for each symbol, then compute:
      - Minimum Variance portfolio
      - Maximum Sharpe portfolio
      - 30-point Efficient Frontier
      - Correlation matrix
      - Individual asset stats
    """
    try:
        # ── Fetch returns ─────────────────────────────────────────────────────
        price_series: dict[str, pd.Series] = {}
        failed: list[str] = []

        for sym in symbols:
            try:
                df = fetch_historical(sym, months=months)
                if df.empty or "close" not in df.columns or len(df) < 20:
                    failed.append(sym)
                    continue
                price_series[sym] = df["close"].dropna()
            except Exception:
                failed.append(sym)

        valid_symbols = [s for s in symbols if s in price_series]
        if len(valid_symbols) < 2:
            return {
                "error": "Need at least 2 valid symbols with sufficient data",
                "failed_symbols": failed,
            }

        # Align on common dates
        prices_df = pd.DataFrame(price_series).dropna()
        if len(prices_df) < 20:
            return {"error": "Insufficient overlapping price history after alignment"}

        returns_df = np.log(prices_df / prices_df.shift(1)).dropna()
        n = len(valid_symbols)

        # Annualised stats (252 trading days)
        mean_returns = returns_df.mean().values * 252  # shape (n,)
        cov_matrix = returns_df.cov().values * 252      # shape (n, n)
        corr_matrix = returns_df.corr()

        RISK_FREE_RATE = 0.065  # 6.5% annual (approximate Indian risk-free rate)

        # ── Helper functions ──────────────────────────────────────────────────
        def portfolio_return(w: np.ndarray) -> float:
            return float(np.dot(w, mean_returns))

        def portfolio_volatility(w: np.ndarray) -> float:
            return float(np.sqrt(w @ cov_matrix @ w))

        def neg_sharpe(w: np.ndarray) -> float:
            ret = portfolio_return(w)
            vol = portfolio_volatility(w)
            if vol < 1e-10:
                return 0.0
            return -(ret - RISK_FREE_RATE) / vol

        constraints = [{"type": "eq", "fun": lambda w: np.sum(w) - 1.0}]
        bounds = [(0.0, 1.0)] * n
        w0 = np.ones(n) / n  # equal-weight starting point

        # ── Minimum Variance ──────────────────────────────────────────────────
        res_minvar = minimize(
            portfolio_volatility,
            w0,
            method="SLSQP",
            bounds=bounds,
            constraints=constraints,
            options={"ftol": 1e-12, "maxiter": 1000},
        )
        min_var_weights_arr = res_minvar.x if res_minvar.success else w0
        min_var_weights_arr = np.clip(min_var_weights_arr, 0, 1)
        min_var_weights_arr /= min_var_weights_arr.sum()

        # ── Maximum Sharpe ────────────────────────────────────────────────────
        res_sharpe = minimize(
            neg_sharpe,
            w0,
            method="SLSQP",
            bounds=bounds,
            constraints=constraints,
            options={"ftol": 1e-12, "maxiter": 1000},
        )
        max_sharpe_weights_arr = res_sharpe.x if res_sharpe.success else w0
        max_sharpe_weights_arr = np.clip(max_sharpe_weights_arr, 0, 1)
        max_sharpe_weights_arr /= max_sharpe_weights_arr.sum()

        # ── Efficient Frontier: 30 points ─────────────────────────────────────
        r_min = float(np.min(mean_returns))
        r_max = float(np.max(mean_returns))
        target_returns = np.linspace(r_min, r_max, 30)

        frontier: list[dict] = []
        for target_r in target_returns:
            ef_constraints = [
                {"type": "eq", "fun": lambda w: np.sum(w) - 1.0},
                {"type": "eq", "fun": lambda w, t=target_r: portfolio_return(w) - t},
            ]
            res_ef = minimize(
                portfolio_volatility,
                w0,
                method="SLSQP",
                bounds=bounds,
                constraints=ef_constraints,
                options={"ftol": 1e-10, "maxiter": 500},
            )
            if res_ef.success:
                w_ef = np.clip(res_ef.x, 0, 1)
                w_ef /= w_ef.sum()
                vol_ef = portfolio_volatility(w_ef)
                frontier.append({
                    "risk": round(float(vol_ef), 6),
                    "return": round(float(target_r), 6),
                    "weights": {valid_symbols[i]: round(float(w_ef[i]), 4) for i in range(n)},
                })

        # ── Individual stats ──────────────────────────────────────────────────
        individual_stats: dict[str, dict] = {}
        for i, sym in enumerate(valid_symbols):
            sym_returns = returns_df[sym]
            ann_ret = float(mean_returns[i])
            ann_vol = float(np.sqrt(cov_matrix[i, i]))
            sharpe = (ann_ret - RISK_FREE_RATE) / ann_vol if ann_vol > 0 else 0.0
            individual_stats[sym] = {
                "annual_return": round(ann_ret, 6),
                "annual_volatility": round(ann_vol, 6),
                "sharpe_ratio": round(sharpe, 4),
                "total_return": round(float((prices_df[sym].iloc[-1] / prices_df[sym].iloc[0]) - 1), 4),
            }

        # ── Build portfolio summaries ─────────────────────────────────────────
        def portfolio_summary(w: np.ndarray) -> dict:
            ret = portfolio_return(w)
            vol = portfolio_volatility(w)
            sharpe = (ret - RISK_FREE_RATE) / vol if vol > 0 else 0.0
            return {
                "annual_return": round(ret, 6),
                "annual_volatility": round(vol, 6),
                "sharpe_ratio": round(sharpe, 4),
            }

        min_var_summary = portfolio_summary(min_var_weights_arr)
        max_sharpe_summary = portfolio_summary(max_sharpe_weights_arr)

        return {
            "symbols": valid_symbols,
            "failed_symbols": failed,
            "months": months,
            "data_points": len(returns_df),
            "min_variance": {
                "weights": {valid_symbols[i]: round(float(min_var_weights_arr[i]), 4) for i in range(n)},
                **min_var_summary,
            },
            "max_sharpe": {
                "weights": {valid_symbols[i]: round(float(max_sharpe_weights_arr[i]), 4) for i in range(n)},
                **max_sharpe_summary,
            },
            "efficient_frontier": frontier,
            "correlation_matrix": corr_matrix.round(4).to_dict(),
            "individual_stats": individual_stats,
        }

    except Exception as exc:
        return {"error": str(exc)}
