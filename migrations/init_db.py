"""
One-shot / idempotent DB initializer.

Usage:
    python migrations/init_db.py

Reads DATABASE_URL from the environment — if set, applies schema_postgres.sql
to that Postgres database. Otherwise falls back to SQLite at DB_PATH (default
./data/live_event.db), creating the parent directory if needed, and applies
schema.sql. Safe to re-run — all statements are CREATE ... IF NOT EXISTS.
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
DATABASE_URL = os.environ.get("DATABASE_URL", "")
DB_PATH = Path(os.environ.get("DB_PATH", "./data/live_event.db"))
if not DB_PATH.is_absolute():
    DB_PATH = ROOT / DB_PATH

SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"
SCHEMA_PATH_POSTGRES = Path(__file__).resolve().parent / "schema_postgres.sql"


def _add_column_if_missing_sqlite(conn: sqlite3.Connection, table: str, column: str, coltype: str) -> None:
    """CREATE TABLE ... IF NOT EXISTS never alters an existing table, so a column
    added to schema.sql after the table already exists on a deployed DB needs an
    explicit, idempotent ALTER TABLE here."""
    existing = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
    if column not in existing:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {coltype}")


def _add_column_if_missing_postgres(conn, table: str, column: str, coltype: str) -> None:
    existing = {
        row[0]
        for row in conn.execute(
            "SELECT column_name FROM information_schema.columns WHERE table_name = %s", (table,)
        ).fetchall()
    }
    if column not in existing:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {coltype}")


def _init_postgres(database_url: str) -> None:
    import psycopg

    sql = SCHEMA_PATH_POSTGRES.read_text()
    conn = psycopg.connect(database_url)
    try:
        conn.execute(sql)
        _add_column_if_missing_postgres(conn, "events", "thumbnail_path", "TEXT")
        _add_column_if_missing_postgres(conn, "events", "gallery_password", "TEXT")
        _add_column_if_missing_postgres(conn, "events", "show_on_homepage", "INTEGER NOT NULL DEFAULT 1")
        _add_column_if_missing_postgres(conn, "email_signups", "name", "TEXT")
        conn.commit()
    finally:
        conn.close()


def _init_sqlite(db_path: Path) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    sql = SCHEMA_PATH.read_text()
    conn = sqlite3.connect(db_path)
    try:
        conn.executescript(sql)
        _add_column_if_missing_sqlite(conn, "events", "thumbnail_path", "TEXT")
        _add_column_if_missing_sqlite(conn, "events", "gallery_password", "TEXT")
        _add_column_if_missing_sqlite(conn, "events", "show_on_homepage", "INTEGER NOT NULL DEFAULT 1")
        _add_column_if_missing_sqlite(conn, "email_signups", "name", "TEXT")
        conn.commit()
    finally:
        conn.close()


def init_db(db_path: Path = DB_PATH) -> None:
    if DATABASE_URL:
        _init_postgres(DATABASE_URL)
    else:
        _init_sqlite(db_path)


def main() -> None:
    init_db()
    print(f"[init_db] schema applied -> {'Postgres (DATABASE_URL)' if DATABASE_URL else DB_PATH}")


if __name__ == "__main__":
    main()
