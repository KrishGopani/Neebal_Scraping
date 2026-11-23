"""Run all scrapers and persist a snapshot.  CLI:  python -m src.scrapers.runner"""
from __future__ import annotations

import pandas as pd

from src import config, storage
from .base import ProgressCb
from .dummyjson import DummyJsonStore
from .webscraper_io import WebScraperStore

SCRAPERS = [WebScraperStore, DummyJsonStore]


def run_all(progress: ProgressCb = None, save: bool = True) -> tuple[pd.DataFrame, list[str]]:
    """Returns (dataframe, errors). One failing source does not abort the others."""
    frames, errors = [], []
    for i, cls in enumerate(SCRAPERS):
        scraper = cls()
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
