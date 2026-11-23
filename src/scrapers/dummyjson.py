"""Scraper for the DummyJSON demo store (public JSON storefront API)."""
from __future__ import annotations

from .base import BaseScraper, ProgressCb

PRODUCTS_URL = "https://dummyjson.com/products?limit=0"


class DummyJsonStore(BaseScraper):
    source_key = "dummyjson"
    source_name = "DummyJSON Store"
    base_url = "https://dummyjson.com"

    def scrape(self, progress: ProgressCb = None) -> list[dict]:
        if progress:
            progress(f"{self.source_name}: fetching catalogue", 0.2)
        items = self.get(PRODUCTS_URL).json().get("products", [])
        out = []
        for p in items:
            reviews = p.get("reviews") or []
            out.append(self.make_record(
                product_id=p["id"],
                name=p["title"],
                brand=p.get("brand"),
                raw_category=p.get("category", "other"),
                price=p["price"],
                discount_pct=p.get("discountPercentage", 0),
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
