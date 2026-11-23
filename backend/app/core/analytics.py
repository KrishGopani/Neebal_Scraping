"""Analytics on the scraped catalogues and matched pairs. Pure functions over DataFrames.

Role: all the business maths lives here - price gaps, the price index, win rate, category/brand comparisons,
benchmarking of unmatched products, pricing recommendations, price bands and history/trend helpers. Every function
takes DataFrames and returns DataFrames/dicts with no side effects, which makes them easy to test (tests/test_core.py).

Called by app.core.pipeline (which assembles them into the API response) and app.core.insights (which turns the
numbers into sentences). Terminology: "ours" = your store, "comps" = competitor, "pair" = one matched product pair,
"gap %" = (our price - competitor price) / competitor price, so negative means you are cheaper.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

# The three possible outcomes for a pair, in display order. "At par" = within the tolerance setting of the competitor.
PAR_LABELS = ("Cheaper", "At par", "Pricier")


# ---------------------------------------------------------------- preparation
def apply_price_basis(df: pd.DataFrame, effective: bool) -> pd.DataFrame:
    """`price` becomes the headline list price, or the post-discount price when `effective`.

    Every later calculation reads the `price` column, so switching basis here changes the whole dashboard. The
    original list price is preserved in `list_price`.
    """
    out = df.copy()
    out["list_price"] = out["price"]
    if effective:
        out["price"] = out["effective_price"]
    return out


def match_confidence(match_type: str, score: float) -> str:
    """Business-friendly reliability label for a match: High (same model), Medium (same family, score >= 70), else Low.

    Low-confidence pairs are still shown but never drive automatic-looking price actions (see recommendations()).
    """
    if match_type == "Equivalent":
        return "High"
    if match_type == "Close Match" and score >= 70:
        return "Medium"
    return "Low"


def build_pairs(matches: pd.DataFrame, ours: pd.DataFrame, comps: pd.DataFrame, tol: float = 2.0,
                max_ratio: float | None = 5.0) -> pd.DataFrame:
    """Wide, analysis-ready table: one row per matched pair, with price gap metrics.

    `max_ratio`: drop pairs whose prices differ by more than this multiple (either direction) —
    such a gap almost always means the two products are in different classes, not a pricing signal.
    """
    if matches.empty:
        return pd.DataFrame()
    # Pull the product details for both sides onto each match row (prefixes our_/comp_ keep the two sides apart).
    keep = ["product_id", "name", "brand", "category", "price", "rating", "review_count",
            "image_url", "url", "description", "discount_pct", "availability"]
    o = ours[keep].add_prefix("our_")
    c = comps[keep].add_prefix("comp_")
    df = (matches.merge(o, left_on="our_id", right_on="our_product_id")
                 .merge(c, left_on="comp_id", right_on="comp_product_id")
                 .drop(columns=["our_product_id", "comp_product_id"]))
    if max_ratio:
        # Ratio of the larger to the smaller price, so it is symmetric (a 6x gap either way is dropped).
        ratio = np.maximum(df.our_price, df.comp_price) / np.minimum(df.our_price, df.comp_price)
        df = df[ratio <= max_ratio].copy()
    df["category"], df["brand"] = df["our_category"], df["our_brand"]
    df["confidence"] = [match_confidence(t, sc) for t, sc in zip(df.match_type, df.score)]
    df["diff"] = (df.our_price - df.comp_price).round(2)
    df["pct_diff"] = ((df.our_price - df.comp_price) / df.comp_price * 100).round(2)
    df["abs_pct_diff"] = df.pct_diff.abs()
    # "position" uses the tolerance band: inside +/-tol% counts as parity rather than cheaper/pricier.
    df["position"] = np.where(df.pct_diff < -tol, "Cheaper", np.where(df.pct_diff > tol, "Pricier", "At par"))
    df["rating_diff"] = (df.our_rating - df.comp_rating).round(2)
    df["label"] = df.our_name + "  ↔  " + df.comp_name
    return df.sort_values("score", ascending=False).reset_index(drop=True)


# ---------------------------------------------------------------- headline KPIs
def price_verdict(price_index: float) -> tuple[str, str]:
    """(label, tone) for a price index where 100 = parity with the competitor.

    <95 you are clearly cheaper ("Price leader"); 95-105 within normal noise ("At market"); 105-120 "Premium
    priced"; >120 "Well above market". The UI colours cards by the returned tone.
    """
    if price_index < 95:
        return "Price leader", "good"
    if price_index <= 105:
        return "At market", "neutral"
    if price_index <= 120:
        return "Premium priced", "warn"
    return "Well above market", "bad"


def kpis(pairs: pd.DataFrame) -> dict:
    """Headline numbers for the Overview page from the matched pairs ({"n": 0} when there are none).

    price_index = average of (our price / competitor price) x 100 across pairs, so 100 is parity, 80 means you
    are on average 20% cheaper. win_rate = share of pairs where you are cheaper or at par (i.e. not losing on price).
    """
    if pairs.empty:
        return {"n": 0}
    n = len(pairs)
    counts = pairs.position.value_counts()
    index = float((pairs.our_price / pairs.comp_price).mean() * 100)
    return {
        "n": n,
        "n_cheaper": int(counts.get("Cheaper", 0)),
        "n_par": int(counts.get("At par", 0)),
        "n_pricier": int(counts.get("Pricier", 0)),
        "pct_cheaper": counts.get("Cheaper", 0) / n * 100,
        "pct_par": counts.get("At par", 0) / n * 100,
        "pct_pricier": counts.get("Pricier", 0) / n * 100,
        "win_rate": (counts.get("Cheaper", 0) + counts.get("At par", 0)) / n * 100,
        "avg_pct_diff": float(pairs.pct_diff.mean()),
        "median_pct_diff": float(pairs.pct_diff.median()),
        "avg_abs_diff": float(pairs["diff"].abs().mean()),
        "price_index": index,
        "n_equivalent": int((pairs.match_type == "Equivalent").sum()),
    }


# ---------------------------------------------------------------- category / brand
def _group_stats(df: pd.DataFrame, key: str, prefix: str) -> pd.DataFrame:
    """Count / average / median price and average rating per group, with column names prefixed (our_ / comp_)."""
    g = df.groupby(key).agg(**{
        f"{prefix}_n": ("price", "size"),
        f"{prefix}_avg": ("price", "mean"),
        f"{prefix}_median": ("price", "median"),
        f"{prefix}_rating": ("rating", "mean"),
    })
    return g.reset_index()


def category_summary(ours: pd.DataFrame, comps: pd.DataFrame, pairs: pd.DataFrame, key: str = "category") -> pd.DataFrame:
    """One row per category: sizes, typical prices and ratings of both stores, the price gap, and matched-pair stats.

    "coverage" says who sells the category (Both / Only you / Only competitor), which also reveals assortment gaps.
    Gap columns are filled only where both stores sell the category. Medians are used for the headline gap because
    they are robust to outliers (a $20k vehicle would wreck an average).
    """
    df = _group_stats(ours, key, "our").merge(_group_stats(comps, key, "comp"), on=key, how="outer")
    # An outer merge leaves NaN counts on the side that does not sell the category; use that to label coverage.
    df["coverage"] = np.select(
        [df.our_n.isna(), df.comp_n.isna()], ["Only competitor", "Only you"], default="Both")
    both = df.coverage == "Both"
    df["median_gap_pct"] = np.where(both, (df.our_median / df.comp_median - 1) * 100, np.nan)
    df["avg_gap_pct"] = np.where(both, (df.our_avg / df.comp_avg - 1) * 100, np.nan)
    if not pairs.empty:
        pk = "category" if key == "category" else key   # (same either way; kept explicit for readability)
        ps = pairs.groupby(pk).agg(matched_n=("pct_diff", "size"), matched_avg_pct_diff=("pct_diff", "mean")).reset_index()
        df = df.merge(ps, on=key, how="left")
    else:
        df["matched_n"], df["matched_avg_pct_diff"] = np.nan, np.nan
    return df.sort_values("our_n", ascending=False, na_position="last").reset_index(drop=True)


def brand_category_matrix(ours: pd.DataFrame, comps: pd.DataFrame) -> pd.DataFrame:
    """Brand x category cells where both stores carry the brand: median price gap %.

    Comparing within a category avoids misleading brand-level numbers (e.g. Apple phones vs Apple laptops).
    """
    o = ours.groupby(["brand", "category"]).price.agg(our_median="median", our_n="size")
    c = comps.groupby(["brand", "category"]).price.agg(comp_median="median", comp_n="size")
    df = o.join(c, how="inner").reset_index()
    df["gap_pct"] = (df.our_median / df.comp_median - 1) * 100
    return df


# ---------------------------------------------------------------- benchmarking unmatched products
def market_benchmark(ours: pd.DataFrame, comps: pd.DataFrame) -> pd.DataFrame:
    """Position each of OUR products against the competitor's price distribution in the same category
    (and brand where they sell it). Works for products with no direct match.

    Gives every product (not only the few matched ones) a price position: % above/below the competitor's category
    median, and a percentile (share of competitor products priced at or below ours).
    """
    rows = []
    comp_by_cat = {k: v.price.to_numpy() for k, v in comps.groupby("category")}
    comp_by_bc = {k: v.price.median() for k, v in comps.groupby(["brand", "category"])}
    for r in ours.itertuples():
        arr = comp_by_cat.get(r.category)
        if arr is None or len(arr) == 0:
            continue
        med = float(np.median(arr))
        bm = comp_by_bc.get((r.brand, r.category))
        rows.append({
            "product_id": r.product_id, "name": r.name, "brand": r.brand, "category": r.category, "price": r.price,
            "comp_n": len(arr), "comp_cat_median": med, "vs_cat_pct": (r.price / med - 1) * 100,
            "percentile": float((arr <= r.price).mean() * 100),
            "comp_brand_median": bm, "vs_brand_pct": None if bm is None else (r.price / bm - 1) * 100,
            "rating": r.rating, "review_count": r.review_count,
        })
    return pd.DataFrame(rows)


# ---------------------------------------------------------------- recommendations
def recommendations(pairs: pd.DataFrame, act_threshold: float = 10.0, undercut_margin: float = 3.0,
                    max_step_pct: float = 15.0) -> pd.DataFrame:
    """Rule-based pricing actions on matched pairs. Decision support only — never auto-applied.

    * Low-confidence matches get "Manual review" (the gap may just be a product difference).
    * Suggested prices move at most `max_step_pct` per cycle toward the target.

    Rules, in order, for each pair (gap = our price vs competitor):
      1. Low-confidence match with a big gap  -> Manual review.
      2. Pricier than threshold but rated >= 0.5 stars higher -> Hold (the premium is justified by quality).
      3. Pricier than threshold otherwise -> Reduce toward ~5% above the competitor (threshold/200 above).
      4. Cheaper than threshold -> Raise toward `undercut_margin`% below the competitor (free margin, still cheaper).
      5. Otherwise -> Monitor.
    `act_threshold` is the gap in % that triggers action; the result is sorted by largest price change first.
    """
    if pairs.empty:
        return pd.DataFrame()
    out = []
    for r in pairs.itertuples():
        # A meaningfully better rating (+0.5 stars) is treated as evidence that a higher price is deserved.
        premium_ok = pd.notna(r.rating_diff) and r.rating_diff >= 0.5
        target, capped = r.our_price, False
        if r.confidence == "Low" and abs(r.pct_diff) > act_threshold:
            action, why = "Manual review", f"{r.pct_diff:+.0f}% gap, but the match is low-confidence — verify the products are comparable."
        elif r.pct_diff > act_threshold and premium_ok:
            action, why = "Hold (premium justified)", f"{r.pct_diff:+.0f}% vs competitor, but rated {r.rating_diff:+.1f}★ higher."
        elif r.pct_diff > act_threshold:
            action, target = "Reduce price", round(r.comp_price * (1 + act_threshold / 200), 2)
            why = f"{r.pct_diff:+.0f}% above competitor without a rating advantage."
            floor = r.our_price * (1 - max_step_pct / 100)   # never cut more than max_step_pct in one cycle
            capped, target = target < floor, max(target, floor)
        elif r.pct_diff < -act_threshold:
            action, target = "Raise price", round(r.comp_price * (1 - undercut_margin / 100), 2)
            why = f"{r.pct_diff:+.0f}% below competitor — headroom to move up and still undercut."
            ceil = r.our_price * (1 + max_step_pct / 100)   # never raise more than max_step_pct in one cycle
            capped, target = target > ceil, min(target, ceil)
        else:
            action, why = "Monitor", "Within tolerance of competitor."
        target = round(target, 2)
        if capped:
            why += f" Step capped at ±{max_step_pct:.0f}%."
        out.append({
            "our_name": r.our_name, "comp_name": r.comp_name, "category": r.category, "match_type": r.match_type,
            "confidence": r.confidence, "our_price": r.our_price, "comp_price": r.comp_price,
            "pct_diff": r.pct_diff, "action": action, "suggested_price": target,
            "price_change": round(target - r.our_price, 2), "rationale": why,
        })
    df = pd.DataFrame(out)
    # Biggest price moves first; the tiny 1e-3 bonus puts "Manual review" rows ahead of zero-change "Monitor" rows.
    df["priority"] = df.price_change.abs() + (df.action == "Manual review") * 1e-3
    return df.sort_values("priority", ascending=False).drop(columns="priority").reset_index(drop=True)


# ---------------------------------------------------------------- assortment
def price_bands(df: pd.DataFrame, bins=(0, 50, 150, 400, 1000, 2500, np.inf)) -> pd.Series:
    """Label each product with a price tier ("< $50" ... "> $2.5k") to compare how the two catalogues are positioned."""
    labels = ["< $50", "$50–150", "$150–400", "$400–1k", "$1k–2.5k", "> $2.5k"]
    return pd.cut(df.price, bins=list(bins), labels=labels, right=False)


# ---------------------------------------------------------------- history
def category_trend(history: pd.DataFrame) -> pd.DataFrame:
    """Median price per (snapshot, store, category). Rows carry per-product timestamps, so group by
    snapshot_id and give each snapshot a single time (its earliest product timestamp).

    (Grouping by timestamp instead would split one scrape into many fake "snapshots", because every product row
    is stamped a fraction of a second apart.)
    """
    if history.empty:
        return history
    t = history.groupby("snapshot_id").scraped_at.min().rename("scraped_at")
    out = (history.groupby(["snapshot_id", "source", "category"]).price.median().rename("median_price").reset_index())
    return out.merge(t, on="snapshot_id")[["snapshot_id", "scraped_at", "source", "category", "median_price"]]


def price_changes(history: pd.DataFrame) -> pd.DataFrame:
    """Product-level price movement between the two most recent snapshots (only products whose price changed).

    Products are matched across snapshots by (source, product_id), which is stable between scrapes.
    """
    ids = sorted(history.snapshot_id.unique())
    if len(ids) < 2:
        return pd.DataFrame()
    prev, last = (history[history.snapshot_id == i] for i in ids[-2:])
    m = last.merge(prev[["source", "product_id", "price"]], on=["source", "product_id"], suffixes=("", "_prev"))
    m["change"] = (m.price - m.price_prev).round(2)
    m["change_pct"] = ((m.price / m.price_prev - 1) * 100).round(2)
    return m[m.change != 0][["source", "name", "category", "price_prev", "price", "change", "change_pct"]]
