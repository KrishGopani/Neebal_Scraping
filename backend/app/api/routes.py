"""HTTP endpoints. All analysis lives in app.core.pipeline; this layer only parses params and serialises.

Role: the public API the React frontend talks to (all paths start with /api). Each endpoint turns query-string
settings into a pipeline.Params object, asks the pipeline for the result, and returns JSON. Interactive docs are
generated automatically at /docs.

Endpoints: /health, /meta, /analysis, /recommendations, /catalog, POST /scrape, GET /scrape/status.
Included by app.main; uses app.core.pipeline for analysis, app.storage for snapshot listing, app.api.jobs for scraping.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from app import config, storage
from app.api import jobs
from app.core import pipeline

# Every route below is mounted under /api (see app.main, which includes this router).
router = APIRouter(prefix="/api")


def get_params(
    ours: str = Query(config.DEFAULT_OURS, description="Source key of YOUR store"),
    snapshot: int | None = None,
    min_score: float = Query(55, ge=0, le=100),
    types: str = Query(",".join(pipeline.ALL_TYPES), description="Comma-separated match types"),
    one_to_one: bool = True,
    max_ratio: float = Query(5.0, ge=1.0, le=100),
    effective: bool = False,
    tol: float = Query(2.0, ge=0, le=50),
    scope: str = Query("", description="Comma-separated categories; empty = all"),
    min_confidence: str = Query("Low", pattern="^(Low|Medium|High)$", description="Lowest match confidence to include"),
) -> pipeline.Params:
    """FastAPI dependency: validate the shared query-string settings and bundle them into a pipeline.Params.

    Used by every analysis endpoint so they all accept the same filters (store, matching strictness, discount
    basis, tolerance, category scope, minimum match confidence). Bad values become 400/422 errors here, so the
    pipeline can trust its inputs.
    """
    if ours not in config.SOURCES:
        raise HTTPException(400, f"Unknown store '{ours}'. Valid: {list(config.SOURCES)}")
    # "a, b,,c" -> ("a", "b", "c"): comma lists arrive as one string; blanks are dropped.
    split = lambda s: tuple(x for x in (v.strip() for v in s.split(",")) if x)  # noqa: E731
    bad = set(split(types)) - set(pipeline.ALL_TYPES)
    if bad:
        raise HTTPException(400, f"Unknown match types: {sorted(bad)}")
    return pipeline.Params(ours=ours, snapshot=snapshot, min_score=min_score, types=split(types), one_to_one=one_to_one,
                           max_ratio=max_ratio, effective=effective, tol=tol, scope=split(scope), min_confidence=min_confidence)


def _need(data):
    """Turn "pipeline returned None" (no snapshot in the DB yet) into a clear 409 so the UI can offer a first scrape."""
    if data is None:
        raise HTTPException(409, "No scrape data yet. POST /api/scrape first.")
    return data


@router.get("/health")
def health():
    """Liveness probe for monitors/tests."""
    return {"status": "ok"}


@router.get("/meta")
def meta():
    """Static-ish info the UI needs to build itself: stores, stored snapshots, category list, match types."""
    snaps = storage.list_snapshots()
    latest = pipeline.resolve_snapshot(None)
    cats = sorted(pipeline._snapshot(latest).category.unique()) if latest is not None else []
    return pipeline.sanitize({
        "has_data": latest is not None,
        "sources": [{"key": k, "name": v["name"], "kind": v["kind"], "base_url": v["base_url"]} for k, v in config.SOURCES.items()],
        "default_ours": config.DEFAULT_OURS,
        "snapshots": snaps.sort_values("snapshot_id", ascending=False) if len(snaps) else snaps,
        "categories": cats,
        "match_types": list(pipeline.ALL_TYPES),
    })


@router.get("/analysis")
def analysis(p: pipeline.Params = Depends(get_params)):
    """The big one: KPIs, insights, matched pairs, category/brand tables, market data - all the dashboard shows."""
    return _need(pipeline.analysis(p))


@router.get("/recommendations")
def recommendations(p: pipeline.Params = Depends(get_params), thr: float = Query(10, ge=0, le=100),
                    margin: float = Query(3, ge=0, le=50), step: float = Query(15, ge=1, le=100)):
    """Rule-based pricing actions per matched pair. `thr` = gap (%) before acting, `margin` = how far below the
    competitor to price when raising, `step` = max price move per cycle (%). Kept separate from /analysis so the
    sliders can recompute just this list quickly."""
    return _need(pipeline.recommendations(p, thr, margin, step))


@router.get("/catalog")
def catalog(store: str = Query("ours", pattern="^(ours|competitor)$"), p: pipeline.Params = Depends(get_params)):
    """Full product list of one store ("ours" or "competitor" relative to the chosen perspective)."""
    return _need(pipeline.catalog(p, store))


@router.post("/scrape", status_code=202)
def start_scrape():
    """Kick off a background scrape (202 Accepted). Poll /scrape/status for progress."""
    return jobs.start()


@router.get("/scrape/status")
def scrape_status():
    """Current scrape job: state (idle/running/done/error), progress 0-1, message, errors, new snapshot id."""
    return jobs.status()
