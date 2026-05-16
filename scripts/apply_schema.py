#!/usr/bin/env python3
"""
Run this locally (not on Railway) to apply the Supabase schema.
Requires: pip install psycopg2-binary python-dotenv

Usage:
    python scripts/apply_schema.py
"""
import os
import sys
from pathlib import Path

# Load .env from repo root
env_path = Path(__file__).parent.parent / ".env"
if env_path.exists():
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

DATABASE_URL = os.getenv("DATABASE_URL", "")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL not set in .env")
    sys.exit(1)

schema_path = Path(__file__).parent.parent / "supabase" / "schema.sql"
schema_sql = schema_path.read_text()

print(f"Connecting to: {DATABASE_URL[:50]}...")
try:
    import psycopg2
except ImportError:
    print("ERROR: psycopg2 not installed. Run: pip install psycopg2-binary")
    sys.exit(1)

try:
    conn = psycopg2.connect(DATABASE_URL, sslmode="require")
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute(schema_sql)
    print("Schema applied successfully!")
    print("\nTables created:")
    cur.execute("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;")
    for row in cur.fetchall():
        print(f"  ✓ {row[0]}")
    cur.close()
    conn.close()
except Exception as e:
    print(f"ERROR: {e}")
    print("\nFallback: paste supabase/schema.sql into Supabase SQL Editor manually.")
    sys.exit(1)
