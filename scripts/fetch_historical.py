#!/usr/bin/env python3
"""
One-shot script to seed the database with 60 months of OHLCV data
for all tracked assets.

Usage:
    python scripts/fetch_historical.py
    python scripts/fetch_historical.py --symbols GOLD SILVER NIFTY50
    python scripts/fetch_historical.py --months 36
"""
import argparse
import sys
import time
from pathlib import Path

# Allow running from repo root
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from data.assets import ALL_TICKERS, PREDICTION_ASSETS
from data.fetcher import fetch_and_store_historical
from data.storage import init_db


def main():
    parser = argparse.ArgumentParser(description="Fetch and store historical OHLCV data")
    parser.add_argument("--symbols", nargs="+", default=None, help="Symbols to fetch (default: all)")
    parser.add_argument("--months", type=int, default=60, help="Months of history (default: 60)")
    parser.add_argument("--prediction-only", action="store_true", help="Only fetch prediction assets")
    args = parser.parse_args()

    init_db()

    if args.symbols:
        symbols = [s.upper() for s in args.symbols]
    elif args.prediction_only:
        symbols = PREDICTION_ASSETS
    else:
        symbols = list(ALL_TICKERS.keys())

    print(f"\nFetching {args.months} months of data for {len(symbols)} symbols...")
    print("=" * 60)

    success, failed = [], []
    for sym in symbols:
        meta = ALL_TICKERS.get(sym)
        if not meta:
            print(f"  SKIP  {sym} — not found in asset list")
            continue
        print(f"  FETCH {sym:12} ({meta['ticker']})...", end=" ", flush=True)
        try:
            df = fetch_and_store_historical(sym, months=args.months)
            if df.empty:
                print("NO DATA")
                failed.append(sym)
            else:
                print(f"OK  ({len(df)} rows)")
                success.append(sym)
        except Exception as e:
            print(f"ERROR: {e}")
            failed.append(sym)
        time.sleep(0.5)  # rate limit

    print("=" * 60)
    print(f"Done. Success: {len(success)}, Failed: {len(failed)}")
    if failed:
        print(f"Failed symbols: {', '.join(failed)}")


if __name__ == "__main__":
    main()
