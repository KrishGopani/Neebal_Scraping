import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    assert client.get("/api/health").json() == {"status": "ok"}


def test_rejects_bad_params():
    assert client.get("/api/analysis?ours=nope").status_code == 400
    assert client.get("/api/analysis?types=Bogus").status_code == 400
    assert client.get("/api/analysis?min_score=500").status_code == 422


def test_analysis_shape_when_data_present():
    r = client.get("/api/analysis")
    if r.status_code == 409:
        pytest.skip("no scrape data in this environment")
    d = r.json()
    assert {"meta", "kpis", "insights", "pairs", "categories", "market"} <= d.keys()
    assert d["meta"]["our_key"] != d["meta"]["comp_key"]
    assert all(p["our_price"] > 0 and p["comp_price"] > 0 for p in d["pairs"])
    assert "NaN" not in r.text          # response must be strict JSON


def test_swapping_roles_swaps_stores():
    a = client.get("/api/analysis?ours=webscraper")
    if a.status_code == 409:
        pytest.skip("no scrape data in this environment")
    b = client.get("/api/analysis?ours=dummyjson").json()
    assert a.json()["meta"]["our_name"] == b["meta"]["comp_name"]
