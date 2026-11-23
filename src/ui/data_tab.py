"""Tab 8 — raw catalogue data, scrape history, and methodology."""
from __future__ import annotations

import streamlit as st

from . import common as c


def _catalogue(df, label: str, key: str) -> None:
    f1, f2 = st.columns([2, 1])
    q = f1.text_input("Search", key=f"q_{key}", placeholder="name, brand…")
    cats = f2.multiselect("Category", sorted(df.category.unique()), key=f"c_{key}")
    v = df
    if q:
        v = v[v.name.str.contains(q, case=False, regex=False) | v.brand.str.contains(q, case=False, regex=False)]
    if cats:
        v = v[v.category.isin(cats)]
    st.caption(f"{len(v)} of {len(df)} products")
    st.dataframe(v[["image_url", "name", "brand", "category", "price", "discount_pct", "effective_price", "rating",
                    "review_count", "availability", "screen_in", "ram_gb", "storage_gb", "cpu", "description", "url"]],
                 hide_index=True, width="stretch", height=440, column_config={
        "image_url": st.column_config.ImageColumn("", width="small"),
        "price": st.column_config.NumberColumn("List price", format="$%.2f"),
        "discount_pct": st.column_config.NumberColumn("Disc.", format="%.1f%%"),
        "effective_price": st.column_config.NumberColumn("Net price", format="$%.2f"),
        "rating": st.column_config.NumberColumn("★", format="%.1f"),
        "description": st.column_config.TextColumn("Description", width="large"),
        "url": st.column_config.LinkColumn("Link", display_text="open")})
    st.download_button(f"⬇ Download {label} catalogue (CSV)", v.to_csv(index=False), f"{key}_catalogue.csv", "text/csv", key=f"dl_{key}")


def render(ctx: c.Ctx) -> None:
    t1, t2, t3, t4 = st.tabs(["Your catalogue", "Competitor catalogue", "Scrape history", "Methodology"])
    with t1:
        _catalogue(ctx.ours, ctx.our_name, "ours")
    with t2:
        _catalogue(ctx.comps, ctx.comp_name, "competitor")
    with t3:
        st.dataframe(ctx.snapshots, hide_index=True, width="stretch",
                     column_config={"snapshot_id": "Snapshot", "scraped_at": "Scraped at (UTC)", "n_products": "Products"})
    with t4:
        st.markdown("""
**Data collection**
- *WebScraper Store* — server-rendered HTML scraped with `requests` + `lxml` (listing pages of laptops, tablets, phones; all pages followed). Static HTML makes a headless browser (Playwright) or crawler framework (Scrapy) unnecessary overhead here; the scraper layer is adapter-based, so a JS-heavy site can be added as another `BaseScraper` subclass using Playwright.
- *DummyJSON Store* — the storefront's public JSON API (194 products, 25+ categories, ratings, reviews, discounts, stock).
- Scrapers honour `robots.txt`, identify themselves, throttle requests, and retry with back-off. Each run is stored as a snapshot in SQLite.

**Normalisation** — brands canonicalised (sub-brands such as *Galaxy → Samsung*, *ThinkPad → Lenovo*); heterogeneous site categories mapped to a unified taxonomy; specs (screen, RAM, storage, CPU) parsed from free text.

**Product matching** — within the same unified category, each candidate pair is scored 0–100 from brand agreement (30%), fuzzy name similarity (35%), TF-IDF description similarity (15%) and spec compatibility (20%, when both sides state specs). A one-to-one assignment (Hungarian algorithm) stops one competitor product absorbing many matches. Price is *not* a matching input. Tiers: **Equivalent** (same model) · **Close Match** (same family) · **Comparable** (same brand/class). Confidence: High / Medium / Low.

**Metrics**
- *Gap %* = (your price − competitor price) ÷ competitor price.
- *Price index* = mean of (your price ÷ competitor price) × 100. 100 = parity; < 95 price leader; 95–105 at market; 105–120 premium; > 120 well above market.
- *Win rate* = share of matched pairs where you are cheaper or within the "at par" tolerance.
- *Max price ratio* drops pairs differing by more than N× — those are almost always different product classes, not pricing signals.

**Caveats** — both sources are public *demo* storefronts built for scraping practice: prices/ratings are synthetic and their catalogues overlap only partly, so matched samples are small. The pipeline is source-agnostic; point new scrapers at real competitors (with permission / within their terms) for production use.
""")
