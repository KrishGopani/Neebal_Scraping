import pandas as pd

from app.core import analytics as an
from app.core.matching import compute_matches
from app.core.normalize import brand_from_name, extract_specs, unify_category, resolve_brand


def test_brand_aliases():
    assert brand_from_name("Galaxy Tab 3") == "Samsung"
    assert brand_from_name("ThinkPad T540p") == "Lenovo"
    assert brand_from_name("Hewlett Packard 250") == "HP"
    assert resolve_brand("ASUS", "x") == "Asus"
    assert resolve_brand(None, "Iphone") == "Apple"


def test_specs_depend_on_category():
    assert extract_specs('15.6", Core i5, 8GB, 256GB', "Laptops") == {"screen_in": 15.6, "ram_gb": 8.0, "storage_gb": 256.0, "cpu": "Core I5"}
    assert extract_specs("7\" screen, 16GB", "Tablets")["storage_gb"] == 16.0
    assert extract_specs("7\" screen, 16GB", "Tablets")["ram_gb"] is None


def test_category_mapping():
    assert unify_category("mens-watches") == ("Watches", "Fashion")
    assert unify_category("computers/laptops")[0] == "Laptops"


def _frame(rows):
    base = dict(description="", rating=4.0, review_count=1, discount_pct=0.0, screen_in=None, ram_gb=None,
                storage_gb=None, cpu=None, image_url="", url="", availability="In Stock")
    return pd.DataFrame([{**base, **r} for r in rows])


def test_matching_respects_category_and_brand():
    ours = _frame([
        dict(product_id="1", name="Dell XPS 13", brand="Dell", category="Laptops", price=1000.0),
        dict(product_id="2", name="Acme Blender", brand="Acme", category="Home & Living", price=50.0),
    ])
    comps = _frame([
        dict(product_id="a", name="New DELL XPS 13 9300 Laptop", brand="Dell", category="Laptops", price=1200.0),
        dict(product_id="b", name="Acme Blender Pro", brand="Acme", category="Appliances", price=60.0),
    ])
    m = compute_matches(ours, comps, min_score=40)
    assert list(m.our_id) == ["1"]            # blender never matches: categories differ
    assert m.iloc[0].match_type == "Equivalent"


def test_pair_metrics_and_index():
    ours = _frame([dict(product_id="1", name="Dell XPS 13", brand="Dell", category="Laptops", price=900.0)])
    comps = _frame([dict(product_id="a", name="Dell XPS 13", brand="Dell", category="Laptops", price=1000.0)])
    pairs = an.build_pairs(compute_matches(ours, comps, 40), ours, comps)
    assert round(pairs.pct_diff.iloc[0], 1) == -10.0
    assert pairs.position.iloc[0] == "Cheaper"
    k = an.kpis(pairs)
    assert round(k["price_index"]) == 90 and an.price_verdict(k["price_index"])[0] == "Price leader"


def test_max_ratio_drops_implausible_pairs():
    ours = _frame([dict(product_id="1", name="Galaxy Tab", brand="Samsung", category="Tablets", price=100.0)])
    comps = _frame([dict(product_id="a", name="Samsung Galaxy Tab S8", brand="Samsung", category="Tablets", price=900.0)])
    m = compute_matches(ours, comps, 40)
    assert len(an.build_pairs(m, ours, comps, max_ratio=5)) == 0
    assert len(an.build_pairs(m, ours, comps, max_ratio=None)) == 1
