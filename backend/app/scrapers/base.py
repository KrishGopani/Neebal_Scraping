"""Shared scraper infrastructure: polite HTTP session, robots.txt check, record builder."""
from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Callable, Optional
from urllib import robotparser
from urllib.parse import urlparse

import requests

from app import config
from app.core.normalize import extract_specs, resolve_brand, unify_category

ProgressCb = Optional[Callable[[str, float], None]]


class BaseScraper:
    source_key: str = ""
    source_name: str = ""
    base_url: str = ""

    def __init__(self) -> None:
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": config.USER_AGENT, "Accept": "*/*"})
        self._robots: dict[str, robotparser.RobotFileParser] = {}
        self._last_request = 0.0

    # -- HTTP ------------------------------------------------------------
    def allowed(self, url: str) -> bool:
        host = "{0.scheme}://{0.netloc}".format(urlparse(url))
        if host not in self._robots:
            rp = robotparser.RobotFileParser()
            try:
                r = self.session.get(f"{host}/robots.txt", timeout=config.REQUEST_TIMEOUT_S)
                rp.parse(r.text.splitlines() if r.status_code == 200 else [])
            except requests.RequestException:
                rp.parse([])
            self._robots[host] = rp
        return self._robots[host].can_fetch(config.USER_AGENT, url)

    def get(self, url: str, **kwargs) -> requests.Response:
        if not self.allowed(url):
            raise PermissionError(f"robots.txt disallows fetching {url}")
        last_exc: Exception | None = None
        for attempt in range(config.MAX_RETRIES):
            wait = config.REQUEST_DELAY_S - (time.time() - self._last_request)
            if wait > 0:
                time.sleep(wait)
            try:
                self._last_request = time.time()
                r = self.session.get(url, timeout=config.REQUEST_TIMEOUT_S, **kwargs)
                if r.status_code == 429 or r.status_code >= 500:
                    raise requests.HTTPError(f"HTTP {r.status_code}")
                r.raise_for_status()
                return r
            except (requests.RequestException, requests.HTTPError) as exc:
                last_exc = exc
                time.sleep(1.5 * (attempt + 1))
        raise RuntimeError(f"Failed to fetch {url}: {last_exc}")

    # -- Records ---------------------------------------------------------
    def make_record(self, *, product_id: str, name: str, raw_category: str, price: float,
                    description: str = "", image_url: str = "", url: str = "", brand: str | None = None,
                    discount_pct: float = 0.0, rating: float | None = None, review_count: int | None = None,
                    availability: str = "Unknown", stock: int | None = None, currency: str = "USD") -> dict:
        category, department = unify_category(raw_category)
        discount_pct = float(discount_pct or 0.0)
        rec = {
            "source": self.source_key,
            "product_id": str(product_id),
            "name": " ".join(name.split()),
            "brand": resolve_brand(brand, name),
            "category": category,
            "department": department,
            "raw_category": raw_category,
            "price": round(float(price), 2),
            "discount_pct": round(discount_pct, 2),
            "effective_price": round(float(price) * (1 - discount_pct / 100), 2),
            "currency": currency,
            "description": " ".join((description or "").split()),
            "image_url": image_url,
            "url": url,
            "rating": rating,
            "review_count": review_count,
            "availability": availability,
            "stock": stock,
            "scraped_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
        rec.update(extract_specs(f"{name}. {description}", category))
        return rec

    def scrape(self, progress: ProgressCb = None) -> list[dict]:  # pragma: no cover - interface
        raise NotImplementedError
