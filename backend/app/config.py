"""Central configuration for the Price Intelligence platform."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "pricewatch.db"

USER_AGENT = "PriceIntelBot/1.0 (educational price-comparison demo; polite crawler)"
REQUEST_DELAY_S = 0.25      # pause between requests to the same host
REQUEST_TIMEOUT_S = 20
MAX_RETRIES = 3

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
DEFAULT_OURS = "webscraper"

# Canonical product schema (column order used for storage and export).
COLUMNS = [
    "source", "product_id", "name", "brand", "category", "department", "raw_category",
    "price", "discount_pct", "effective_price", "currency",
    "description", "image_url", "url",
    "rating", "review_count", "availability", "stock",
    "screen_in", "ram_gb", "storage_gb", "cpu",
    "scraped_at",
]
