"""HTTP endpoints. All analysis lives in app.core.pipeline; this layer only parses params and serialises."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from app import config, storage
from app.api import jobs
from app.core import pipeline

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
) -> pipeline.Params:
    if ours not in config.SOURCES:
        raise HTTPException(400, f"Unknown store '{ours}'. Valid: {list(config.SOURCES)}")
    split = lambda s: tuple(x for x in (v.strip() for v in s.split(",")) if x)  # noqa: E731
    bad = set(split(types)) - set(pipeline.ALL_TYPES)
    if bad:
        raise HTTPException(400, f"Unknown match types: {sorted(bad)}")
    return pipeline.Params(ours, snapshot, min_score, split(types), one_to_one, max_ratio, effective, tol, split(scope))


def _need(data):
    if data is None:
        raise HTTPException(409, "No scrape data yet. POST /api/scrape first.")
    return data


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/meta")
def meta():
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
    return _need(pipeline.analysis(p))


@router.get("/recommendations")
def recommendations(p: pipeline.Params = Depends(get_params), thr: float = Query(10, ge=0, le=100),
                    margin: float = Query(3, ge=0, le=50), step: float = Query(15, ge=1, le=100)):
    return _need(pipeline.recommendations(p, thr, margin, step))


@router.get("/catalog")
def catalog(store: str = Query("ours", pattern="^(ours|competitor)$"), p: pipeline.Params = Depends(get_params)):
    return _need(pipeline.catalog(p, store))


@router.post("/scrape", status_code=202)
def start_scrape():
    return jobs.start()


@router.get("/scrape/status")
def scrape_status():
    return jobs.status()
