"""Cross-site product matching.

Pipeline (per unified category — products in different categories never match):
  1. brand agreement           (canonical brands, sub-brand aliases resolved: "Galaxy" -> Samsung)
  2. fuzzy name similarity     (RapidFuzz on brand-stripped names; token sort + token set blend)
  3. text similarity           (TF-IDF cosine over name + description)
  4. spec compatibility        (screen size / RAM / storage / CPU where both sides state them)
  5. optional one-to-one       (Hungarian assignment so one competitor SKU can't absorb every match)

Match tiers: Equivalent (same model) > Close Match (same family) > Comparable (same brand/class).
Price is deliberately NOT used for matching — otherwise the price gaps we report would be circular.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from rapidfuzz import fuzz, process
from scipy.optimize import linear_sum_assignment
from sklearn.feature_extraction.text import TfidfVectorizer

from app.core.normalize import clean_name, model_tokens

W_BRAND, W_NAME, W_TEXT, W_SPEC = 0.30, 0.35, 0.15, 0.20
EQUIVALENT_SORT_SIM = 0.92   # near-identical names (order-insensitive)
CLOSE_NAME_SIM = 0.70        # same product family, different variant

MATCH_COLUMNS = ["our_id", "comp_id", "score", "match_type", "brand_match",
                 "name_sim", "text_sim", "spec_sim", "shared_models"]


def _spec_similarity(a: pd.Series, b: pd.Series) -> float | None:
    parts: list[float] = []
    if pd.notna(a.screen_in) and pd.notna(b.screen_in):
        d = abs(a.screen_in - b.screen_in)
        parts.append(1.0 if d <= 0.5 else 0.5 if d <= 1.5 else 0.0)
    for col in ("ram_gb", "storage_gb"):
        if pd.notna(a[col]) and pd.notna(b[col]):
            parts.append(min(a[col], b[col]) / max(a[col], b[col]))
    if a.cpu and b.cpu and isinstance(a.cpu, str) and isinstance(b.cpu, str):
        parts.append(1.0 if a.cpu.split()[0].lower() == b.cpu.split()[0].lower() else 0.0)
    return float(np.mean(parts)) if parts else None


def _score_pairs(ours: pd.DataFrame, comps: pd.DataFrame, text_sim: np.ndarray) -> pd.DataFrame:
    """Dense score table for one category block. `text_sim` is len(ours) x len(comps)."""
    a_clean = [clean_name(n, b) for n, b in zip(ours.name, ours.brand)]
    b_clean = [clean_name(n, b) for n, b in zip(comps.name, comps.brand)]
    sort_r = process.cdist(a_clean, b_clean, scorer=fuzz.token_sort_ratio) / 100.0
    set_r = process.cdist(a_clean, b_clean, scorer=fuzz.token_set_ratio) / 100.0
    name_sim = 0.5 * sort_r + 0.5 * set_r
    a_models = [model_tokens(c) for c in a_clean]
    b_models = [model_tokens(c) for c in b_clean]

    rows = []
    for i, (_, a) in enumerate(ours.iterrows()):
        for j, (_, b) in enumerate(comps.iterrows()):
            brand_match = float(a.brand == b.brand)
            spec = _spec_similarity(a, b)
            weights = {"brand": W_BRAND, "name": W_NAME, "text": W_TEXT}
            vals = {"brand": brand_match, "name": name_sim[i, j], "text": float(text_sim[i, j])}
            if spec is not None:
                weights["spec"], vals["spec"] = W_SPEC, spec
            score = sum(weights[k] * vals[k] for k in weights) / sum(weights.values())
            # With no spec evidence, don't let a missing signal inflate the score.
            if spec is None:
                score *= 0.95
            shared = a_models[i] & b_models[j]
            spec_ok = spec is None or spec >= 0.5
            if brand_match and spec_ok and (shared or sort_r[i, j] >= EQUIVALENT_SORT_SIM):
                match_type = "Equivalent"      # same model
            elif brand_match and name_sim[i, j] >= CLOSE_NAME_SIM:
                match_type = "Close Match"     # same family, different variant
            else:
                match_type = "Comparable"      # same brand/class, similar positioning
            rows.append((a.product_id, b.product_id, round(score * 100, 1), match_type, bool(brand_match),
                         round(name_sim[i, j], 3), round(float(text_sim[i, j]), 3),
                         None if spec is None else round(spec, 3), ", ".join(sorted(shared))))
    return pd.DataFrame(rows, columns=MATCH_COLUMNS)


def compute_matches(ours: pd.DataFrame, comps: pd.DataFrame, min_score: float = 55.0,
                    one_to_one: bool = True) -> pd.DataFrame:
    """Match `ours` against `comps`. Returns one row per matched pair (see MATCH_COLUMNS)."""
    if ours.empty or comps.empty:
        return pd.DataFrame(columns=MATCH_COLUMNS)
    # Colour/option variants listed as separate rows ("Iphone" x3, identical price) would otherwise be
    # paired with *different* competitor SKUs by the one-to-one step. Match one representative per listing.
    ours = ours.drop_duplicates(subset=["name", "price"]).reset_index(drop=True)
    comps = comps.drop_duplicates(subset=["name", "price"]).reset_index(drop=True)

    corpus = pd.concat([ours, comps])
    texts = (corpus.name + " " + corpus.description.fillna("")).str.lower()
    tfidf = TfidfVectorizer(stop_words="english", sublinear_tf=True, ngram_range=(1, 2)).fit(texts)

    blocks = []
    for cat in sorted(set(ours.category) & set(comps.category)):
        o = ours[ours.category == cat].reset_index(drop=True)
        c = comps[comps.category == cat].reset_index(drop=True)
        ta = tfidf.transform((o.name + " " + o.description.fillna("")).str.lower())
        tb = tfidf.transform((c.name + " " + c.description.fillna("")).str.lower())
        blocks.append(_score_pairs(o, c, (ta @ tb.T).toarray()))
    if not blocks:
        return pd.DataFrame(columns=MATCH_COLUMNS)

    pairs = pd.concat(blocks, ignore_index=True)
    pairs = pairs[pairs.score >= min_score]
    if pairs.empty:
        return pairs.reset_index(drop=True)

    if one_to_one:
        a_ids = {k: i for i, k in enumerate(sorted(pairs.our_id.unique()))}
        b_ids = {k: i for i, k in enumerate(sorted(pairs.comp_id.unique()))}
        cost = np.zeros((len(a_ids), len(b_ids)))
        for r in pairs.itertuples():
            cost[a_ids[r.our_id], b_ids[r.comp_id]] = r.score
        rows, cols = linear_sum_assignment(cost, maximize=True)
        keep = {(ra, cb) for ra, cb in zip(rows, cols) if cost[ra, cb] > 0}
        inv_a, inv_b = {v: k for k, v in a_ids.items()}, {v: k for k, v in b_ids.items()}
        keep_ids = {(inv_a[ra], inv_b[cb]) for ra, cb in keep}
        pairs = pairs[[(a, b) in keep_ids for a, b in zip(pairs.our_id, pairs.comp_id)]]
    else:  # best competitor product for each of ours
        pairs = pairs.sort_values("score", ascending=False).drop_duplicates("our_id")

    return pairs.sort_values("score", ascending=False).reset_index(drop=True)
