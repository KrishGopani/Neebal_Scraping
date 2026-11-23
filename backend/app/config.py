"""Central configuration for the Price Intelligence platform.

Role: one place for every constant the backend shares - file locations, scraper politeness settings, the list of
stores we scrape, and the canonical product columns. Nothing here runs code; other modules just import values.

Used by: app.storage (DB path, column order), app.scrapers.* (user-agent, delay, retries, sources),
app.api.routes (validating the `ours` store key) and app.core.pipeline (store names, default perspective).
To add a new store, register it in SOURCES below and in app/scrapers/runner.py.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent   # backend/
DATA_DIR = ROOT / "data"                        # holds the SQLite file (git-ignored; recreated by scraping)
DB_PATH = DATA_DIR / "pricewatch.db"

# Scraper politeness. The user-agent tells site owners who is crawling and why;
# the delay keeps us from hammering a host.
USER_AGENT = "PriceIntelBot/1.0 (educational price-comparison demo; polite crawler)"
REQUEST_DELAY_S = 0.25      # pause between requests to the same host
REQUEST_TIMEOUT_S = 20      # give up on a single request after this long
MAX_RETRIES = 3             # transient failures (timeouts, 429, 5xx) are retried with growing back-off

# Sources. `key` is stored in the DB; `name` is shown in the UI.
SOURCES = {
    "webscraper": {
        "name": "WebScraper Store",
        "base_url": "https://webscraper.io",
        "kind": "HTML (requests + lxml)",
    },
    "dummyjson": {
        "name": "DummyJSON Store",
        "base_url": "https://dummyjson.com",
        "kind": "JSON storefront API",
    },
}
DEFAULT_OURS = "webscraper"   # which source is treated as "your store"; the other one is the competitor

# Canonical product schema (column order used for storage and export). Every scraper must produce exactly these
# fields so stores with very different HTML/JSON shapes can be compared on equal terms.
COLUMNS = [
    "source", "product_id", "name", "brand", "category", "department", "raw_category",
    "price", "discount_pct", "effective_price", "currency",
    "description", "image_url", "url",
    "rating", "review_count", "availability", "stock",
    "screen_in", "ram_gb", "storage_gb", "cpu",
    "scraped_at",
]
