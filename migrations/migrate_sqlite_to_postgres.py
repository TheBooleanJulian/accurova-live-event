"""
One-time data copy: existing SQLite DB -> a fresh Postgres database.

Run this once when cutting over to Postgres, after provisioning the Postgres
instance but before pointing the live app at it. Assumes the Postgres schema
is empty (or already matches schema_postgres.sql — run init_db.py against it
first) and copies rows in FK-safe order (events, then their children).

Usage:
    SQLITE_PATH=./data/live_event.db DATABASE_URL=postgres://... python migrations/migrate_sqlite_to_postgres.py
"""
import os
import sqlite3
from pathlib import Path

import psycopg

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

ROOT = Path(__file__).resolve().parent.parent
SQLITE_PATH = Path(os.environ.get("SQLITE_PATH", os.environ.get("DB_PATH", "./data/live_event.db")))
if not SQLITE_PATH.is_absolute():
    SQLITE_PATH = ROOT / SQLITE_PATH
DATABASE_URL = os.environ["DATABASE_URL"]  # required — no silent fallback for a destructive-ish script

TABLES_IN_FK_ORDER = ["events", "email_signups", "enquiries"]


def _copy_table(sqlite_conn: sqlite3.Connection, pg_conn, table: str) -> int:
    rows = sqlite_conn.execute(f"SELECT * FROM {table}").fetchall()
    if not rows:
        return 0
    columns = rows[0].keys()
    col_list = ", ".join(columns)
    placeholders = ", ".join(["%s"] * len(columns))
    with pg_conn.cursor() as cur:
        for row in rows:
            cur.execute(
                f"INSERT INTO {table} ({col_list}) VALUES ({placeholders}) ON CONFLICT DO NOTHING",
                tuple(row[c] for c in columns),
            )
        # Postgres SERIAL sequences don't know about the ids we just inserted
        # explicitly — bump each sequence past the max id so future inserts
        # don't collide with migrated rows.
        cur.execute(
            f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), COALESCE((SELECT MAX(id) FROM {table}), 1))"
        )
    return len(rows)


def main() -> None:
    if not SQLITE_PATH.exists():
        raise SystemExit(f"SQLite DB not found at {SQLITE_PATH}")

    sqlite_conn = sqlite3.connect(SQLITE_PATH)
    sqlite_conn.row_factory = sqlite3.Row
    pg_conn = psycopg.connect(DATABASE_URL)
    try:
        for table in TABLES_IN_FK_ORDER:
            count = _copy_table(sqlite_conn, pg_conn, table)
            print(f"[migrate] {table}: copied {count} row(s)")
        pg_conn.commit()
    except Exception:
        pg_conn.rollback()
        raise
    finally:
        sqlite_conn.close()
        pg_conn.close()

    print("[migrate] done")


if __name__ == "__main__":
    main()
