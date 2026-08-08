import re
import sqlite3
from contextlib import contextmanager

from app.config import settings

USING_POSTGRES = bool(settings.DATABASE_URL)

if USING_POSTGRES:
    import psycopg
    from psycopg.rows import dict_row

    # sqlite3.IntegrityError covers unique/FK/check-constraint violations under
    # one type; psycopg's equivalent parent class is psycopg.errors.IntegrityError.
    # Call sites catch this alias instead of a backend-specific exception type.
    IntegrityError = psycopg.errors.IntegrityError

    _PLACEHOLDER_RE = re.compile(r"\?")

    def _adapt_sql(sql: str) -> str:
        """Translates our sqlite-style '?' placeholders to psycopg's '%s'. Safe
        because no query in this codebase embeds a literal '?' in a string."""
        return _PLACEHOLDER_RE.sub("%s", sql)

    def get_connection():
        conn = psycopg.connect(settings.DATABASE_URL, row_factory=dict_row, autocommit=False)
        return conn

else:
    IntegrityError = sqlite3.IntegrityError

    def _adapt_sql(sql: str) -> str:
        return sql

    def get_connection() -> sqlite3.Connection:
        conn = sqlite3.connect(settings.DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn


class _CursorProxy:
    """Wraps a DB-API cursor so callers can keep writing sqlite-style '?'
    placeholders regardless of backend; everything else passes through."""

    def __init__(self, cursor):
        self._cursor = cursor

    def execute(self, sql: str, params: tuple = ()):
        return self._cursor.execute(_adapt_sql(sql), params)

    def __getattr__(self, name):
        return getattr(self._cursor, name)


@contextmanager
def db_cursor():
    """Context manager yielding a cursor; commits on success, rolls back on error."""
    conn = get_connection()
    try:
        yield _CursorProxy(conn.cursor())
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def query_all(sql: str, params: tuple = ()) -> list:
    conn = get_connection()
    try:
        return conn.execute(_adapt_sql(sql), params).fetchall()
    finally:
        conn.close()


def query_one(sql: str, params: tuple = ()):
    conn = get_connection()
    try:
        return conn.execute(_adapt_sql(sql), params).fetchone()
    finally:
        conn.close()
