"""Background scrape job: one at a time, progress exposed for polling."""
from __future__ import annotations

import threading

from app.core import pipeline
from app.scrapers.runner import run_all

_job: dict = {"state": "idle", "progress": 0.0, "message": "", "errors": [], "snapshot_id": None}
_lock = threading.Lock()


def status() -> dict:
    return dict(_job)


def _run() -> None:
    def progress(msg: str, frac: float) -> None:
        _job.update(progress=round(min(frac, 1.0), 3), message=msg)

    try:
        df, errors = run_all(progress=progress)
        if errors:
            _job.update(state="error", errors=errors, message="Scrape failed — previous data kept")
        else:
            pipeline.clear_caches()
            _job.update(state="done", progress=1.0, message=f"Scraped {len(df)} products",
                        snapshot_id=pipeline.resolve_snapshot(None))
    except Exception as exc:  # noqa: BLE001 - surface any failure to the UI instead of dying silently
        _job.update(state="error", errors=[str(exc)], message="Scrape failed")


def start() -> dict:
    with _lock:
        if _job["state"] == "running":
            return {**_job, "already_running": True}
        _job.update(state="running", progress=0.0, message="Starting…", errors=[], snapshot_id=None)
    threading.Thread(target=_run, daemon=True).start()
    return dict(_job)
