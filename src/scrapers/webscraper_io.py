"""Scraper for the webscraper.io e-commerce test site (static HTML, paginated).

The site is purpose-built for scraping practice and its robots.txt permits these paths.
Static server-rendered HTML => plain `requests` + `lxml` is faster and lighter than a headless
browser (Playwright) or a full crawler framework (Scrapy) would be for this workload.
"""
from __future__ import annotations

import re
from urllib.parse import urljoin

from lxml import html

from .base import BaseScraper, ProgressCb

CATEGORY_PATHS = ["computers/laptops", "computers/tablets", "phones/touch"]
LISTING = "https://webscraper.io/test-sites/e-commerce/static/{cat}?page={page}"
MAX_PAGES = 40  # safety cap


class WebScraperStore(BaseScraper):
    source_key = "webscraper"
    source_name = "WebScraper Store"
    base_url = "https://webscraper.io"

    def scrape(self, progress: ProgressCb = None) -> list[dict]:
        records: dict[str, dict] = {}
        for ci, cat in enumerate(CATEGORY_PATHS):
            page = 1
            while page <= MAX_PAGES:
                url = LISTING.format(cat=cat, page=page)
                tree = html.fromstring(self.get(url).text)
                cards = tree.xpath('//div[contains(@class,"product-wrapper")]')
                if not cards:
                    break
                new = 0
                for card in cards:
                    rec = self._parse_card(card, cat, url)
                    if rec and rec["product_id"] not in records:
                        records[rec["product_id"]] = rec
                        new += 1
                if new == 0:  # site repeats the last page past the end
                    break
                if progress:
                    progress(f"{self.source_name}: {cat} page {page}", (ci + min(page / 20, 1.0)) / len(CATEGORY_PATHS))
                page += 1
        return list(records.values())

    def _parse_card(self, card, raw_category: str, page_url: str) -> dict | None:
        link = card.xpath('.//a[contains(@class,"title")]')
        price = card.xpath('.//*[@itemprop="price"]/text()')
        if not link or not price:
            return None
        href = link[0].get("href", "")
        pid = re.search(r"/product/(\d+)", href)
        reviews = card.xpath('.//*[@itemprop="reviewCount"]/text()')
        rating_attr = card.xpath(".//p[@data-rating]/@data-rating")
        img = card.xpath(".//img/@src")
        return self.make_record(
            product_id=pid.group(1) if pid else href,
            name=link[0].get("title") or link[0].text_content(),
            raw_category=raw_category,
            price=float(re.sub(r"[^\d.]", "", price[0])),
            description=" ".join(card.xpath('.//p[contains(@class,"description")]//text()')),
            image_url=urljoin(page_url, img[0]) if img else "",
            url=urljoin(page_url, href),
            rating=float(rating_attr[0]) if rating_attr else None,
            review_count=int(reviews[0]) if reviews else 0,
            availability="In Stock",
        )
