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


def _add_column_if_missing(conn: sqlite3.Connection, table: str, column: str, coltype: str) -> None:
    """CREATE TABLE ... IF NOT EXISTS never alters an existing table, so a column
    added to schema.sql after the table already exists on a deployed DB needs an
    explicit, idempotent ALTER TABLE here."""
    existing = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
    if column not in existing:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {coltype}")


def init_db(db_path: Path = DB_PATH) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    sql = SCHEMA_PATH.read_text()
    conn = sqlite3.connect(db_path)
    try:
        conn.executescript(sql)
        _add_column_if_missing(conn, "events", "thumbnail_path", "TEXT")
        conn.commit()
    finally:
        conn.close()


def main() -> None:
    init_db()
    print(f"[init_db] schema applied -> {DB_PATH}")


if __name__ == "__main__":
    main()
