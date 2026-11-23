"""API-level tests: call the FastAPI endpoints in-process (no server, no network) and check responses.

Role: guards the contract between backend and frontend - input validation, JSON shape, strict-JSON output, and that
filters/perspective actually change the result. Tests that need scraped data skip themselves (instead of failing)
when the database is empty, e.g. on a fresh checkout or in CI. Run with `pytest` from backend/.
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app

# TestClient talks to the app directly in memory, so these tests are fast and need no running uvicorn.
client = TestClient(app)


def test_health():
    """The liveness endpoint answers {"status": "ok"}."""
    assert client.get("/api/health").json() == {"status": "ok"}


def test_rejects_bad_params():
    """Invalid settings are refused up front: unknown store/match type -> 400, out-of-range number -> 422."""
    assert client.get("/api/analysis?ours=nope").status_code == 400
    assert client.get("/api/analysis?types=Bogus").status_code == 400
    assert client.get("/api/analysis?min_score=500").status_code == 422


def test_analysis_shape_when_data_present():
    """The analysis payload has the sections the frontend reads, sensible prices, and is strictly valid JSON."""
    r = client.get("/api/analysis")
    if r.status_code == 409:
        pytest.skip("no scrape data in this environment")
    d = r.json()
    assert {"meta", "kpis", "insights", "pairs", "categories", "market"} <= d.keys()
    assert d["meta"]["our_key"] != d["meta"]["comp_key"]
    assert all(p["our_price"] > 0 and p["comp_price"] > 0 for p in d["pairs"])
    assert "NaN" not in r.text          # response must be strict JSON (sanitize() turns NaN into null)


def test_swapping_roles_swaps_stores():
    """Choosing the other store as "ours" swaps which store is the competitor (the perspective switch works)."""
    a = client.get("/api/analysis?ours=webscraper")
    if a.status_code == 409:
        pytest.skip("no scrape data in this environment")
    b = client.get("/api/analysis?ours=dummyjson").json()
    assert a.json()["meta"]["our_name"] == b["meta"]["comp_name"]


def test_min_confidence_filters_pairs():
    """min_confidence=High keeps only high-confidence pairs (never more than unfiltered); bad values are rejected."""
    base = client.get("/api/analysis")
    if base.status_code == 409:
        pytest.skip("no scrape data in this environment")
    high = client.get("/api/analysis?min_confidence=High").json()
    assert all(p["confidence"] == "High" for p in high["pairs"])
    assert len(high["pairs"]) <= len(base.json()["pairs"])
    assert client.get("/api/analysis?min_confidence=Bogus").status_code == 422
