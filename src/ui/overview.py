"""Tab 1 — executive overview."""
from __future__ import annotations

import plotly.graph_objects as go
import streamlit as st

from src import analytics as an
from . import common as c


def render(ctx: c.Ctx) -> None:
    k = ctx.k
    if not k["n"]:
        c.no_pairs_notice()
    else:
        verdict, tone = an.price_verdict(k["price_index"])
        cols = st.columns(5)
        cards = [
            ("Price index", f"{k['price_index']:.0f}", f"{verdict} · 100 = parity", {"good": "good", "warn": "warn", "bad": "bad"}.get(tone, "")),
            ("Win rate", f"{k['win_rate']:.0f}%", f"{k['n_cheaper'] + k['n_par']} of {k['n']} at/below competitor", "good" if k["win_rate"] >= 60 else "warn"),
            ("Avg price gap", c.pct(k["avg_pct_diff"]), f"median {c.pct(k['median_pct_diff'])}", "good" if k["avg_pct_diff"] < -2 else "bad" if k["avg_pct_diff"] > 2 else ""),
            ("Matched products", f"{k['n']}", f"{k['n_equivalent']} exact-model", ""),
            ("Catalogue size", f"{len(ctx.ours)} vs {len(ctx.comps)}", f"{ctx.our_name} vs {ctx.comp_name}", ""),
        ]
        for col, (l, v, s, t) in zip(cols, cards):
            col.markdown(c.kpi(l, v, s, t), unsafe_allow_html=True)
        st.write("")

        g1, g2, g3 = st.columns([1.05, 1, 1.35])
        with g1:
            color = {"good": c.GOOD, "neutral": c.NEUTRAL, "warn": "#D97706", "bad": c.BAD}[tone]
            fig = go.Figure(go.Indicator(
                mode="gauge+number", value=k["price_index"], number={"valueformat": ".0f", "font": {"size": 46}},
                title={"text": f"Price index — {verdict}", "font": {"size": 15}},
                gauge={"axis": {"range": [40, 160]}, "bar": {"color": color, "thickness": 0.28},
                       "steps": [{"range": [40, 95], "color": "#DCFCE7"}, {"range": [95, 105], "color": "#E2E8F0"},
                                 {"range": [105, 120], "color": "#FEF3C7"}, {"range": [120, 160], "color": "#FEE2E2"}],
                       "threshold": {"line": {"color": "#0F172A", "width": 3}, "value": 100}}))
            c.show(fig, 300, legend=False)
        with g2:
            fig = go.Figure(go.Pie(
                labels=list(an.PAR_LABELS), values=[k["n_cheaper"], k["n_par"], k["n_pricier"]], hole=0.62,
                marker=dict(colors=[c.GOOD, c.NEUTRAL, c.BAD]), sort=False, textinfo="value+percent",
                hovertemplate="%{label}: %{value} products<extra></extra>"))
            fig.update_layout(title=f"{ctx.our_name} vs {ctx.comp_name}",
                              annotations=[dict(text=f"<b>{k['n']}</b><br>pairs", showarrow=False, font_size=16)])
            c.show(fig, 300)
        with g3:
            both = ctx.cats[ctx.cats.coverage == "Both"].dropna(subset=["median_gap_pct"]).sort_values("median_gap_pct")
            if len(both):
                fig = go.Figure(go.Bar(
                    x=both.median_gap_pct, y=both.category, orientation="h",
                    marker_color=[c.GOOD if v < 0 else c.BAD for v in both.median_gap_pct],
                    text=[f"{v:+.0f}%" for v in both.median_gap_pct], textposition="outside",
                    hovertemplate="%{y}: %{x:+.1f}% median price gap<extra></extra>"))
                fig.update_layout(title="Median price gap by category (all products)",
                                  xaxis=dict(title="← cheaper than competitor | pricier →", zeroline=True))
                c.pad_range(fig, both.median_gap_pct)
                c.show(fig, 300, legend=False)

    st.markdown("### Business insights")
    left, right = st.columns(2)
    for i, item in enumerate(ctx.insights):
        with (left if i % 2 == 0 else right):
            c.insight_card(item)
