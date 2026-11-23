"""SQLite persistence. Every scrape run is stored as an immutable snapshot => price history.

Role: the only module that touches the database. A "snapshot" is one complete scrape of every store: one row in
`snapshots` plus ~N rows in `products` tagged with that snapshot_id. Snapshots are never updated or deleted, so
comparing two snapshots gives price changes over time (the Market & Trends page).

Used by: app.scrapers.runner (save_snapshot after a successful scrape) and app.core.pipeline / app.api.routes
(read helpers). SQLite needs no server - the whole database is the file at config.DB_PATH.
"""
from __future__ import annotations

import sqlite3
from contextlib import closing
from datetime import datetime, timezone

import pandas as pd

from app import config

# Created on every connection (IF NOT EXISTS makes this a no-op after the first time), so a fresh checkout works
# without any setup step. The `products` columns mirror config.COLUMNS plus snapshot_id.
_SCHEMA = """
CREATE TABLE IF NOT EXISTS snapshots (
    snapshot_id INTEGER PRIMARY KEY AUTOINCREMENT,
    scraped_at  TEXT NOT NULL,
    n_products  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
    snapshot_id INTEGER NOT NULL,
    source TEXT, product_id TEXT, name TEXT, brand TEXT, category TEXT, department TEXT, raw_category TEXT,
    price REAL, discount_pct REAL, effective_price REAL, currency TEXT,
    description TEXT, image_url TEXT, url TEXT,
    rating REAL, review_count INTEGER, availability TEXT, stock INTEGER,
    screen_in REAL, ram_gb REAL, storage_gb REAL, cpu TEXT, scraped_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_products_snap ON products(snapshot_id, source);
"""


def _connect() -> sqlite3.Connection:
    """Open the database (creating the data folder and tables if needed). Callers close it via `closing(...)`."""
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(config.DB_PATH)
    con.executescript(_SCHEMA)
    return con


def save_snapshot(df: pd.DataFrame) -> int:
    """Store one full scrape as a new snapshot and return its id.

    `df` holds the products of all stores. The snapshot row is created first so its auto-increment id can be
    stamped onto every product row; reindexing to config.COLUMNS guarantees a stable column order/shape.
    """
    with closing(_connect()) as con:
        cur = con.execute("INSERT INTO snapshots (scraped_at, n_products) VALUES (?, ?)",
                          (datetime.now(timezone.utc).isoformat(timespec="seconds"), len(df)))
        sid = cur.lastrowid
        out = df.reindex(columns=config.COLUMNS).copy()
        out.insert(0, "snapshot_id", sid)
        out.to_sql("products", con, if_exists="append", index=False)
        con.commit()
    return sid


def list_snapshots() -> pd.DataFrame:
    """All snapshots (id, scrape time, product count), oldest first."""
    with closing(_connect()) as con:
        return pd.read_sql("SELECT * FROM snapshots ORDER BY snapshot_id", con)


def load_snapshot(snapshot_id: int | None = None) -> pd.DataFrame:
    """Load one snapshot (latest when None). Empty frame if nothing stored."""
    with closing(_connect()) as con:
        if snapshot_id is None:
            row = con.execute("SELECT MAX(snapshot_id) FROM snapshots").fetchone()
            snapshot_id = row[0]
        if snapshot_id is None:
            return pd.DataFrame(columns=["snapshot_id", *config.COLUMNS])
        return pd.read_sql("SELECT * FROM products WHERE snapshot_id = ?", con, params=(snapshot_id,))


def load_history() -> pd.DataFrame:
    """Every product row of every snapshot - the raw material for price-trend charts."""
    with closing(_connect()) as con:
        return pd.read_sql("SELECT * FROM products ORDER BY snapshot_id", con)
