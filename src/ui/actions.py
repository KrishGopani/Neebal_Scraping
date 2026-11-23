"""Tab 5 — largest gaps, pricing recommendations, and market benchmark for unmatched products."""
from __future__ import annotations

import plotly.graph_objects as go
import streamlit as st

from src import analytics as an
from . import common as c


def _gap_bar(d, title, color, ctx):
    d = d.sort_values("pct_diff", ascending=color == c.GOOD)
    fig = go.Figure(go.Bar(
        x=d.pct_diff, y=d.our_name, orientation="h", marker_color=color,
        text=[f"{v:+.0f}%  (${abs(x):,.0f})" for v, x in zip(d.pct_diff, d["diff"])], textposition="auto",
        customdata=d[["comp_name", "our_price", "comp_price", "confidence"]],
        hovertemplate="<b>%{y}</b><br>vs %{customdata[0]}<br>You $%{customdata[1]:,.2f} · Competitor $%{customdata[2]:,.2f}"
                      "<br>Match confidence: %{customdata[3]}<extra></extra>"))
    fig.update_layout(title=title, xaxis_title="Gap vs competitor (%)", yaxis=dict(automargin=True))
    c.pad_range(fig, d.pct_diff, pad=0.05)
    c.show(fig, max(260, 46 * len(d) + 90), legend=False)


def render(ctx: c.Ctx) -> None:
    p = ctx.pairs
    st.markdown("### Largest price gaps (matched products)")
    if p.empty:
        c.no_pairs_notice()
    else:
        n = len(p) if len(p) <= 3 else st.slider("Products to show per side", 3, min(15, len(p)), min(5, len(p)))
        a, b = st.columns(2)
        with a:
            d = p[p.pct_diff > 0].nlargest(n, "pct_diff")
            if len(d):
                _gap_bar(d, "Where you're MOST expensive", c.BAD, ctx)
            else:
                st.success("You're not pricier than the competitor on any matched product.")
        with b:
            d = p[p.pct_diff < 0].nsmallest(n, "pct_diff")
            if len(d):
                _gap_bar(d, "Where you're MOST under-priced", c.GOOD, ctx)
            else:
                st.info("You're not cheaper than the competitor on any matched product.")

        st.markdown("### Recommended pricing actions")
        r1, r2, r3 = st.columns(3)
        thr = r1.slider("Act when gap exceeds (%)", 3, 30, 10)
        margin = r2.slider("Undercut competitor by (%) when raising", 0, 10, 3)
        step = r3.slider("Max price move per cycle (%)", 5, 40, 15)
        rec = an.recommendations(p, thr, margin, step)
        counts = rec.action.value_counts()
        k = st.columns(4)
        for col, (label, key, tone) in zip(k, [("Reduce price", "Reduce price", "bad"), ("Raise price", "Raise price", "good"),
                                               ("Hold (premium)", "Hold (premium justified)", ""), ("Manual review", "Manual review", "warn")]):
            col.markdown(c.kpi(label, str(int(counts.get(key, 0))), "products", tone), unsafe_allow_html=True)
        st.write("")
        st.dataframe(rec, hide_index=True, width="stretch", column_config={
            "our_name": "Your product", "comp_name": "Matched competitor product", "category": "Category",
            "match_type": "Match", "confidence": "Confidence",
            "our_price": st.column_config.NumberColumn("Your price", format="$%.2f"),
            "comp_price": st.column_config.NumberColumn("Competitor", format="$%.2f"),
            "pct_diff": st.column_config.NumberColumn("Gap", format="%+.1f%%"),
            "action": "Action", "suggested_price": st.column_config.NumberColumn("Suggested", format="$%.2f"),
            "price_change": st.column_config.NumberColumn("Change", format="$%+.2f"),
            "rationale": st.column_config.TextColumn("Rationale", width="large")})
        st.download_button("⬇ Download recommendations (CSV)", rec.to_csv(index=False), "pricing_recommendations.csv", "text/csv")
        st.caption("Decision support only: rules are price-gap + rating based and ignore cost, margin, and demand. "
                   "Low-confidence matches are flagged for manual review rather than repriced.")

    st.markdown("### Market benchmark — every product, matched or not")
    st.caption("Each of your products is positioned against the competitor's price distribution in the same category. "
               "Percentile = share of competitor products priced at or below yours.")
    bm = an.market_benchmark(ctx.ours, ctx.comps)
    if bm.empty:
        st.info("No shared categories to benchmark against.")
        return
    cat = st.selectbox("Category", ["All shared categories"] + sorted(bm.category.unique()))
    d = bm if cat.startswith("All") else bm[bm.category == cat]
    x, y = st.columns(2)
    with x:
        top = d.nlargest(10, "vs_cat_pct").sort_values("vs_cat_pct")
        fig = go.Figure(go.Bar(x=top.vs_cat_pct, y=top.name, orientation="h", marker_color=c.BAD,
                               text=[f"{v:+.0f}%" for v in top.vs_cat_pct], textposition="auto"))
        fig.update_layout(title="Priced highest vs competitor's category median", xaxis_title="% vs competitor median",
                          yaxis=dict(automargin=True))
        c.show(fig, 380, legend=False)
    with y:
        bot = d.nsmallest(10, "vs_cat_pct").sort_values("vs_cat_pct", ascending=False)
        fig = go.Figure(go.Bar(x=bot.vs_cat_pct, y=bot.name, orientation="h", marker_color=c.GOOD,
                               text=[f"{v:+.0f}%" for v in bot.vs_cat_pct], textposition="auto"))
        fig.update_layout(title="Priced lowest vs competitor's category median", xaxis_title="% vs competitor median",
                          yaxis=dict(automargin=True))
        c.show(fig, 380, legend=False)
    st.dataframe(d.sort_values("vs_cat_pct", ascending=False), hide_index=True, width="stretch", height=300, column_config={
        "product_id": None, "name": "Product", "brand": "Brand", "category": "Category",
        "price": st.column_config.NumberColumn("Your price", format="$%.2f"),
        "comp_n": "Comp. products in category",
        "comp_cat_median": st.column_config.NumberColumn("Comp. category median", format="$%.2f"),
        "vs_cat_pct": st.column_config.NumberColumn("vs category median", format="%+.1f%%"),
        "percentile": st.column_config.ProgressColumn("Price percentile", min_value=0, max_value=100, format="%.0f"),
        "comp_brand_median": st.column_config.NumberColumn("Comp. same-brand median", format="$%.2f"),
        "vs_brand_pct": st.column_config.NumberColumn("vs same brand", format="%+.1f%%"),
        "rating": st.column_config.NumberColumn("★", format="%.1f"), "review_count": "Reviews"})
