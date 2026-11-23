"""Normalisation helpers: brands, unified categories, spec extraction, name cleaning.

Role: two stores describe the same thing in different words ("Galaxy Tab" vs "Samsung Galaxy Tab S8", category
"computers/laptops" vs "laptops"). Before products can be compared, their messy raw fields are converted into one
shared vocabulary here. This is pure text processing - no network, no database, no pandas.

Used by: app.scrapers.base (cleans each record as it is scraped) and app.core.matching (name cleaning and model
tokens for similarity scoring).
"""
from __future__ import annotations

import re

# Canonical display form for brands whose .title() would be wrong (e.g. "hp".title() -> "Hp", but it is "HP").
_CANONICAL = {"hp": "HP", "lg": "LG", "msi": "MSI", "asus": "Asus", "ibm": "IBM", "oppo": "Oppo"}

# Sub-brands / product lines -> parent brand (matched on name tokens). Needed because a product name often shows only
# the line ("Galaxy Tab", "ThinkPad") and never the company, yet matching requires both sides to agree on the brand.
_ALIASES = {
    "galaxy": "Samsung", "iphone": "Apple", "ipad": "Apple", "macbook": "Apple", "imac": "Apple",
    "thinkpad": "Lenovo", "ideatab": "Lenovo", "ideapad": "Lenovo", "yoga": "Lenovo", "ideacentre": "Lenovo",
    "aspire": "Acer", "iconia": "Acer", "predator": "Acer", "travelmate": "Acer", "swift": "Acer",
    "hewlett": "HP", "probook": "HP", "pavilion": "HP", "elitebook": "HP", "envy": "HP", "spectre": "HP",
    "inspiron": "Dell", "xps": "Dell", "latitude": "Dell", "vostro": "Dell", "alienware": "Dell",
    "vivobook": "Asus", "zenbook": "Asus", "memo": "Asus", "transformer": "Asus",
    "packard": "Packard Bell", "xperia": "Sony", "vaio": "Sony", "optimus": "LG",
    "kindle": "Amazon", "ubuntu": "Canonical", "matebook": "Huawei", "surface": "Microsoft",
}
# Brand names we recognise directly when they appear as one of the first words of a product name.
_KNOWN = {
    "acer", "asus", "lenovo", "dell", "msi", "toshiba", "apple", "hp", "prestigio", "nokia", "amazon",
    "lg", "samsung", "sony", "huawei", "oppo", "realme", "vivo", "microsoft", "google", "xiaomi", "htc",
}

# raw category -> (unified category, department). Matching only compares products inside the same unified category,
# so e.g. both stores' laptops must land on "Laptops". Unlisted categories fall back to a prettified raw name.
_CATEGORY_MAP = {
    "laptops": ("Laptops", "Electronics"),
    "tablets": ("Tablets", "Electronics"),
    "smartphones": ("Smartphones", "Electronics"),
    "mobile-accessories": ("Mobile Accessories", "Electronics"),
    "mens-watches": ("Watches", "Fashion"), "womens-watches": ("Watches", "Fashion"),
    "mens-shirts": ("Apparel", "Fashion"), "tops": ("Apparel", "Fashion"), "womens-dresses": ("Apparel", "Fashion"),
    "mens-shoes": ("Footwear", "Fashion"), "womens-shoes": ("Footwear", "Fashion"),
    "womens-bags": ("Fashion Accessories", "Fashion"), "womens-jewellery": ("Fashion Accessories", "Fashion"),
    "sunglasses": ("Fashion Accessories", "Fashion"),
    "beauty": ("Beauty & Care", "Beauty & Care"), "fragrances": ("Beauty & Care", "Beauty & Care"),
    "skin-care": ("Beauty & Care", "Beauty & Care"),
    "groceries": ("Groceries", "Grocery"),
    "furniture": ("Home & Living", "Home"), "home-decoration": ("Home & Living", "Home"),
    "kitchen-accessories": ("Home & Living", "Home"),
    "sports-accessories": ("Sports", "Sports & Auto"),
    "motorcycle": ("Automotive", "Sports & Auto"), "vehicle": ("Automotive", "Sports & Auto"),
    # webscraper.io paths
    "computers/laptops": ("Laptops", "Electronics"),
    "computers/tablets": ("Tablets", "Electronics"),
    "phones/touch": ("Smartphones", "Electronics"),
}


def canonical_brand(brand: str | None) -> str | None:
    """Tidy a brand string to one consistent spelling ("ASUS"/"asus" -> "Asus", "hp" -> "HP"); None if blank."""
    if not brand or not str(brand).strip():
        return None
    b = str(brand).strip()
    return _CANONICAL.get(b.lower(), b.title() if b.islower() or b.isupper() else b)


def brand_from_name(name: str) -> str:
    """Guess the brand from a product name: look at the first 3 words for a known brand or a sub-brand alias.

    Falls back to the first word (usually the brand anyway), or "Unknown" for an empty name.
    """
    tokens = re.findall(r"[A-Za-z0-9]+", name.lower())
    for t in tokens[:3]:
        if t in _KNOWN:
            return canonical_brand(t) or "Unknown"
        if t in _ALIASES:
            return _ALIASES[t]
    return canonical_brand(tokens[0]) if tokens else "Unknown"


def resolve_brand(brand: str | None, name: str) -> str:
    """Final brand for a product: the site-provided brand if any (alias-resolved), else inferred from the name."""
    b = canonical_brand(brand)
    if b:
        low = b.lower()
        return _ALIASES.get(low, b)
    return brand_from_name(name)


def unify_category(raw: str) -> tuple[str, str]:
    """Map a store's raw category to (unified category, broader department).

    Example: "mens-watches" -> ("Watches", "Fashion").
    """
    return _CATEGORY_MAP.get(raw, (raw.replace("-", " ").replace("/", " ").title(), "Other"))


# --- spec extraction -------------------------------------------------------
# Regexes for pulling hardware specs out of free text. Each requires a unit marker so bare numbers are not misread.
_SCREEN = re.compile(r"(\d{1,2}(?:\.\d{1,2})?)\s*-?\s*(?:\"|''|”|inch(?:es)?\b)", re.I)
_GB = re.compile(r"(\d+(?:\.\d+)?)\s*(GB|TB)\b", re.I)
_CPU = re.compile(
    r"(core\s*i[3579]|celeron|pentium|atom|ryzen\s*[3579]|amd\s*(?:e\d|a\d+|fx)|athlon|snapdragon|apple\s*m\d|"
    r"core\s*m|xeon|exynos|a\d{2}\s*bionic)", re.I)


def extract_specs(text: str, category: str | None = None) -> dict:
    """Best-effort spec parsing from free-text descriptions. Missing -> None.

    A lone "8GB" is RAM on a laptop but storage on a tablet/phone, hence the category hint.
    Returns {"screen_in", "ram_gb", "storage_gb", "cpu"}; these feed the spec-compatibility part of matching.
    """
    text = text or ""
    screen = None
    m = _SCREEN.search(text)
    # Sanity range: ignore numbers that cannot be a device screen (e.g. "21 inch" monitors or stray digits).
    if m and 3 <= float(m.group(1)) <= 20:
        screen = float(m.group(1))

    # Collect every GB/TB figure (TB converted to GB). With two or more, the smallest is RAM and the largest is
    # storage ("4GB, 500GB"); with exactly one it depends on the device type (see docstring).
    sizes = sorted({float(v) * (1000 if u.upper() == "TB" else 1) for v, u in _GB.findall(text)})
    ram = storage = None
    if len(sizes) >= 2:
        if sizes[0] <= 32:
            ram = sizes[0]
        storage = sizes[-1]
    elif len(sizes) == 1:
        v = sizes[0]
        if category == "Laptops" and v <= 32:
            ram = v
        else:
            storage = v
    cpu_m = _CPU.search(text)
    cpu = re.sub(r"\s+", " ", cpu_m.group(1)).title() if cpu_m else None
    return {"screen_in": screen, "ram_gb": ram, "storage_gb": storage, "cpu": cpu}


# --- name cleaning ---------------------------------------------------------
def clean_name(name: str, brand: str | None = None) -> str:
    """Lower-case a name, drop punctuation and (if given) the brand words, leaving just the model description.

    Removing the brand matters: otherwise "Dell" in both names would inflate the fuzzy-similarity score even
    for different models. Brand agreement is scored separately in matching.
    """
    s = re.sub(r"[^a-z0-9 ]+", " ", (name or "").lower())
    if brand:
        for part in brand.lower().split():
            s = re.sub(rf"\b{re.escape(part)}\b", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def model_tokens(cleaned: str) -> set[str]:
    """Distinctive model identifiers: tokens mixing letters+digits, or numbers >= 2 digits.

    Examples: "x441na", "5s", "13", "9300". A shared model token (same brand) is the strongest sign that two
    listings are the very same model, which is how "Equivalent" matches are recognised.
    """
    out = set()
    for t in cleaned.split():
        if re.search(r"\d", t) and (re.search(r"[a-z]", t) or len(t) >= 2):
            out.add(t)
    return out
