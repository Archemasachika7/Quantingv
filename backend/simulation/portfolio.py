from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional
import uuid


@dataclass
class Position:
    symbol: str
    qty: float
    avg_price: float
    side: str = "LONG"


@dataclass
class Trade:
    id: str
    symbol: str
    side: str          # BUY / SELL
    qty: float
    price: float
    ts: str
    pnl: float = 0.0
    strategy_name: str = ""
    notes: str = ""


class Portfolio:
    def __init__(
        self,
        portfolio_id: str = "",
        name: str = "Paper Portfolio",
        initial_balance: float = 100_000.0,
        currency: str = "INR",
    ):
        self.id = portfolio_id or str(uuid.uuid4())[:8]
        self.name = name
        self.initial_balance = initial_balance
        self.cash = initial_balance
        self.currency = currency
        self.positions: dict[str, Position] = {}
        self.trades: list[Trade] = []
        self.created_at = datetime.utcnow().isoformat()

    # ──────────────────────────────────────────────
    # Order Execution
    # ──────────────────────────────────────────────

    def buy(self, symbol: str, qty: float, price: float, strategy_name: str = "", notes: str = "") -> Trade:
        cost = qty * price
        if cost > self.cash:
            raise ValueError(f"Insufficient cash: need {cost:.2f}, have {self.cash:.2f}")
        self.cash -= cost
        if symbol in self.positions:
            pos = self.positions[symbol]
            total_qty = pos.qty + qty
            pos.avg_price = (pos.qty * pos.avg_price + qty * price) / total_qty
            pos.qty = total_qty
        else:
            self.positions[symbol] = Position(symbol=symbol, qty=qty, avg_price=price)

        trade = Trade(
            id=str(uuid.uuid4())[:8],
            symbol=symbol,
            side="BUY",
            qty=qty,
            price=price,
            ts=datetime.utcnow().isoformat(),
            strategy_name=strategy_name,
            notes=notes,
        )
        self.trades.append(trade)
        return trade

    def sell(self, symbol: str, qty: float, price: float, strategy_name: str = "", notes: str = "") -> Trade:
        if symbol not in self.positions or self.positions[symbol].qty < qty:
            raise ValueError(f"Insufficient position in {symbol}")
        pos = self.positions[symbol]
        pnl = (price - pos.avg_price) * qty
        pos.qty -= qty
        if pos.qty <= 0:
            del self.positions[symbol]
        self.cash += qty * price

        trade = Trade(
            id=str(uuid.uuid4())[:8],
            symbol=symbol,
            side="SELL",
            qty=qty,
            price=price,
            ts=datetime.utcnow().isoformat(),
            pnl=round(pnl, 2),
            strategy_name=strategy_name,
            notes=notes,
        )
        self.trades.append(trade)
        return trade

    # ──────────────────────────────────────────────
    # Valuation
    # ──────────────────────────────────────────────

    def market_value(self, prices: dict[str, float]) -> float:
        return sum(pos.qty * prices.get(sym, pos.avg_price) for sym, pos in self.positions.items())

    def total_equity(self, prices: dict[str, float]) -> float:
        return self.cash + self.market_value(prices)

    def unrealized_pnl(self, prices: dict[str, float]) -> float:
        return sum(
            (prices.get(sym, pos.avg_price) - pos.avg_price) * pos.qty
            for sym, pos in self.positions.items()
        )

    def realized_pnl(self) -> float:
        return sum(t.pnl for t in self.trades if t.side == "SELL")

    def snapshot(self, prices: dict[str, float]) -> dict:
        equity = self.total_equity(prices)
        return {
            "portfolio_id": self.id,
            "name": self.name,
            "cash": round(self.cash, 2),
            "market_value": round(self.market_value(prices), 2),
            "total_equity": round(equity, 2),
            "initial_balance": self.initial_balance,
            "total_return_pct": round((equity / self.initial_balance - 1) * 100, 2),
            "unrealized_pnl": round(self.unrealized_pnl(prices), 2),
            "realized_pnl": round(self.realized_pnl(), 2),
            "num_trades": len(self.trades),
            "positions": {
                sym: {"qty": pos.qty, "avg_price": round(pos.avg_price, 2), "current_price": round(prices.get(sym, pos.avg_price), 2)}
                for sym, pos in self.positions.items()
            },
            "currency": self.currency,
        }
