# PriceIQ — Competitor Price Intelligence & Product Comparison

Scrapes two e-commerce stores, matches equivalent products across them, and turns the price differences into
business insights — in a React dashboard backed by a FastAPI service.

| | |
|---|---|
| **Frontend** | React 19 · TypeScript · Vite · Tailwind CSS 4 · TanStack Query/Table · Apache ECharts |
| **Backend** | FastAPI · pandas · RapidFuzz · scikit-learn (TF-IDF) · SciPy (Hungarian matching) · SQLite |
| **Scraping** | `requests` + `lxml` (HTML store) and a JSON storefront API; robots.txt-aware, throttled, retried |

## Quick start

```bash
make install     # python venv + pip install, npm install
make scrape      # first scrape → backend/data/pricewatch.db   (or click "Run scrape" in the UI)

make api         # terminal 1 — FastAPI on :8000
make web         # terminal 2 — Vite on :5173 (proxies /api → :8000)   → open http://localhost:5173
```

**Single-process production mode:** `make build` then `make api` — FastAPI serves the built SPA at http://localhost:8000.
`make test` runs the backend tests and the frontend typecheck.

## Project layout

```
backend/
  app/
    main.py              FastAPI app factory + static SPA hosting
    api/routes.py        HTTP endpoints (param parsing / validation only)
    api/jobs.py          background scrape job (single-flight, pollable progress)
    core/
      pipeline.py        Params → JSON-safe analysis dict (no web-framework imports)
      matching.py        cross-site product matching
      analytics.py       KPIs, price index, category/brand gaps, recommendations, history
      insights.py        plain-language insights
      normalize.py       brands, unified categories, spec extraction
    scrapers/            BaseScraper + one adapter per store + runner (CLI: python -m app.scrapers.runner)
    storage.py           SQLite snapshots (one immutable snapshot per scrape → price history)
    config.py            sources, paths, scraper politeness
  tests/                 unit + API tests         requirements.txt
frontend/
  src/pages/             Overview · Matches · Pricing · Categories · Actions · Quality · Market · Data
  src/components/        Layout, SettingsPanel, DataTable, Chart (ECharts), Drawer, UI kit
  src/lib/               api types, react-query hooks, settings/theme state, chart helpers
Makefile                 install · scrape · api · web · build · test
```

## API

| Method & path | Purpose |
|---|---|
| `GET /api/meta` | stores, snapshots, categories, match types |
| `GET /api/analysis` | everything the dashboard needs for one settings combination |
| `GET /api/recommendations` | rule-based pricing actions (`thr`, `margin`, `step`) |
| `GET /api/catalog?store=ours\|competitor` | product catalogue |
| `POST /api/scrape` · `GET /api/scrape/status` | start / poll a scrape (one at a time) |

Shared query params: `ours`, `snapshot`, `min_score`, `types`, `one_to_one`, `max_ratio`, `effective`, `tol`, `scope`.
Interactive docs at `/docs`.

## How it works
- **Matching** (per unified category): brand agreement 30% · fuzzy name 35% · TF-IDF text 15% · spec compatibility 20%,
  then one-to-one assignment. Tiers *Equivalent / Close Match / Comparable* with High/Medium/Low confidence.
  Price is never a matching input.
- **Price index** = mean(your ÷ competitor) × 100 — 100 is parity; <95 leader; >120 well above market.
- **Recommendations** are decision support only: step-capped, rating-aware, and low-confidence matches go to manual review.
- Full methodology is in the app under *Data & Method*.

## Notes & limits
- The default stores are public **demo** storefronts (webscraper.io test site, DummyJSON): prices/ratings are synthetic and the
  catalogues overlap only partly, so matched samples are small. Add a `BaseScraper` subclass (use Playwright inside it for
  JS-rendered sites) and register it in `config.SOURCES` / `scrapers/runner.py` to benchmark real competitors — only where their terms allow.
- Trend charts need ≥ 2 snapshots; schedule `make scrape` (cron) to build history.
