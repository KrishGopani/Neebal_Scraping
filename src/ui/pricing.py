"""Tab 3 — price comparison on matched pairs."""
from __future__ import annotations

import numpy as np
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

from . import common as c


def render(ctx: c.Ctx) -> None:
    p = ctx.pairs
    if p.empty:
        c.no_pairs_notice()
        return

    left, right = st.columns([1.15, 1])
    with left:
        lo, hi = float(min(p.our_price.min(), p.comp_price.min())) * 0.8, float(max(p.our_price.max(), p.comp_price.max())) * 1.1
        fig = px.scatter(p, x="comp_price", y="our_price", color="position", color_discrete_map=c.POSITION_COLORS,
                         hover_name="label", hover_data={"comp_price": ":$.2f", "our_price": ":$.2f", "pct_diff": ":+.1f", "position": False},
                         labels={"comp_price": f"{ctx.comp_name} price ($)", "our_price": f"{ctx.our_name} price ($)"},
                         title="Price vs price — points below the line are cheaper at your store",
                         category_orders={"position": ["Cheaper", "At par", "Pricier"]})
        fig.add_trace(go.Scatter(x=[lo, hi], y=[lo, hi], mode="lines", line=dict(color="#94A3B8", dash="dash"),
                                 name="Parity", hoverinfo="skip"))
        fig.update_traces(marker=dict(size=12, line=dict(width=1, color="white")), selector=dict(mode="markers"))
        c.show(fig, 420)
    with right:
        fig = px.histogram(p, x="pct_diff", nbins=14, color="position", color_discrete_map=c.POSITION_COLORS,
                           labels={"pct_diff": "Price gap vs competitor (%)"}, title="Distribution of price gaps",
                           category_orders={"position": ["Cheaper", "At par", "Pricier"]})
        fig.add_vline(x=0, line_color="#0F172A", line_width=1)
        fig.add_vline(x=p.pct_diff.mean(), line_dash="dot", line_color=c.OURS)
        fig.add_annotation(x=p.pct_diff.mean(), y=0.97, yref="paper", xanchor="right", yanchor="top", showarrow=False,
                           text=f"mean {p.pct_diff.mean():+.1f}%  ", font=dict(color=c.OURS, size=12))
        fig.update_layout(bargap=0.05, yaxis_title="Products")
        c.show(fig, 420)

    st.markdown("#### Price ladder")
    sort = st.radio("Sort by", ["Largest gap %", "Your price", "Match score"], horizontal=True, label_visibility="collapsed")
    d = p.sort_values({"Largest gap %": "abs_pct_diff", "Your price": "our_price", "Match score": "score"}[sort])
    log = st.toggle("Log price axis", value=bool(p[["our_price", "comp_price"]].max().max() / p[["our_price", "comp_price"]].min().min() > 20))
    fig = go.Figure()
    for _, r in d.iterrows():
        fig.add_trace(go.Scatter(x=[r.comp_price, r.our_price], y=[r.label, r.label], mode="lines",
                                 line=dict(color=c.POSITION_COLORS[r.position], width=3), showlegend=False, hoverinfo="skip"))
    fig.add_trace(go.Scatter(x=d.our_price, y=d.label, mode="markers", name=ctx.our_name, marker=dict(color=c.OURS, size=11),
                             hovertemplate="%{y}<br>Your price: $%{x:,.2f}<extra></extra>"))
    fig.add_trace(go.Scatter(x=d.comp_price, y=d.label, mode="markers", name=ctx.comp_name, marker=dict(color=c.COMP, size=11, symbol="diamond"),
                             hovertemplate="%{y}<br>Competitor: $%{x:,.2f}<extra></extra>"))
    fig.update_layout(xaxis=dict(title="Price ($)"), yaxis=dict(automargin=True))
    if log:
        c.log_axis(fig, min(d.our_price.min(), d.comp_price.min()), max(d.our_price.max(), d.comp_price.max()), axis="x")
    c.show(fig, max(320, 34 * len(d) + 90))

    st.markdown("#### Who is cheaper, by category")
    g = (p.groupby("category").agg(pairs=("pct_diff", "size"), avg_gap=("pct_diff", "mean"),
                                   cheaper=("position", lambda s: (s == "Cheaper").sum()),
                                   pricier=("position", lambda s: (s == "Pricier").sum())).reset_index())
    g["verdict"] = np.where(g.avg_gap < -2, f"{ctx.our_name} cheaper", np.where(g.avg_gap > 2, f"{ctx.comp_name} cheaper", "At par"))
    st.dataframe(g, hide_index=True, width="stretch", column_config={
        "category": "Category", "pairs": "Matched pairs", "avg_gap": st.column_config.NumberColumn("Avg gap", format="%+.1f%%"),
        "cheaper": "You cheaper", "pricier": "You pricier", "verdict": "Better prices"})
