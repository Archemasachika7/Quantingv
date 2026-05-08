import sqlite3
import pandas as pd
from pathlib import Path
from datetime import datetime

DB_PATH = Path(__file__).parent.parent.parent / "quantingv.db"


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_conn() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS ohlcv (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol      TEXT    NOT NULL,
            ts          TEXT    NOT NULL,
            open        REAL,
            high        REAL,
            low         REAL,
            close       REAL,
            volume      REAL,
            UNIQUE(symbol, ts)
        );
        CREATE INDEX IF NOT EXISTS idx_ohlcv_symbol_ts ON ohlcv(symbol, ts);

        CREATE TABLE IF NOT EXISTS predictions (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol          TEXT    NOT NULL,
            created_at      TEXT    NOT NULL,
            horizon_days    INTEGER NOT NULL,
            direction       TEXT,
            confidence      REAL,
            price_low       REAL,
            price_high      REAL,
            model_name      TEXT,
            ai_explanation  TEXT,
            UNIQUE(symbol, created_at, horizon_days)
        );

        CREATE TABLE IF NOT EXISTS sentiment (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol      TEXT,
            ts          TEXT    NOT NULL,
            score       REAL,
            label       TEXT,
            source      TEXT,
            headline    TEXT
        );

        CREATE TABLE IF NOT EXISTS portfolio_trades (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            portfolio_id    TEXT    NOT NULL,
            symbol          TEXT    NOT NULL,
            side            TEXT    NOT NULL,
            qty             REAL    NOT NULL,
            price           REAL    NOT NULL,
            ts              TEXT    NOT NULL,
            strategy_name   TEXT,
            notes           TEXT
        );

        CREATE TABLE IF NOT EXISTS portfolios (
            id              TEXT    PRIMARY KEY,
            name            TEXT    NOT NULL,
            initial_balance REAL    NOT NULL DEFAULT 100000,
            currency        TEXT    NOT NULL DEFAULT 'INR',
            created_at      TEXT    NOT NULL
        );
        """)


def upsert_ohlcv(symbol: str, df: pd.DataFrame):
    """Insert or replace OHLCV rows for a symbol."""
    df = df.reset_index()
    date_col = "Date" if "Date" in df.columns else "Datetime"
    records = [
        (
            symbol,
            str(row[date_col])[:10],
            float(row.get("Open", 0) or 0),
            float(row.get("High", 0) or 0),
            float(row.get("Low", 0) or 0),
            float(row.get("Close", 0) or 0),
            float(row.get("Volume", 0) or 0),
        )
        for _, row in df.iterrows()
    ]
    with get_conn() as conn:
        conn.executemany(
            "INSERT OR REPLACE INTO ohlcv (symbol, ts, open, high, low, close, volume) VALUES (?,?,?,?,?,?,?)",
            records,
        )


def load_ohlcv(symbol: str, start: str | None = None, end: str | None = None) -> pd.DataFrame:
    query = "SELECT ts, open, high, low, close, volume FROM ohlcv WHERE symbol = ?"
    params: list = [symbol]
    if start:
        query += " AND ts >= ?"
        params.append(start)
    if end:
        query += " AND ts <= ?"
        params.append(end)
    query += " ORDER BY ts ASC"
    with get_conn() as conn:
        df = pd.read_sql_query(query, conn, params=params, parse_dates=["ts"], index_col="ts")
    return df


def save_prediction(symbol: str, horizon_days: int, direction: str, confidence: float,
                    price_low: float, price_high: float, model_name: str, ai_explanation: str = ""):
    now = datetime.utcnow().isoformat()
    with get_conn() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO predictions
               (symbol, created_at, horizon_days, direction, confidence, price_low, price_high, model_name, ai_explanation)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (symbol, now, horizon_days, direction, confidence, price_low, price_high, model_name, ai_explanation),
        )


def get_latest_prediction(symbol: str, horizon_days: int = 7) -> dict | None:
    with get_conn() as conn:
        row = conn.execute(
            """SELECT * FROM predictions WHERE symbol=? AND horizon_days=?
               ORDER BY created_at DESC LIMIT 1""",
            (symbol, horizon_days),
        ).fetchone()
    return dict(row) if row else None


def save_sentiment(symbol: str | None, score: float, label: str, source: str, headline: str):
    now = datetime.utcnow().isoformat()
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO sentiment (symbol, ts, score, label, source, headline) VALUES (?,?,?,?,?,?)",
            (symbol, now, score, label, source, headline),
        )


def get_sentiment_avg(symbol: str, hours: int = 24) -> dict:
    with get_conn() as conn:
        row = conn.execute(
            """SELECT AVG(score) as avg_score, COUNT(*) as count
               FROM sentiment
               WHERE (symbol=? OR symbol IS NULL)
               AND ts >= datetime('now', ?)""",
            (symbol, f"-{hours} hours"),
        ).fetchone()
    avg = row["avg_score"] if row and row["avg_score"] is not None else 0.0
    label = "Bullish" if avg > 0.15 else ("Bearish" if avg < -0.15 else "Neutral")
    return {"avg_score": round(avg, 4), "count": row["count"] if row else 0, "label": label}
