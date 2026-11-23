"""Cross-site product matching.

Pipeline (per unified category — products in different categories never match):
  1. brand agreement           (canonical brands, sub-brand aliases resolved: "Galaxy" -> Samsung)
  2. fuzzy name similarity     (RapidFuzz on brand-stripped names; token sort + token set blend)
  3. text similarity           (TF-IDF cosine over name + description)
  4. spec compatibility        (screen size / RAM / storage / CPU where both sides state them)
  5. optional one-to-one       (Hungarian assignment so one competitor SKU can't absorb every match)

Match tiers: Equivalent (same model) > Close Match (same family) > Comparable (same brand/class).
Price is deliberately NOT used for matching — otherwise the price gaps we report would be circular.

Role: the heart of the project. Given your store's catalogue and the competitor's, decide which products are the
"same" so their prices can be compared. Output is one row per matched pair with a 0-100 score, a tier and the
evidence behind it (so the UI can show how trustworthy each pair is).

Called by app.core.pipeline (cached per snapshot). Relies on app.core.normalize for name cleaning.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from rapidfuzz import fuzz, process
from scipy.optimize import linear_sum_assignment
from sklearn.feature_extraction.text import TfidfVectorizer

from app.core.normalize import clean_name, model_tokens

# Score weights (sum = 1). Name similarity is the strongest signal; brand is a big but coarse one; description text
# is noisy marketing copy so it counts least; specs are very reliable but often missing (see _score_pairs).
W_BRAND, W_NAME, W_TEXT, W_SPEC = 0.30, 0.35, 0.15, 0.20
EQUIVALENT_SORT_SIM = 0.92   # near-identical names (order-insensitive)
CLOSE_NAME_SIM = 0.70        # same product family, different variant

# Columns of the matches table (ids refer to product_id in the scraped data).
MATCH_COLUMNS = ["our_id", "comp_id", "score", "match_type", "brand_match",
                 "name_sim", "text_sim", "spec_sim", "shared_models"]


def _spec_similarity(a: pd.Series, b: pd.Series) -> float | None:
    """How compatible are two products' hardware specs, 0-1, or None if no spec is stated on both sides.

    Only specs present on BOTH products are compared: screen within 0.5" = full credit, within 1.5" = half;
    RAM and storage score as smaller/larger ratio (4GB vs 8GB = 0.5); CPU family must agree. Averaged.
    """
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
    """Dense score table for one category block. `text_sim` is len(ours) x len(comps).

    Scores every (our product, competitor product) pair in the block and labels it Equivalent / Close Match /
    Comparable. Brute force is fine here: blocks are small (hundreds of products), and pairs are only ever formed
    inside one category, which already removes most of the combinations.
    """
    a_clean = [clean_name(n, b) for n, b in zip(ours.name, ours.brand)]
    b_clean = [clean_name(n, b) for n, b in zip(comps.name, comps.brand)]
    # Two fuzzy measures averaged: token_sort ignores word order; token_set forgives extra words (subset names).
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
            # Specs are optional evidence: when absent, drop that term and renormalise the remaining weights.
            weights = {"brand": W_BRAND, "name": W_NAME, "text": W_TEXT}
            vals = {"brand": brand_match, "name": name_sim[i, j], "text": float(text_sim[i, j])}
            if spec is not None:
                weights["spec"], vals["spec"] = W_SPEC, spec
            score = sum(weights[k] * vals[k] for k in weights) / sum(weights.values())
            # With no spec evidence, don't let a missing signal inflate the score (small penalty vs verified specs).
            if spec is None:
                score *= 0.95
            shared = a_models[i] & b_models[j]   # model tokens appearing in both names
            spec_ok = spec is None or spec >= 0.5
            # Tiers: Equivalent = same brand + compatible specs + same model token (or near-identical name);
            # Close Match = same brand and similar name (same family, different variant); else Comparable.
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
    """Match `ours` against `comps`. Returns one row per matched pair (see MATCH_COLUMNS), best score first.

    min_score: discard pairs scoring below this (0-100). one_to_one: if True each product appears in at most one
    pair; if False every one of our products is paired with its single best competitor product (several of ours
    may then share the same competitor product).
    """
    if ours.empty or comps.empty:
        return pd.DataFrame(columns=MATCH_COLUMNS)
    # Colour/option variants listed as separate rows ("Iphone" x3, identical price) would otherwise be
    # paired with *different* competitor SKUs by the one-to-one step. Match one representative per listing.
    ours = ours.drop_duplicates(subset=["name", "price"]).reset_index(drop=True)
    comps = comps.drop_duplicates(subset=["name", "price"]).reset_index(drop=True)

    # Fit TF-IDF on BOTH catalogues together so word weights (rare words count more) reflect the whole market.
    corpus = pd.concat([ours, comps])
    texts = (corpus.name + " " + corpus.description.fillna("")).str.lower()
    tfidf = TfidfVectorizer(stop_words="english", sublinear_tf=True, ngram_range=(1, 2)).fit(texts)

    # Only categories both stores carry can produce matches; products in different categories never pair.
    blocks = []
    for cat in sorted(set(ours.category) & set(comps.category)):
        o = ours[ours.category == cat].reset_index(drop=True)
        c = comps[comps.category == cat].reset_index(drop=True)
        ta = tfidf.transform((o.name + " " + o.description.fillna("")).str.lower())
        tb = tfidf.transform((c.name + " " + c.description.fillna("")).str.lower())
        # TF-IDF vectors are unit length, so their dot product is the cosine similarity.
        blocks.append(_score_pairs(o, c, (ta @ tb.T).toarray()))
    if not blocks:
        return pd.DataFrame(columns=MATCH_COLUMNS)

    pairs = pd.concat(blocks, ignore_index=True)
    pairs = pairs[pairs.score >= min_score]
    if pairs.empty:
        return pairs.reset_index(drop=True)

    if one_to_one:
        # Hungarian algorithm: picks the set of pairs with the highest TOTAL score such that no product is used
        # twice. A plain "best match per product" would let one competitor SKU (e.g. a single Dell XPS) absorb
        # every one of our 20 Dell laptops, which would distort the price statistics.
        a_ids = {k: i for i, k in enumerate(sorted(pairs.our_id.unique()))}
        b_ids = {k: i for i, k in enumerate(sorted(pairs.comp_id.unique()))}
        cost = np.zeros((len(a_ids), len(b_ids)))   # score matrix; 0 = pair was below min_score (not allowed)
        for r in pairs.itertuples():
            cost[a_ids[r.our_id], b_ids[r.comp_id]] = r.score
        rows, cols = linear_sum_assignment(cost, maximize=True)
        keep = {(ra, cb) for ra, cb in zip(rows, cols) if cost[ra, cb] > 0}   # drop forced zero-score assignments
        inv_a, inv_b = {v: k for k, v in a_ids.items()}, {v: k for k, v in b_ids.items()}
        keep_ids = {(inv_a[ra], inv_b[cb]) for ra, cb in keep}
        pairs = pairs[[(a, b) in keep_ids for a, b in zip(pairs.our_id, pairs.comp_id)]]
    else:  # best competitor product for each of ours
        pairs = pairs.sort_values("score", ascending=False).drop_duplicates("our_id")

    return pairs.sort_values("score", ascending=False).reset_index(drop=True)
