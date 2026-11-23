"""Background scrape job: one at a time, progress exposed for polling.

Role: scraping takes ~30 seconds, far too long for a single HTTP request, so POST /api/scrape starts it on a
background thread and returns immediately; the browser then polls GET /api/scrape/status for progress.

State lives in one module-level dict (`_job`). That is deliberately simple: it assumes a single server process,
which is how this app runs. Called by app.api.routes; calls app.scrapers.runner.run_all and app.core.pipeline.
"""
from __future__ import annotations

import threading

from app.core import pipeline
from app.scrapers.runner import run_all

# Shared job state read by status() and mutated by the worker thread. States: idle -> running -> done | error.
_job: dict = {"state": "idle", "progress": 0.0, "message": "", "errors": [], "snapshot_id": None}
_lock = threading.Lock()   # guards the check-then-set in start() so two clicks cannot launch two scrapes


def status() -> dict:
    """Snapshot (copy) of the current job state for the polling endpoint."""
    return dict(_job)


def _run() -> None:
    """Thread body: run all scrapers, then record success or failure in `_job`. Never raises."""
    def progress(msg: str, frac: float) -> None:
        """Callback handed to the scrapers; publishes their progress so /scrape/status can report it."""
        _job.update(progress=round(min(frac, 1.0), 3), message=msg)

    try:
        df, errors = run_all(progress=progress)
        if errors:
            _job.update(state="error", errors=errors, message="Scrape failed — previous data kept")
        else:
            # New data is in the DB: drop memoised snapshots/matches so the next request sees it.
            pipeline.clear_caches()
            _job.update(state="done", progress=1.0, message=f"Scraped {len(df)} products",
                        snapshot_id=pipeline.resolve_snapshot(None))
    except Exception as exc:  # noqa: BLE001 - surface any failure to the UI instead of dying silently
        _job.update(state="error", errors=[str(exc)], message="Scrape failed")


def start() -> dict:
    """Start a scrape unless one is already running (then report `already_running` instead of starting another)."""
    with _lock:
        if _job["state"] == "running":
            return {**_job, "already_running": True}
        _job.update(state="running", progress=0.0, message="Starting…", errors=[], snapshot_id=None)
    threading.Thread(target=_run, daemon=True).start()
    return dict(_job)
