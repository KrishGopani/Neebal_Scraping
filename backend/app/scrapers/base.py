"""Shared scraper infrastructure: polite HTTP session, robots.txt check, record builder.

Role: everything that is the same no matter which store is being scraped. A concrete scraper (webscraper_io.py,
dummyjson.py) subclasses BaseScraper, implements scrape(), and calls self.get() to fetch pages and
self.make_record() to turn raw fields into the project's standard product dictionary (config.COLUMNS).

Why a base class: all the "good citizen" behaviour (identify ourselves, obey robots.txt, throttle, retry) and all
the normalisation (brand, category, specs, discount maths) lives in one place, so adding a store is ~30 lines.
Uses app.core.normalize for cleaning; run by app.scrapers.runner.
"""
from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Callable, Optional
from urllib import robotparser
from urllib.parse import urlparse

import requests

from app import config
from app.core.normalize import extract_specs, resolve_brand, unify_category

# Optional callback(message, fraction_done 0-1) so the UI can show scrape progress.
ProgressCb = Optional[Callable[[str, float], None]]


class BaseScraper:
    """Abstract scraper. Subclasses set the three identifiers below and implement scrape()."""
    # source_key is what gets stored in the DB `source` column and matches a key in config.SOURCES.
    source_key: str = ""
    source_name: str = ""
    base_url: str = ""

    def __init__(self) -> None:
        """One requests.Session per scraper (connection reuse) that always announces our custom User-Agent."""
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": config.USER_AGENT, "Accept": "*/*"})
        self._robots: dict[str, robotparser.RobotFileParser] = {}
        self._last_request = 0.0

    # -- HTTP ------------------------------------------------------------
    def allowed(self, url: str) -> bool:
        """Is this URL permitted by the site's robots.txt for our user-agent? (robots.txt is fetched once per host.)

        If robots.txt is missing or unreachable we parse it as empty, which means "everything allowed" - the
        standard convention when a site publishes no rules.
        """
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
        """Polite GET: robots.txt check, minimum delay between requests, retries with growing back-off.

        Raises PermissionError if robots.txt forbids the URL, RuntimeError after MAX_RETRIES failed attempts.
        Rate-limit (429) and server errors (5xx) are explicitly treated as failures because they are usually
        temporary; any other error (timeouts, connection problems, 4xx via raise_for_status) is caught by the same
        handler, so every kind of failure is retried up to MAX_RETRIES times before giving up.
        """
        if not self.allowed(url):
            raise PermissionError(f"robots.txt disallows fetching {url}")
        last_exc: Exception | None = None
        for attempt in range(config.MAX_RETRIES):
            # Throttle: ensure at least REQUEST_DELAY_S has passed since the previous request.
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
                time.sleep(1.5 * (attempt + 1))   # back-off: 1.5s, 3s, 4.5s ...
        raise RuntimeError(f"Failed to fetch {url}: {last_exc}")

    # -- Records ---------------------------------------------------------
    def make_record(self, *, product_id: str, name: str, raw_category: str, price: float,
                    description: str = "", image_url: str = "", url: str = "", brand: str | None = None,
                    discount_pct: float = 0.0, rating: float | None = None, review_count: int | None = None,
                    availability: str = "Unknown", stock: int | None = None, currency: str = "USD") -> dict:
        """Build one standardised product dict from the raw fields a scraper extracted.

        - brand: taken from the site if given, otherwise inferred from the product name.
        - category/department: the store's own category mapped onto our unified taxonomy
          (needed to match across stores).
        - effective_price: price after the listed discount, i.e. what a shopper really pays.
        - spec fields (screen, RAM, storage, CPU): parsed out of the free-text name/description.
        Keyword-only arguments make call sites self-describing.
        """
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
        """Fetch the whole catalogue and return a list of make_record() dicts. Implemented by each subclass."""
        raise NotImplementedError
