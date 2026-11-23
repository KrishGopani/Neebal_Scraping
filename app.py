"""Competitor Price Intelligence & Product Comparison Platform — Streamlit entry point.

Run:  streamlit run app.py
"""
from __future__ import annotations

import streamlit as st

from src import analytics as an
from src import config, insights, storage
from src.matching import compute_matches
from src.scrapers.runner import run_all
from src.ui import actions, categories, common as c, data_tab, market, matches, overview, pricing, quality

st.set_page_config(page_title="Price Intelligence", page_icon="📈", layout="wide", initial_sidebar_state="expanded")
c.inject_css()


# ----------------------------------------------------------------------------- cached data access
@st.cache_data(show_spinner=False)
def _snapshot(sid: int):
    return storage.load_snapshot(sid)


@st.cache_data(show_spinner=False)
def _history():
    return storage.load_history()


@st.cache_data(show_spinner="Matching products…")
def _matches(sid: int, ours_key: str, comp_key: str, min_score: float, one_to_one: bool):
    df = _snapshot(sid)
    return compute_matches(df[df.source == ours_key], df[df.source == comp_key], min_score, one_to_one)


def _scrape() -> None:
    with st.status("Scraping both stores…", expanded=True) as status:
        bar = st.progress(0.0)
        df, errors = run_all(progress=lambda msg, f: (bar.progress(min(f, 1.0)), st.write(msg)))
        if errors:
            status.update(label="Scrape failed — previous data kept", state="error")
            for e in errors:
                st.error(e)
            return
        status.update(label=f"Scraped {len(df)} products", state="complete")
    st.cache_data.clear()
    st.rerun()


# ----------------------------------------------------------------------------- empty state
snaps = storage.list_snapshots()
if snaps.empty:
    st.markdown('<div class="hero"><h1>Competitor Price Intelligence</h1><p>No data yet — run the first scrape to begin.</p></div>',
                unsafe_allow_html=True)
    if st.button("🔄 Run first scrape", type="primary"):
        _scrape()
    st.stop()

# ----------------------------------------------------------------------------- sidebar
with st.sidebar:
    st.markdown("## 📈 Price Intelligence")
    names = {k: v["name"] for k, v in config.SOURCES.items()}
    keys = list(names)
    our_key = st.selectbox("Your store", keys, index=keys.index(config.DEFAULT_OURS), format_func=names.get,
                           help="The store whose prices you want to benchmark. The other store is the competitor.")
    comp_key = next(k for k in keys if k != our_key)
    st.caption(f"Competitor: **{names[comp_key]}**")

    st.markdown("#### Matching")
    min_score = st.slider("Minimum match score", 40, 90, 55, 5, help="Higher = fewer, more reliable matches.")
    types = st.multiselect("Match types", ["Equivalent", "Close Match", "Comparable"],
                           default=["Equivalent", "Close Match", "Comparable"])
    one_to_one = st.checkbox("One-to-one matching", value=True,
                             help="Each competitor product can match at most one of yours.")
    max_ratio = st.slider("Max plausible price ratio", 2.0, 20.0, 5.0, 0.5,
                          help="Drop pairs whose prices differ by more than this multiple — likely different product classes.")

    st.markdown("#### Pricing")
    effective = st.toggle("Use post-discount prices", value=False,
                          help="Compare what shoppers actually pay after listed discounts, instead of headline list prices.")
    tol = st.slider("'At par' tolerance (±%)", 0.0, 10.0, 2.0, 0.5)

    st.markdown("#### Data")
    sid = st.selectbox("Snapshot", snaps.snapshot_id.tolist()[::-1], index=0,
                       format_func=lambda i: f"#{i} · {snaps.set_index('snapshot_id').scraped_at[i].replace('T', ' ')[:16]}")
    if st.button("🔄 Run fresh scrape", width="stretch"):
        _scrape()

# ----------------------------------------------------------------------------- pipeline
raw = _snapshot(sid)
scraped_at = snaps.set_index("snapshot_id").scraped_at[sid]
ours_all = an.apply_price_basis(raw[raw.source == our_key], effective)
comps_all = an.apply_price_basis(raw[raw.source == comp_key], effective)

all_cats = sorted(set(ours_all.category) | set(comps_all.category))
with st.sidebar:
    scope = st.multiselect("Category scope", all_cats, default=[], placeholder="All categories")
scope = scope or all_cats

m = _matches(sid, our_key, comp_key, float(min_score), one_to_one)
m = m[m.match_type.isin(types)]
pairs = an.build_pairs(m, ours_all, comps_all, tol, max_ratio)
ours, comps = ours_all[ours_all.category.isin(scope)], comps_all[comps_all.category.isin(scope)]
if not pairs.empty:
    pairs = pairs[pairs.category.isin(scope)].reset_index(drop=True)

cats = an.category_summary(ours, comps, pairs)
kp = an.kpis(pairs)
ctx = c.Ctx(ours=ours, comps=comps, pairs=pairs, cats=cats, k=kp, insights=[], our_name=names[our_key],
            comp_name=names[comp_key], tol=tol, effective=effective, snapshot_id=sid, scraped_at=scraped_at,
            history=_history(), snapshots=snaps, n_matches_total=len(m),
            our_key=our_key, comp_key=comp_key)
ctx.insights = insights.build_insights(ours, comps, pairs, cats, ctx.our_name, ctx.comp_name)

# ----------------------------------------------------------------------------- header + tabs
basis = "post-discount" if effective else "list"
st.markdown(
    f'<div class="hero"><h1>Competitor Price Intelligence</h1>'
    f'<p>{ctx.our_name} benchmarked against {ctx.comp_name}</p>'
    f'<span class="pill">{len(ours)} vs {len(comps)} products</span>'
    f'<span class="pill">{len(pairs)} matched pairs</span>'
    f'<span class="pill">{basis} prices</span>'
    f'<span class="pill">snapshot #{sid} · {scraped_at.replace("T", " ")[:16]} UTC</span></div>',
    unsafe_allow_html=True)

tabs = st.tabs(["📊 Overview", "🔗 Product Matches", "💰 Price Comparison", "🗂️ Categories & Brands",
                "🎯 Gaps & Actions", "⭐ Quality & Value", "📈 Market & Trends", "🧾 Data & Method"])
for tab, mod in zip(tabs, [overview, matches, pricing, categories, actions, quality, market, data_tab]):
    with tab:
        mod.render(ctx)
