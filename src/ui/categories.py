"""Tab 4 — category & brand analysis over the ENTIRE catalogue (not just matched pairs)."""
from __future__ import annotations

import plotly.graph_objects as go
import streamlit as st

from src import analytics as an
from . import common as c


def render(ctx: c.Ctx) -> None:
    cats = ctx.cats
    both = cats[cats.coverage == "Both"]
    st.caption("Category figures use **every product** each store lists (medians are robust to outliers), "
               "so they stay meaningful even where few exact matches exist.")

    m1, m2, m3 = st.columns([1, 1, 2])
    metric = m1.radio("Price statistic", ["Median", "Average"], horizontal=True)
    log = m2.toggle("Log price axis", value=False, help="Useful when categories span $4 groceries to $20k vehicles.")
    show_all = m3.toggle("Include categories only one store sells", value=False)
    d = (cats if show_all else both)
    col = "median" if metric == "Median" else "avg"
    d = d[d[f"our_{col}"].notna() | d[f"comp_{col}"].notna()].sort_values(f"comp_{col}", na_position="first")

    fig = go.Figure()
    for _, r in d.iterrows():
        if r[f"our_{col}"] == r[f"our_{col}"] and r[f"comp_{col}"] == r[f"comp_{col}"]:
            fig.add_trace(go.Scatter(x=[r[f"our_{col}"], r[f"comp_{col}"]], y=[r.category] * 2, mode="lines",
                                     line=dict(color="#CBD5E1", width=4), showlegend=False, hoverinfo="skip"))
    fig.add_trace(go.Scatter(x=d[f"our_{col}"], y=d.category, mode="markers", name=ctx.our_name,
                             marker=dict(color=c.OURS, size=14), customdata=d.our_n,
                             hovertemplate="%{y}<br>" + ctx.our_name + ": $%{x:,.2f} (%{customdata:.0f} products)<extra></extra>"))
    fig.add_trace(go.Scatter(x=d[f"comp_{col}"], y=d.category, mode="markers", name=ctx.comp_name,
                             marker=dict(color=c.COMP, size=14, symbol="diamond"), customdata=d.comp_n,
                             hovertemplate="%{y}<br>" + ctx.comp_name + ": $%{x:,.2f} (%{customdata:.0f} products)<extra></extra>"))
    fig.update_layout(title=f"{metric} price by category", xaxis=dict(title="Price ($)"), yaxis=dict(automargin=True))
    if log and len(d):
        c.log_axis(fig, min(d[[f"our_{col}", f"comp_{col}"]].min()), max(d[[f"our_{col}", f"comp_{col}"]].max()), axis="x")
    c.show(fig, max(300, 52 * len(d) + 100))

    left, right = st.columns([1, 1])
    with left:
        if len(both):
            g = both.sort_values("median_gap_pct")
            fig = go.Figure(go.Bar(x=g.median_gap_pct, y=g.category, orientation="h",
                                   marker_color=[c.GOOD if v < 0 else c.BAD for v in g.median_gap_pct],
                                   text=[f"{v:+.0f}%" for v in g.median_gap_pct], textposition="outside",
                                   name="All products (median)"))
            mm = g.dropna(subset=["matched_avg_pct_diff"])
            if len(mm):
                fig.add_trace(go.Scatter(x=mm.matched_avg_pct_diff, y=mm.category, mode="markers", name="Matched pairs (avg)",
                                         marker=dict(symbol="diamond", size=12, color="#0F172A")))
            fig.update_layout(title="Price gap by category", xaxis_title="← you're cheaper | you're pricier →")
            c.pad_range(fig, list(g.median_gap_pct) + list(mm.matched_avg_pct_diff))
            c.show(fig, 340)
    with right:
        bc = an.brand_category_matrix(ctx.ours, ctx.comps)
        if len(bc):
            bc = bc.assign(row=bc.brand + " · " + bc.category).sort_values("gap_pct")
            lim = max(abs(bc.gap_pct).max(), 10)
            fig = go.Figure(go.Bar(
                x=bc.gap_pct, y=bc.row, orientation="h", marker=dict(color=bc.gap_pct, colorscale="RdYlGn_r", cmin=-lim, cmax=lim),
                text=[f"{v:+.0f}%" for v in bc.gap_pct], textposition="outside",
                customdata=bc[["our_n", "comp_n", "our_median", "comp_median"]],
                hovertemplate="%{y}<br>gap %{x:+.1f}%<br>you: %{customdata[0]} items, median $%{customdata[2]:,.0f}"
                              "<br>competitor: %{customdata[1]} items, median $%{customdata[3]:,.0f}<extra></extra>"))
            fig.update_layout(title="Same brand, same category — median price gap", xaxis_title="← cheaper | pricier →")
            c.pad_range(fig, bc.gap_pct)
            c.show(fig, 340, legend=False)
        else:
            st.info("No brand is sold by both stores in a shared category.")

    st.markdown("#### Category detail")
    t = cats[["category", "coverage", "our_n", "comp_n", "our_median", "comp_median", "median_gap_pct",
              "our_avg", "comp_avg", "avg_gap_pct", "our_rating", "comp_rating", "matched_n", "matched_avg_pct_diff"]]
    st.dataframe(t, hide_index=True, width="stretch", column_config={
        "category": "Category", "coverage": "Coverage", "our_n": "Your #", "comp_n": "Competitor #",
        "our_median": st.column_config.NumberColumn("Your median", format="$%.2f"),
        "comp_median": st.column_config.NumberColumn("Comp. median", format="$%.2f"),
        "median_gap_pct": st.column_config.NumberColumn("Median gap", format="%+.1f%%"),
        "our_avg": st.column_config.NumberColumn("Your avg", format="$%.2f"),
        "comp_avg": st.column_config.NumberColumn("Comp. avg", format="$%.2f"),
        "avg_gap_pct": st.column_config.NumberColumn("Avg gap", format="%+.1f%%"),
        "our_rating": st.column_config.NumberColumn("Your ★", format="%.2f"),
        "comp_rating": st.column_config.NumberColumn("Comp. ★", format="%.2f"),
        "matched_n": "Matched pairs",
        "matched_avg_pct_diff": st.column_config.NumberColumn("Matched avg gap", format="%+.1f%%"),
    })

    st.markdown("#### Brand detail")
    b1 = ctx.ours.groupby("brand").agg(our_n=("price", "size"), our_median=("price", "median"), our_rating=("rating", "mean"))
    b2 = ctx.comps.groupby("brand").agg(comp_n=("price", "size"), comp_median=("price", "median"), comp_rating=("rating", "mean"))
    bt = b1.join(b2, how="outer").reset_index()
    bt["gap"] = (bt.our_median / bt.comp_median - 1) * 100
    st.dataframe(bt.sort_values("our_n", ascending=False), hide_index=True, width="stretch", column_config={
        "brand": "Brand", "our_n": "Your #", "comp_n": "Competitor #",
        "our_median": st.column_config.NumberColumn("Your median", format="$%.2f"),
        "comp_median": st.column_config.NumberColumn("Comp. median", format="$%.2f"),
        "our_rating": st.column_config.NumberColumn("Your ★", format="%.2f"),
        "comp_rating": st.column_config.NumberColumn("Comp. ★", format="%.2f"),
        "gap": st.column_config.NumberColumn("Median gap", format="%+.1f%%", help="Across all products of the brand, any category — mixes product classes; prefer the same-brand/same-category chart above.")})
