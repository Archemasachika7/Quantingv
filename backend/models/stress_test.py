"""
Stress testing: Monte Carlo simulation + predefined shock scenarios.
"""
import numpy as np
import pandas as pd

SCENARIOS = {
    "market_crash": {"label": "Market Crash (-20%)", "shock": -0.20},
    "moderate_drop": {"label": "Moderate Drop (-10%)", "shock": -0.10},
    "rate_spike": {"label": "Rate Spike (-8%)", "shock": -0.08},
    "flash_crash": {"label": "Flash Crash (-15%)", "shock": -0.15},
    "bull_run": {"label": "Bull Run (+15%)", "shock": 0.15},
}


def run_stress_test(
    df: pd.DataFrame,
    symbol: str,
    simulations: int = 500,
    horizon: int = 30,
) -> dict:
    """
    Run Monte Carlo simulation + scenario analysis on historical OHLCV data.
    Returns VaR, CVaR, scenario outcomes, and simulation paths (sampled).
    """
    try:
        closes = df["close"].dropna()
        if len(closes) < 20:
            return {"error": "Insufficient price history for stress test"}

        current_price = float(closes.iloc[-1])

        # Daily log returns
        returns = np.log(closes / closes.shift(1)).dropna().values
        mu = float(np.mean(returns))
        sigma = float(np.std(returns))

        # ── Monte Carlo via Geometric Brownian Motion ────────────────────────
        rng = np.random.default_rng(seed=42)
        # shape: (simulations, horizon)
        random_shocks = rng.standard_normal((simulations, horizon))
        daily_factors = np.exp((mu - 0.5 * sigma ** 2) + sigma * random_shocks)

        # Cumulative product along horizon axis → final price multipliers
        price_paths = current_price * np.cumprod(daily_factors, axis=1)  # (simulations, horizon)

        final_prices = price_paths[:, -1]
        final_returns = (final_prices - current_price) / current_price

        # ── Risk Metrics ─────────────────────────────────────────────────────
        sorted_returns = np.sort(final_returns)

        var_95_idx = int(np.floor(0.05 * simulations))
        var_99_idx = int(np.floor(0.01 * simulations))

        var_95 = float(sorted_returns[var_95_idx])
        var_99 = float(sorted_returns[var_99_idx])

        # CVaR (Expected Shortfall) at 95%: mean of worst 5%
        cvar_95 = float(np.mean(sorted_returns[: var_95_idx + 1]))

        worst_case = float(sorted_returns[0])
        best_case = float(sorted_returns[-1])

        # ── Scenario Analysis ─────────────────────────────────────────────────
        scenario_results = {}
        for key, cfg in SCENARIOS.items():
            shock = cfg["shock"]
            end_price = current_price * (1 + shock)
            pnl_pct = shock * 100

            # Probability of loss given this scenario is the starting floor
            # P(final_return < shock) using GBM distribution
            # We use the simulated distribution shifted by the scenario shock
            scenario_shocked_returns = final_returns + shock
            prob_loss = float(np.mean(scenario_shocked_returns < 0))

            scenario_results[key] = {
                "label": cfg["label"],
                "shock": shock,
                "end_price": round(end_price, 4),
                "pnl_pct": round(pnl_pct, 2),
                "probability_of_loss": round(prob_loss, 4),
            }

        # ── Sample Paths for Frontend (max 50) ───────────────────────────────
        n_sample = min(50, simulations)
        sample_indices = rng.choice(simulations, size=n_sample, replace=False)
        sampled_paths = []
        for idx in sample_indices:
            path = [current_price] + [round(float(p), 4) for p in price_paths[idx]]
            sampled_paths.append(path)

        return {
            "symbol": symbol,
            "current_price": round(current_price, 4),
            "horizon_days": horizon,
            "simulations": simulations,
            "mu_daily": round(mu, 6),
            "sigma_daily": round(sigma, 6),
            "var_95": round(var_95, 4),
            "var_99": round(var_99, 4),
            "cvar_95": round(cvar_95, 4),
            "worst_case": round(worst_case, 4),
            "best_case": round(best_case, 4),
            "scenarios": scenario_results,
            "paths": sampled_paths,
        }

    except Exception as exc:
        return {"symbol": symbol, "error": str(exc)}
