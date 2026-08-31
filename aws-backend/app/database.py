"""Database access — SQLAlchemy engine/session, configurable via DATABASE_URL.

Defaults to SQLite (``sqlite:///./opsguardian.db``, zero setup). Switching to
Postgres or any other SQLAlchemy-supported backend is a config change:

    DATABASE_URL=postgresql+psycopg://user:pass@host:5432/dbname

(install the matching driver, e.g. ``psycopg[binary]``). Tables are created
automatically at startup via :func:`init_db`.
"""
from __future__ import annotations

import logging
from typing import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings

log = logging.getLogger(__name__)


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


def _make_engine() -> Engine:
    url = get_settings().database_url
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    engine = create_engine(url, connect_args=connect_args, pool_pre_ping=True)
    if url.startswith("sqlite"):
        # SQLite-specific pragmas: WAL for concurrent readers + a busy timeout so
        # the gunicorn workers don't error on simultaneous writes.
        @event.listens_for(engine, "connect")
        def _sqlite_pragmas(dbapi_connection, _connection_record):  # noqa: ANN001
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA busy_timeout=5000")
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine


engine = _make_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """FastAPI dependency yielding a request-scoped session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create missing tables (idempotent). Called at app startup."""
    try:
        # Import models so their metadata registers on Base before create_all.
        from .models import ticket_mapping  # noqa: F401

        Base.metadata.create_all(engine)
        log.info("Database ready (%s)", get_settings().database_url)
    except Exception:  # noqa: BLE001 - startup must not brick the whole API
        log.exception("Database init failed — ticket mappings will be unavailable")
