"""Run all scrapers and persist a snapshot.  CLI:  python -m app.scrapers.runner

Role: the single entry point for "go collect the data". It executes every registered scraper, combines their
products into one table and saves it as a new snapshot (app.storage). Called from the command line (`make scrape`)
and from app.api.jobs when the user clicks "Run scrape" in the dashboard.

To add a store: write a BaseScraper subclass and append it to SCRAPERS (plus an entry in config.SOURCES).
"""
from __future__ import annotations

import pandas as pd

from app import config, storage
from .base import ProgressCb
from .dummyjson import DummyJsonStore
from .webscraper_io import WebScraperStore

# Execution order = progress order. Each class is instantiated fresh per run (own session / robots cache).
SCRAPERS = [WebScraperStore, DummyJsonStore]


def run_all(progress: ProgressCb = None, save: bool = True) -> tuple[pd.DataFrame, list[str]]:
    """Returns (dataframe, errors). One failing source does not abort the others.

    `progress(message, fraction)` is optional and receives overall progress 0-1 (each scraper owns an equal slice).
    A snapshot is saved only if EVERY source succeeded: a half-complete snapshot (one store missing) would make
    price comparisons and trends misleading, so on any error we keep the previous good data instead.
    """
    frames, errors = [], []
    for i, cls in enumerate(SCRAPERS):
        scraper = cls()
        # Rescale each scraper's own 0-1 progress into its slice of the overall bar (i is bound as a default arg).
        wrapped = (lambda msg, frac, i=i: progress(msg, (i + frac) / len(SCRAPERS))) if progress else None
        try:
            rows = scraper.scrape(wrapped)
            frames.append(pd.DataFrame(rows))
        except Exception as exc:  # noqa: BLE001 - report and continue with remaining sources
            errors.append(f"{scraper.source_name}: {exc}")
    df = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame(columns=config.COLUMNS)
    if save and not df.empty and not errors:
        storage.save_snapshot(df)
    return df, errors


if __name__ == "__main__":
    data, errs = run_all(progress=lambda m, f: print(f"[{f:5.0%}] {m}"))
    print(data.groupby("source").size())
    for e in errs:
        print("ERROR:", e)
