"""Tab 7 — market structure, assortment, competitor discounting and pricing trends over time."""
from __future__ import annotations

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

from src import analytics as an
from . import common as c


def render(ctx: c.Ctx) -> None:
    st.markdown("### Competitor pricing trends")
    hist = ctx.history
    n_snap = hist.snapshot_id.nunique() if len(hist) else 0
    if n_snap >= 2:
        tr = an.category_trend(hist)
        tr["store"] = tr.source.map({ctx.our_key: ctx.our_name, ctx.comp_key: ctx.comp_name})
        shared = set(ctx.ours.category) & set(ctx.comps.category)
        options = sorted(tr.category.unique(), key=lambda x: (x not in shared, x))   # categories both stores sell first
        cat = st.selectbox("Category", options, key="trend_cat")
        t = tr[tr.category == cat]
        fig = px.line(t, x="scraped_at", y="median_price", color="store", markers=True,
                      color_discrete_map={ctx.our_name: c.OURS, ctx.comp_name: c.COMP},
                      title=f"Median price over time — {cat}", labels={"scraped_at": "Scrape time", "median_price": "Median price ($)"})
        c.show(fig, 360)
        ch = an.price_changes(hist)
        st.markdown("**Price changes since the previous scrape**")
        if ch.empty:
            st.caption("No product changed price between the last two scrapes.")
        else:
            st.dataframe(ch.sort_values("change_pct", key=abs, ascending=False), hide_index=True, width="stretch",
                         column_config={"price_prev": st.column_config.NumberColumn("Before", format="$%.2f"),
                                        "price": st.column_config.NumberColumn("Now", format="$%.2f"),
                                        "change": st.column_config.NumberColumn("Δ $", format="$%+.2f"),
                                        "change_pct": st.column_config.NumberColumn("Δ %", format="%+.1f%%")})
    else:
        st.info(f"**{n_snap} scrape snapshot stored.** Each scrape is saved as an immutable snapshot, so trend lines and "
                "price-change alerts appear automatically once you've scraped at least twice (use *Run fresh scrape* in the sidebar, "
                "or schedule `python -m src.scrapers.runner` with cron). Until then, here is the current price landscape:")
        shared = sorted(set(ctx.ours.category) & set(ctx.comps.category))
        d = pd.concat([ctx.ours[ctx.ours.category.isin(shared)].assign(store=ctx.our_name),
                       ctx.comps[ctx.comps.category.isin(shared)].assign(store=ctx.comp_name)])
        if len(d):
            fig = px.box(d, x="category", y="price", color="store", points="all",
                         color_discrete_map={ctx.our_name: c.OURS, ctx.comp_name: c.COMP},
                         title="Price spread by category (current snapshot)", labels={"price": "Price ($, log)", "category": ""})
            fig.update_traces(marker=dict(size=4, opacity=0.5))
            c.log_axis(fig, d.price.min(), d.price.max(), axis="y")
            c.show(fig, 380)

    st.markdown("### Competitor discounting strategy")
    disc = ctx.comps[ctx.comps.discount_pct > 0]
    if disc.empty:
        st.caption(f"{ctx.comp_name} shows no listed discounts.")
    else:
        a, b = st.columns(2)
        with a:
            g = disc.groupby("category").discount_pct.agg(["mean", "max", "size"]).reset_index().sort_values("mean")
            fig = go.Figure(go.Bar(x=g["mean"], y=g.category, orientation="h", marker_color=c.COMP,
                                   text=[f"{v:.1f}%" for v in g["mean"]], textposition="auto",
                                   hovertemplate="%{y}<br>avg discount %{x:.1f}%<extra></extra>"))
            fig.update_layout(title="Average listed discount by category", xaxis_title="Discount (%)", yaxis=dict(automargin=True))
            c.show(fig, 360, legend=False)
        with b:
            fig = px.histogram(disc, x="discount_pct", nbins=12, color_discrete_sequence=[c.COMP],
                               title="Distribution of competitor discounts", labels={"discount_pct": "Discount (%)"})
            fig.update_layout(bargap=0.05, yaxis_title="Products")
            c.show(fig, 360, legend=False)
        if not ctx.effective:
            st.caption("💡 Headline prices are compared by default. Enable **post-discount prices** in the sidebar to see "
                       "the competitor's effective price after these discounts.")

    st.markdown("### Assortment & price-tier structure")
    a, b = st.columns(2)
    with a:
        cnt = pd.concat([ctx.ours.assign(store=ctx.our_name), ctx.comps.assign(store=ctx.comp_name)]).groupby(["category", "store"]).size().reset_index(name="products")
        order = cnt.groupby("category").products.sum().sort_values().index.tolist()
        fig = px.bar(cnt, y="category", x="products", color="store", orientation="h", barmode="group",
                     color_discrete_map={ctx.our_name: c.OURS, ctx.comp_name: c.COMP}, category_orders={"category": order},
                     title="Products listed per category", labels={"category": ""})
        c.show(fig, 440)
    with b:
        bands = pd.concat([ctx.ours.assign(store=ctx.our_name), ctx.comps.assign(store=ctx.comp_name)])
        bands["band"] = an.price_bands(bands)
        mix = bands.groupby(["store", "band"], observed=False).size().reset_index(name="n")
        mix["share"] = mix.n / mix.groupby("store").n.transform("sum") * 100
        fig = px.bar(mix, x="store", y="share", color="band", title="Price-tier mix (share of catalogue)",
                     color_discrete_sequence=px.colors.sequential.Blues[1:], labels={"share": "% of products", "store": ""})
        c.show(fig, 440)

    cats = ctx.cats
    only_c, only_o = cats[cats.coverage == "Only competitor"], cats[cats.coverage == "Only you"]
    g1, g2 = st.columns(2)
    g1.markdown(c.kpi("Competitor-only categories", str(len(only_c)), f"{int(only_c.comp_n.sum()) if len(only_c) else 0} products you don't sell",
                      "warn" if len(only_c) else ""), unsafe_allow_html=True)
    g2.markdown(c.kpi("Your exclusive categories", str(len(only_o)), ", ".join(only_o.category) or "none", "good" if len(only_o) else ""),
                unsafe_allow_html=True)

    if "stock" in ctx.comps and ctx.comps.stock.notna().any():
        low = ctx.comps[ctx.comps.stock.fillna(99) < 10]
        st.markdown("### Competitor stock pressure")
        st.caption(f"{len(low)} competitor products have fewer than 10 units in stock — a possible opening to win demand.")
        if len(low):
            st.dataframe(low[["name", "category", "price", "stock", "availability"]].sort_values("stock"), hide_index=True,
                         width="stretch", height=240, column_config={"price": st.column_config.NumberColumn(format="$%.2f")})
