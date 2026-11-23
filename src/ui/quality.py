"""Tab 6 — quality & value: does the price premium (or discount) come with better ratings?"""
from __future__ import annotations

import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

from . import common as c


def render(ctx: c.Ctx) -> None:
    p = ctx.pairs.dropna(subset=["rating_diff"]) if not ctx.pairs.empty else ctx.pairs
    st.markdown("### Price vs. customer rating (matched products)")
    if p.empty:
        c.no_pairs_notice()
    else:
        p = p.assign(quadrant=np.select(
            [(p.pct_diff > 0) & (p.rating_diff < 0), (p.pct_diff <= 0) & (p.rating_diff >= 0),
             (p.pct_diff > 0) & (p.rating_diff >= 0)],
            ["At risk: pricier & lower-rated", "Strong value: cheaper & better-rated", "Premium: pricier & better-rated"],
            default="Under-priced: cheaper & lower-rated"))
        colors = {"At risk: pricier & lower-rated": c.BAD, "Strong value: cheaper & better-rated": c.GOOD,
                  "Premium: pricier & better-rated": c.OURS, "Under-priced: cheaper & lower-rated": "#D97706"}
        fig = px.scatter(p, x="pct_diff", y="rating_diff", color="quadrant", color_discrete_map=colors, hover_name="label",
                         hover_data={"pct_diff": ":+.1f", "rating_diff": ":+.2f", "quadrant": False},
                         labels={"pct_diff": "Price gap vs competitor (%)", "rating_diff": "Rating gap (★)"})
        fig.update_traces(marker=dict(size=13, line=dict(width=1, color="white")))
        fig.add_hline(y=0, line_color="#94A3B8"); fig.add_vline(x=0, line_color="#94A3B8")
        c.show(fig, 420)
        counts = p.quadrant.value_counts()
        cols = st.columns(4)
        for col, (name, tone) in zip(cols, [("At risk: pricier & lower-rated", "bad"), ("Premium: pricier & better-rated", ""),
                                            ("Strong value: cheaper & better-rated", "good"), ("Under-priced: cheaper & lower-rated", "warn")]):
            col.markdown(c.kpi(name.split(":")[0], str(int(counts.get(name, 0))), name.split(": ")[1], tone), unsafe_allow_html=True)

    st.markdown("### Catalogue-wide quality")
    shared = sorted(set(ctx.ours.category) & set(ctx.comps.category))
    if not shared:
        st.info("No shared categories.")
        return
    l, r = st.columns(2)
    with l:
        both = pd.concat([ctx.ours[ctx.ours.category.isin(shared)].assign(store=ctx.our_name),
                          ctx.comps[ctx.comps.category.isin(shared)].assign(store=ctx.comp_name)], ignore_index=True)
        fig = px.box(both, x="category", y="rating", color="store", points="all",
                     color_discrete_map={ctx.our_name: c.OURS, ctx.comp_name: c.COMP}, title="Rating distribution by category",
                     labels={"rating": "Rating (★)", "category": ""})
        fig.update_traces(marker=dict(size=4, opacity=0.5))
        c.show(fig, 380)
    with r:
        rv = both.groupby(["category", "store"]).review_count.mean().reset_index()
        fig = px.bar(rv, x="category", y="review_count", color="store", barmode="group",
                     color_discrete_map={ctx.our_name: c.OURS, ctx.comp_name: c.COMP},
                     title="Average reviews per product (social proof)", labels={"review_count": "Avg reviews", "category": ""})
        c.show(fig, 380)

    cat = st.selectbox("Value map category", shared)
    vm = both[both.category == cat]
    fig = px.scatter(vm, x="price", y="rating", color="store", hover_name="name", size_max=14,
                     color_discrete_map={ctx.our_name: c.OURS, ctx.comp_name: c.COMP},
                     title=f"Value map — {cat}: price vs rating", labels={"price": "Price ($)", "rating": "Rating (★)"})
    fig.update_traces(marker=dict(size=10, opacity=0.75, line=dict(width=1, color="white")))
    c.show(fig, 400)
    st.caption("Top-left = best value (low price, high rating). Compare where each store's products cluster.")
