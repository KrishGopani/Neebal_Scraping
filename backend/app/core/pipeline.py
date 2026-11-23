"""Framework-neutral analysis pipeline: Params in -> JSON-safe dict out. Used by the FastAPI layer.

Role: the glue between storage, matching, analytics and the API. For a given set of user settings (Params) it:
  1. loads the chosen scrape snapshot and picks "your store" vs the competitor,
  2. applies the price basis (list vs post-discount),
  3. matches products (cached) and builds the price-gap table,
  4. applies the filters (match types, confidence, category scope),
  5. runs the analytics + insights and returns everything as plain JSON-safe data.

It imports no web framework, so it can be tested or reused (e.g. from a script) without FastAPI. app.api.routes is
its only production caller; the DataFrame-to-JSON conversion (sanitize) lives here too.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass
from functools import lru_cache

import numpy as np
import pandas as pd

from app.core import analytics as an
from app import config, storage
from app.core import insights
from app.core.matching import compute_matches

# Every match tier the matching engine can produce, strongest first. Also the default/allowed filter values.
ALL_TYPES = ("Equivalent", "Close Match", "Comparable")


@dataclass(frozen=True)
class Params:
    """All user-controllable settings for one analysis request.

    Frozen (immutable and hashable) so it can safely be used as part of a cache key. Defaults reproduce the
    dashboard's "no filters" view.
    """
    ours: str = config.DEFAULT_OURS
    snapshot: int | None = None          # which scrape to analyse; None = the latest
    min_score: float = 55.0              # drop candidate matches scoring below this (0-100)
    types: tuple[str, ...] = ALL_TYPES   # which match tiers to keep
    one_to_one: bool = True              # each competitor product matches at most one of ours
    max_ratio: float = 5.0               # drop pairs whose prices differ by more than this multiple
    effective: bool = False              # False = list prices, True = prices after listed discounts
    tol: float = 2.0                     # +/- % around the competitor price that counts as "at par"
    scope: tuple[str, ...] = ()          # restrict to these categories; empty = all
    min_confidence: str = "Low"          # Low = keep all matches, Medium = Medium+High, High = High only


# ----------------------------------------------------------------------------- serialisation
def sanitize(obj):
    """Recursively convert numpy/pandas scalars and NaN/inf to JSON-safe Python values.

    Why: pandas/numpy produce numpy integers and NaN, which Python's JSON encoder either cannot serialise or writes
    as the literal `NaN` - invalid JSON that browsers refuse to parse. NaN/inf become null, numpy types become plain
    int/float/bool, and DataFrames become lists of row dicts.
    """
    if isinstance(obj, dict):
        return {str(k): sanitize(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [sanitize(v) for v in obj]
    if isinstance(obj, pd.DataFrame):
        return records(obj)
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating, float)):
        return None if (math.isnan(obj) or math.isinf(obj)) else float(obj)
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    if obj is pd.NA or obj is pd.NaT:
        return None
    return obj


def records(df: pd.DataFrame) -> list[dict]:
    """DataFrame -> list of row dicts. Goes through pandas' own JSON writer, which already maps NaN to null."""
    if df is None or df.empty:
        return []
    return json.loads(df.to_json(orient="records", date_format="iso"))


# ----------------------------------------------------------------------------- cached data access
# Caches avoid re-reading SQLite and (more importantly) re-running the matching on every request. Entries are keyed
# by snapshot id, so they stay valid until new data arrives, at which point clear_caches() empties them.
@lru_cache(maxsize=8)
def _snapshot(sid: int) -> pd.DataFrame:
    """Load one snapshot's products (memoised)."""
    return storage.load_snapshot(sid)


@lru_cache(maxsize=64)
def _matches(sid: int, ours_key: str, comp_key: str, min_score: float, one_to_one: bool) -> pd.DataFrame:
    """Run (and memoise) product matching for one snapshot and perspective.

    Only the settings that influence matching are in the cache key. Price basis, tolerance, category scope and
    other filters are applied afterwards, so toggling them is instant and never recomputes the matches.
    """
    df = _snapshot(sid)
    return compute_matches(df[df.source == ours_key], df[df.source == comp_key], min_score, one_to_one)


def clear_caches() -> None:
    """Forget memoised snapshots/matches - called after a new scrape so fresh data is picked up."""
    _snapshot.cache_clear()
    _matches.cache_clear()


def names() -> dict[str, str]:
    """Map store key -> display name, e.g. {"webscraper": "WebScraper Store"}."""
    return {k: v["name"] for k, v in config.SOURCES.items()}


def competitor_of(ours: str) -> str:
    """The competitor is simply the other configured source (the app compares exactly two stores)."""
    return next(k for k in config.SOURCES if k != ours)


def resolve_snapshot(sid: int | None) -> int | None:
    """Pick the snapshot to use: the requested one if it exists, else the latest; None if nothing is scraped yet."""
    snaps = storage.list_snapshots()
    if snaps.empty:
        return None
    return int(sid) if sid is not None and sid in set(snaps.snapshot_id) else int(snaps.snapshot_id.max())


# ----------------------------------------------------------------------------- context
@dataclass
class Context:
    """Everything computed for one request, bundled so the response builders below share the same filtered data."""
    ours: pd.DataFrame      # your store's products (after price basis + category scope)
    comps: pd.DataFrame     # competitor products (same treatment)
    pairs: pd.DataFrame     # matched pairs with price-gap columns, after all filters
    cats: pd.DataFrame      # per-category summary
    kpis: dict              # headline numbers computed from `pairs`
    sid: int
    scraped_at: str
    n_matches_total: int
    our_name: str
    comp_name: str
    our_key: str
    comp_key: str


def build_context(p: Params) -> Context | None:
    """Run steps 1-4 of the pipeline (see module docstring). Returns None if no data has been scraped yet."""
    sid = resolve_snapshot(p.snapshot)
    if sid is None:
        return None
    snaps = storage.list_snapshots().set_index("snapshot_id")
    raw = _snapshot(sid)
    our_key, comp_key = p.ours, competitor_of(p.ours)
    ours_all = an.apply_price_basis(raw[raw.source == our_key], p.effective)
    comps_all = an.apply_price_basis(raw[raw.source == comp_key], p.effective)
    all_cats = set(ours_all.category) | set(comps_all.category)
    scope = set(p.scope) & all_cats or all_cats   # empty/unknown selection means "all categories"

    # Matching runs on the whole catalogues (cached); filters below then narrow the resulting pairs.
    m = _matches(sid, our_key, comp_key, float(p.min_score), p.one_to_one)
    m = m[m.match_type.isin(p.types)]
    pairs = an.build_pairs(m, ours_all, comps_all, p.tol, p.max_ratio)
    if not pairs.empty and p.min_confidence != "Low":
        rank = {"Low": 0, "Medium": 1, "High": 2}   # keep pairs at or above the requested reliability level
        pairs = pairs[pairs.confidence.map(rank) >= rank[p.min_confidence]].reset_index(drop=True)
    ours, comps = ours_all[ours_all.category.isin(scope)], comps_all[comps_all.category.isin(scope)]
    if not pairs.empty:
        pairs = pairs[pairs.category.isin(scope)].reset_index(drop=True)
    cats = an.category_summary(ours, comps, pairs)
    return Context(ours, comps, pairs, cats, an.kpis(pairs), sid, snaps.scraped_at[sid], len(m),
                   names()[our_key], names()[comp_key], our_key, comp_key)


# ----------------------------------------------------------------------------- response builders
# Whitelist of pair columns sent to the browser (keeps the payload small and the API contract explicit).
PAIR_COLUMNS = [
    "our_id", "comp_id", "label", "category", "brand", "our_name", "comp_name", "our_price", "comp_price",
    "diff", "pct_diff", "abs_pct_diff", "position", "score", "match_type", "confidence", "brand_match",
    "name_sim", "text_sim", "spec_sim", "shared_models", "our_rating", "comp_rating", "rating_diff",
    "our_review_count", "comp_review_count", "our_image_url", "comp_image_url", "our_url", "comp_url",
    "our_description", "comp_description",
]


def _brand_table(ours: pd.DataFrame, comps: pd.DataFrame) -> pd.DataFrame:
    """Per-brand size, median price and rating for both stores side by side (outer join keeps one-sided brands)."""
    b1 = ours.groupby("brand").agg(our_n=("price", "size"), our_median=("price", "median"), our_rating=("rating", "mean"))
    b2 = comps.groupby("brand").agg(comp_n=("price", "size"), comp_median=("price", "median"), comp_rating=("rating", "mean"))
    bt = b1.join(b2, how="outer").reset_index()
    bt["gap"] = (bt.our_median / bt.comp_median - 1) * 100
    return bt.sort_values("our_n", ascending=False, na_position="last")


def _market(ctx: Context, history: pd.DataFrame) -> dict:
    """Data for the Market & Trends page: competitor discounting, assortment, price tiers, low stock, price history.

    `history` is every stored snapshot. Trend series/changes need at least two snapshots, otherwise they are empty
    and the page shows a "scrape again to build history" hint instead.
    """
    ours, comps = ctx.ours, ctx.comps
    disc = comps[comps.discount_pct > 0]
    by_cat = (disc.groupby("category").discount_pct.agg(mean="mean", max="max", n="size").reset_index()
              if len(disc) else pd.DataFrame())

    both = pd.concat([ours.assign(store=ctx.our_name), comps.assign(store=ctx.comp_name)], ignore_index=True)
    assortment = both.groupby(["category", "store"]).size().reset_index(name="products")
    both["band"] = an.price_bands(both)
    bands = both.groupby(["store", "band"], observed=False).size().reset_index(name="n")
    bands["share"] = bands.n / bands.groupby("store").n.transform("sum") * 100
    bands["band"] = bands.band.astype(str)

    # Competitor products nearly out of stock (<10 units) = a chance to win their demand. Skip if stock is unknown.
    low = comps[comps.stock.fillna(99) < 10] if comps.stock.notna().any() else comps.iloc[0:0]
    low = low[["name", "category", "price", "stock", "availability"]].sort_values("stock")

    n_snap = int(history.snapshot_id.nunique()) if len(history) else 0
    store_names = {ctx.our_key: ctx.our_name, ctx.comp_key: ctx.comp_name}
    trend = an.category_trend(history) if n_snap >= 2 else pd.DataFrame()
    if len(trend):
        trend["store"] = trend.source.map(store_names)
    changes = an.price_changes(history) if n_snap >= 2 else pd.DataFrame()
    if len(changes):
        changes["store"] = changes.source.map(store_names)
        changes = changes.sort_values("change_pct", key=abs, ascending=False)

    return {
        "discount_by_category": by_cat, "discount_values": list(disc.discount_pct.round(2)),
        "discount_share": float(len(disc) / len(comps) * 100) if len(comps) else 0.0,
        "assortment": assortment, "price_bands": bands, "stock_low": low,
        "trend": {"n_snapshots": n_snap, "series": trend, "changes": changes.head(200) if len(changes) else changes},
        "price_spread": both[both.category.isin(set(ours.category) & set(comps.category))][["store", "category", "price", "name"]],
    }


def analysis(p: Params) -> dict | None:
    """Full dashboard payload for GET /api/analysis (meta, KPIs, insights, pairs, categories, market, ...).

    Returns None when there is no data. The result is passed through sanitize() so it is strict JSON.
    """
    ctx = build_context(p)
    if ctx is None:
        return None
    pairs = ctx.pairs
    k = ctx.kpis
    if k["n"]:   # verdict is only meaningful when at least one pair exists
        label, tone = an.price_verdict(k["price_index"])
        k = {**k, "verdict": label, "verdict_tone": tone}
    ratings = pd.concat([ctx.ours.assign(store=ctx.our_name), ctx.comps.assign(store=ctx.comp_name)], ignore_index=True)
    shared = set(ctx.ours.category) & set(ctx.comps.category)
    ratings = ratings[ratings.category.isin(shared)][["store", "category", "name", "price", "rating", "review_count"]]

    payload = {
        "meta": {
            "our_key": ctx.our_key, "comp_key": ctx.comp_key, "our_name": ctx.our_name, "comp_name": ctx.comp_name,
            "snapshot_id": ctx.sid, "scraped_at": ctx.scraped_at, "effective": p.effective,
            "n_ours": len(ctx.ours), "n_comps": len(ctx.comps), "n_pairs": len(pairs),
            "n_matches_total": ctx.n_matches_total, "tol": p.tol,
        },
        "kpis": k,
        "insights": insights.build_insights(ctx.ours, ctx.comps, pairs, ctx.cats, ctx.our_name, ctx.comp_name),
        "pairs": pairs[[c for c in PAIR_COLUMNS if c in pairs.columns]] if len(pairs) else [],
        "categories": ctx.cats,
        "brand_category": an.brand_category_matrix(ctx.ours, ctx.comps),
        "brands": _brand_table(ctx.ours, ctx.comps),
        "benchmark": an.market_benchmark(ctx.ours, ctx.comps),
        "ratings": ratings,
        "market": _market(ctx, storage.load_history()),
    }
    return sanitize(payload)


def recommendations(p: Params, thr: float, margin: float, step: float) -> list[dict] | None:
    """Pricing actions for the current filters (see analytics.recommendations for the rules and parameters)."""
    ctx = build_context(p)
    if ctx is None:
        return None
    return sanitize(an.recommendations(ctx.pairs, thr, margin, step))


def catalog(p: Params, store: str) -> list[dict] | None:
    """Product list of one store ("ours" or "competitor"), honouring price basis and category scope."""
    ctx = build_context(p)
    if ctx is None:
        return None
    df = ctx.ours if store == "ours" else ctx.comps
    cols = ["product_id", "image_url", "name", "brand", "category", "price", "discount_pct", "effective_price", "rating",
            "review_count", "availability", "screen_in", "ram_gb", "storage_gb", "cpu", "description", "url"]
    return sanitize(df[cols])
