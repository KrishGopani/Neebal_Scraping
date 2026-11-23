"""Scraper for the DummyJSON demo store (public JSON storefront API).

Role: the "Competitor" source by default. Unlike webscraper_io.py there is no HTML to parse - one request to the
public JSON endpoint returns the entire catalogue (~194 products across many categories), including brand,
discount, stock and availability. We only reshape those fields into the standard record via make_record().
"""
from __future__ import annotations

from .base import BaseScraper, ProgressCb

# limit=0 asks the API for all products in one response (no pagination needed).
PRODUCTS_URL = "https://dummyjson.com/products?limit=0"


class DummyJsonStore(BaseScraper):
    """Scraper for the DummyJSON demo store."""
    source_key = "dummyjson"
    source_name = "DummyJSON Store"
    base_url = "https://dummyjson.com"

    def scrape(self, progress: ProgressCb = None) -> list[dict]:
        """Download the catalogue and convert every item to a standard record."""
        if progress:
            progress(f"{self.source_name}: fetching catalogue", 0.2)
        items = self.get(PRODUCTS_URL).json().get("products", [])
        out = []
        for p in items:
            reviews = p.get("reviews") or []   # the API embeds individual reviews; we only keep how many there are
            out.append(self.make_record(
                product_id=p["id"],
                name=p["title"],
                brand=p.get("brand"),
                raw_category=p.get("category", "other"),
                price=p["price"],
                discount_pct=p.get("discountPercentage", 0),   # % off; make_record derives the post-discount price
                description=p.get("description", ""),
                image_url=p.get("thumbnail") or (p.get("images") or [""])[0],
                url=f"https://dummyjson.com/products/{p['id']}",
                rating=p.get("rating"),
                review_count=len(reviews),
                availability=p.get("availabilityStatus", "Unknown"),
                stock=p.get("stock"),
            ))
        if progress:
            progress(f"{self.source_name}: {len(out)} products", 1.0)
        return out
