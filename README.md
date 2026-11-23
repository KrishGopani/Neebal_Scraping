# Competitor Price Intelligence & Product Comparison Platform

A Streamlit app that scrapes two e-commerce stores, matches equivalent products across them, and turns the
price differences into business insights.

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m src.scrapers.runner      # optional: first scrape from the CLI (the app can also do it)
streamlit run app.py
```

## What it does

| Layer                   | Implementation                                                                                                                                                                                                                                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Scraping**      | `src/scrapers/` — adapter per store (`BaseScraper`): robots.txt check, throttling, retries, browser-style identification. *WebScraper Store* = paginated static HTML (`requests` + `lxml`); *DummyJSON Store* = public JSON storefront API. Each run is stored as a snapshot in SQLite (`data/pricewatch.db`). |
| **Normalisation** | `src/normalize.py` — canonical brands (Galaxy→Samsung, ThinkPad→Lenovo), unified category taxonomy, spec extraction (screen/RAM/storage/CPU).                                                                                                                                                                            |
| **Matching**      | `src/matching.py` — per-category scoring from brand, fuzzy name (RapidFuzz), TF-IDF text and spec compatibility; one-to-one assignment (Hungarian). Tiers: Equivalent / Close Match / Comparable, with High/Medium/Low confidence. Price is never a matching input.                                                        |
| **Analytics**     | `src/analytics.py`, `src/insights.py` — price index, win rate, category/brand gaps, per-product market benchmark, rule-based pricing actions, history.                                                                                                                                                                   |
| **Dashboard**     | `app.py`, `src/ui/` — 8 tabs: Overview · Product Matches · Price Comparison · Categories & Brands · Gaps & Actions · Quality & Value · Market & Trends · Data & Method.                                                                                                                                           |

Sidebar controls: swap which store is "yours", match strictness/types, one-to-one, max plausible price ratio,
list vs post-discount prices, "at par" tolerance, category scope, snapshot picker, and **Run fresh scrape**.

## Using it for real competitors

Add a `BaseScraper` subclass (use Playwright inside it for JS-rendered sites), register it in
`src/config.py::SOURCES` and `src/scrapers/runner.py::SCRAPERS`. Only scrape sites whose terms allow it.

## Price trends

Trend lines and price-change tables need ≥ 2 snapshots. Schedule `python -m src.scrapers.runner` (cron) to build history.

## Tests

`pytest -q`
