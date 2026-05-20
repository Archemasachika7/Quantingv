"""
Safely execute user-provided strategy code in a sandboxed namespace.
Users write a `strategy(row, portfolio, history, symbol)` function.
"""
import builtins
import textwrap
import traceback
from simulation.backtester import run_backtest
from data.fetcher import fetch_historical

BUILT_IN_STRATEGIES = {
    "sma_crossover": textwrap.dedent("""
        def strategy(row, portfolio, history, symbol):
            sma20 = row.get('sma_20')
            sma50 = row.get('sma_50')
            if sma20 is None or sma50 is None:
                return
            has_position = symbol in [p for p in portfolio.positions]
            if sma20 > sma50 and not has_position:
                qty = portfolio.cash * 0.95 / row['close']
                portfolio.buy(symbol, qty=qty, price=row['close'], strategy_name='SMA Crossover')
            elif sma20 < sma50 and has_position:
                qty = portfolio.positions[symbol].qty
                portfolio.sell(symbol, qty=qty, price=row['close'], strategy_name='SMA Crossover')
    """),

    "rsi_reversal": textwrap.dedent("""
        def strategy(row, portfolio, history, symbol):
            rsi = row.get('rsi')
            if rsi is None:
                return
            has_position = symbol in portfolio.positions
            if rsi < 30 and not has_position:
                qty = portfolio.cash * 0.95 / row['close']
                portfolio.buy(symbol, qty=qty, price=row['close'], strategy_name='RSI Reversal')
            elif rsi > 70 and has_position:
                qty = portfolio.positions[symbol].qty
                portfolio.sell(symbol, qty=qty, price=row['close'], strategy_name='RSI Reversal')
    """),

    "macd_momentum": textwrap.dedent("""
        def strategy(row, portfolio, history, symbol):
            macd = row.get('macd')
            signal = row.get('macd_signal')
            if macd is None or signal is None:
                return
            has_position = symbol in portfolio.positions
            if macd > signal and not has_position:
                qty = portfolio.cash * 0.95 / row['close']
                portfolio.buy(symbol, qty=qty, price=row['close'], strategy_name='MACD Momentum')
            elif macd < signal and has_position:
                qty = portfolio.positions[symbol].qty
                portfolio.sell(symbol, qty=qty, price=row['close'], strategy_name='MACD Momentum')
    """),

    "bollinger_bands": textwrap.dedent("""
        def strategy(row, portfolio, history, symbol):
            close = row.get('close')
            bb_lower = row.get('bb_lower')
            bb_upper = row.get('bb_upper')
            if not all([close, bb_lower, bb_upper]):
                return
            has_position = symbol in portfolio.positions
            if close < bb_lower and not has_position:
                qty = portfolio.cash * 0.95 / close
                portfolio.buy(symbol, qty=qty, price=close, strategy_name='Bollinger Bands')
            elif close > bb_upper and has_position:
                qty = portfolio.positions[symbol].qty
                portfolio.sell(symbol, qty=qty, price=close, strategy_name='Bollinger Bands')
    """),
}

ALLOWED_BUILTINS = {
    "abs", "round", "min", "max", "len", "range", "sum", "print",
    "int", "float", "bool", "str", "list", "dict", "tuple", "set",
    "all", "any", "zip", "enumerate", "sorted", "reversed", "map",
    "filter", "isinstance", "hasattr", "getattr", "type", "None",
    "True", "False",
}


def run_strategy(
    strategy_name: str,
    symbol: str,
    months: int = 12,
    initial_balance: float = 100_000,
    custom_code: str | None = None,
) -> dict:
    """Execute a named or custom strategy and return backtest results."""
    try:
        df = fetch_historical(symbol, months=months)
        if df.empty or len(df) < 50:
            return {"error": f"Not enough data for {symbol}"}

        code = custom_code if custom_code else BUILT_IN_STRATEGIES.get(strategy_name, "")
        if not code:
            return {"error": f"Unknown strategy: {strategy_name}"}

        # Compile in restricted namespace
        namespace: dict = {"__builtins__": {b: getattr(builtins, b) for b in ALLOWED_BUILTINS if hasattr(builtins, b)}}
        try:
            exec(compile(code, "<strategy>", "exec"), namespace)
        except SyntaxError as e:
            return {"error": f"Syntax error in strategy: {e}"}

        strategy_fn = namespace.get("strategy")
        if not callable(strategy_fn):
            return {"error": "Strategy must define a function named 'strategy'"}

        result = run_backtest(df, strategy_fn, symbol, initial_balance=initial_balance)
        result["strategy_name"] = strategy_name
        result["symbol"] = symbol
        return result

    except Exception:
        return {"error": traceback.format_exc()}


def list_strategies() -> list[dict]:
    return [
        {"name": "sma_crossover", "label": "SMA Crossover (20/50)", "description": "Buy when SMA-20 crosses above SMA-50, sell on reversal."},
        {"name": "rsi_reversal", "label": "RSI Reversal", "description": "Buy on oversold (RSI < 30), sell on overbought (RSI > 70)."},
        {"name": "macd_momentum", "label": "MACD Momentum", "description": "Buy on MACD bullish crossover, sell on bearish crossover."},
        {"name": "bollinger_bands", "label": "Bollinger Band Reversion", "description": "Buy at lower band, sell at upper band."},
    ]
