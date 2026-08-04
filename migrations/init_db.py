"""
One-shot / idempotent DB initializer.

Usage:
    python migrations/init_db.py

Reads DB_PATH from the environment (falls back to ./data/live_event.db),
creates the parent directory if needed, and applies schema.sql.
Safe to re-run — all statements are CREATE ... IF NOT EXISTS.
"""
import os
import sqlite3
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = Path(os.environ.get("DB_PATH", "./data/live_event.db"))
if not DB_PATH.is_absolute():
    DB_PATH = ROOT / DB_PATH

SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"


def main() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    sql = SCHEMA_PATH.read_text()
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.executescript(sql)
        conn.commit()
        print(f"[init_db] schema applied -> {DB_PATH}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
