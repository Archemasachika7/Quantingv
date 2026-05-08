WATCHLIST = {
    "commodities": {
        "GOLD": {"ticker": "GC=F", "label": "Gold", "currency": "USD", "category": "commodity"},
        "SILVER": {"ticker": "SI=F", "label": "Silver", "currency": "USD", "category": "commodity"},
    },
    "indian_indices": {
        "NIFTY50": {"ticker": "^NSEI", "label": "NIFTY 50", "currency": "INR", "category": "index"},
        "BANKNIFTY": {"ticker": "^NSEBANK", "label": "Bank NIFTY", "currency": "INR", "category": "index"},
        "SENSEX": {"ticker": "^BSESN", "label": "Sensex", "currency": "INR", "category": "index"},
    },
    "indian_stocks": {
        "RELIANCE": {"ticker": "RELIANCE.NS", "label": "Reliance", "currency": "INR", "category": "stock"},
        "TCS": {"ticker": "TCS.NS", "label": "TCS", "currency": "INR", "category": "stock"},
        "HDFCBANK": {"ticker": "HDFCBANK.NS", "label": "HDFC Bank", "currency": "INR", "category": "stock"},
        "INFY": {"ticker": "INFY.NS", "label": "Infosys", "currency": "INR", "category": "stock"},
        "ICICIBANK": {"ticker": "ICICIBANK.NS", "label": "ICICI Bank", "currency": "INR", "category": "stock"},
        "WIPRO": {"ticker": "WIPRO.NS", "label": "Wipro", "currency": "INR", "category": "stock"},
        "TATAMOTORS": {"ticker": "TATAMOTORS.NS", "label": "Tata Motors", "currency": "INR", "category": "stock"},
        "SBIN": {"ticker": "SBIN.NS", "label": "SBI", "currency": "INR", "category": "stock"},
    },
    "crypto": {
        "BTC": {"ticker": "BTC-USD", "label": "Bitcoin", "currency": "USD", "category": "crypto"},
        "ETH": {"ticker": "ETH-USD", "label": "Ethereum", "currency": "USD", "category": "crypto"},
    },
}

ALL_TICKERS = {
    key: val
    for group in WATCHLIST.values()
    for key, val in group.items()
}

PREDICTION_ASSETS = ["GOLD", "SILVER", "NIFTY50", "BANKNIFTY", "RELIANCE", "TCS", "HDFCBANK", "BTC"]
