"""Tab 2 — matched products table with a side-by-side detail view."""
from __future__ import annotations

import pandas as pd
import streamlit as st

from . import common as c


def render(ctx: c.Ctx) -> None:
    p = ctx.pairs
    if p.empty:
        c.no_pairs_notice()
        return

    f1, f2, f3, f4 = st.columns([1.2, 1, 1, 1.6])
    pos = f1.multiselect("Price position", ["Cheaper", "At par", "Pricier"], default=["Cheaper", "At par", "Pricier"])
    conf = f2.multiselect("Confidence", c.CONF_ORDER, default=c.CONF_ORDER)
    cats = f3.multiselect("Category", sorted(p.category.unique()), default=[])
    q = f4.text_input("Search product", placeholder="e.g. Galaxy, MacBook…")
    v = p[p.position.isin(pos) & p.confidence.isin(conf)]
    if cats:
        v = v[v.category.isin(cats)]
    if q:
        v = v[v.label.str.contains(q, case=False, regex=False)]
    v = v.reset_index(drop=True)
    st.caption(f"{len(v)} of {len(p)} matched pairs · click a row for the side-by-side view")

    table = v[["our_image_url", "our_name", "comp_image_url", "comp_name", "category", "our_price", "comp_price",
               "pct_diff", "position", "match_type", "confidence", "score"]]
    cfg = {
        "our_image_url": st.column_config.ImageColumn("", width="small"),
        "our_name": st.column_config.TextColumn(ctx.our_name, width="medium"),
        "comp_image_url": st.column_config.ImageColumn("", width="small"),
        "comp_name": st.column_config.TextColumn(ctx.comp_name, width="medium"),
        "category": "Category",
        "our_price": st.column_config.NumberColumn("Your price", format="$%.2f"),
        "comp_price": st.column_config.NumberColumn("Competitor", format="$%.2f"),
        "pct_diff": st.column_config.NumberColumn("Gap %", format="%+.1f%%"),
        "position": "Position",
        "score": st.column_config.ProgressColumn("Match score", min_value=0, max_value=100, format="%.0f"),
        "match_type": "Match type", "confidence": "Confidence",
    }
    event = st.dataframe(table, column_config=cfg, hide_index=True, width="stretch", height=min(480, 60 + 38 * len(v)),
                         on_select="rerun", selection_mode="single-row", key="matches_table")
    st.download_button("⬇ Download matches (CSV)", v.drop(columns=["our_image_url", "comp_image_url"]).to_csv(index=False),
                       "product_matches.csv", "text/csv")

    sel = event.selection.rows
    st.markdown("### Side-by-side")
    if not sel:
        st.caption("Select a row above to compare the two products in detail.")
        return
    r = v.iloc[sel[0]]
    badge = {"Cheaper": c.GOOD, "At par": c.NEUTRAL, "Pricier": c.BAD}[r.position]
    a, mid, b = st.columns([1, 0.55, 1])
    for col, who, name, img, price, rating, reviews, desc, url, color in [
        (a, ctx.our_name, r.our_name, r.our_image_url, r.our_price, r.our_rating, r.our_review_count, r.our_description, r.our_url, c.OURS),
        (b, ctx.comp_name, r.comp_name, r.comp_image_url, r.comp_price, r.comp_rating, r.comp_review_count, r.comp_description, r.comp_url, c.COMP),
    ]:
        with col:
            st.markdown(f'<span class="legend-dot" style="background:{color}"></span><b>{who}</b>', unsafe_allow_html=True)
            st.image(img, width=150)
            st.markdown(f"#### {name}")
            st.markdown(f"**{c.money(price)}** · {c.stars(rating)} · {int(reviews) if pd.notna(reviews) else 0} reviews")
            st.caption(desc[:320] + ("…" if len(desc) > 320 else "") or "No description")
            st.link_button("Open product page", url)
    with mid:
        st.markdown(f'<div class="kpi" style="text-align:center"><div class="l">Price gap</div>'
                    f'<div class="v" style="color:{badge}">{r.pct_diff:+.1f}%</div>'
                    f'<div class="s">{c.money(abs(r["diff"]))} {"cheaper" if r["diff"] < 0 else "pricier" if r["diff"] > 0 else ""}</div></div>',
                    unsafe_allow_html=True)
        st.write("")
        st.markdown(f"**{r.match_type}** · confidence **{r.confidence}**")
        st.progress(min(int(r.score), 100), text=f"match score {r.score:.0f}/100")
    with st.expander("Why were these matched?"):
        spec = "n/a (specs not stated on both sides)" if pd.isna(r.spec_sim) else f"{r.spec_sim:.2f}"
        st.markdown(
            f"- **Brand agreement:** {'yes' if r.brand_match else 'no'}\n"
            f"- **Name similarity:** {r.name_sim:.2f}\n"
            f"- **Description (TF-IDF) similarity:** {r.text_sim:.2f}\n"
            f"- **Spec compatibility:** {spec}\n"
            f"- **Shared model tokens:** {r.shared_models or 'none'}")
