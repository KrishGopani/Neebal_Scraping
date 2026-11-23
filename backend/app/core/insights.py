"""Turns analytics into plain-language business insights."""
from __future__ import annotations

import pandas as pd

from src import analytics as an


def build_insights(ours: pd.DataFrame, comps: pd.DataFrame, pairs: pd.DataFrame, cats: pd.DataFrame,
                   our_name: str, comp_name: str) -> list[dict]:
    """Each insight: {tone: good|warn|bad|info, title, body}."""
    out: list[dict] = []
    k = an.kpis(pairs)

    if k["n"]:
        verdict, tone = an.price_verdict(k["price_index"])
        direction = "above" if k["price_index"] > 100 else "below"
        out.append({"tone": {"good": "good", "neutral": "info", "warn": "warn", "bad": "bad"}[tone],
                    "title": f"{verdict}: price index {k['price_index']:.0f}",
                    "body": (f"Across {k['n']} matched products {our_name} is on average "
                             f"{abs(k['price_index'] - 100):.1f}% {direction} {comp_name} "
                             f"(median gap {k['median_pct_diff']:+.1f}%). "
                             f"{k['n_cheaper']} cheaper, {k['n_par']} at par, {k['n_pricier']} pricier.")})

        top = pairs.loc[pairs.abs_pct_diff.idxmax()]
        side = "more expensive" if top.pct_diff > 0 else "cheaper"
        out.append({"tone": "warn" if top.pct_diff > 0 else "info", "title": "Largest price gap",
                    "body": (f"**{top.our_name}** (${top.our_price:,.2f}) is {abs(top.pct_diff):.0f}% {side} than "
                             f"**{top.comp_name}** (${top.comp_price:,.2f}) — a ${abs(top['diff']):,.2f} difference. "
                             f"Match confidence {top.score:.0f}/100 ({top.match_type}).")})

        pricier = pairs[pairs.position == "Pricier"]
        if len(pricier):
            worse = int((pricier.rating_diff < 0).sum())
            if worse:
                out.append({"tone": "bad", "title": "Pricier *and* lower-rated",
                            "body": (f"In {worse} of {len(pricier)} products where you charge more, customers also rate "
                                     f"your version lower — the highest churn risk in the catalogue.")})

        by_cat = pairs.groupby("category").pct_diff.mean().sort_values()
        if len(by_cat) > 1:
            out.append({"tone": "info", "title": "Category contrast",
                        "body": (f"On matched items you are most competitive in **{by_cat.index[0]}** "
                                 f"({by_cat.iloc[0]:+.1f}% avg) and least in **{by_cat.index[-1]}** "
                                 f"({by_cat.iloc[-1]:+.1f}% avg).")})
        if k["n"] < 20:
            out.append({"tone": "info", "title": "Small matched sample",
                        "body": (f"Only {k['n']} pairs ({k['n_equivalent']} exact-model) — product-level conclusions are "
                                 f"directional. The *Market Position* analysis uses every product, not just matches.")})
    else:
        out.append({"tone": "warn", "title": "No product matches at current settings",
                    "body": "Lower the minimum match score or enable more match types in the sidebar."})

    both = cats[cats.coverage == "Both"].dropna(subset=["median_gap_pct"])
    if len(both):
        hi, lo = both.loc[both.median_gap_pct.idxmax()], both.loc[both.median_gap_pct.idxmin()]
        out.append({"tone": "info", "title": "Market-wide category pricing (all products)",
                    "body": (f"Median price gap vs competitor ranges from **{lo.median_gap_pct:+.0f}% in {lo.category}** "
                             f"to **{hi.median_gap_pct:+.0f}% in {hi.category}**.")})

    only_comp = cats[cats.coverage == "Only competitor"]
    only_us = cats[cats.coverage == "Only you"]
    if len(only_comp):
        n = int(only_comp.comp_n.sum())
        out.append({"tone": "warn", "title": "Assortment gaps",
                    "body": (f"{comp_name} sells {n} products in {len(only_comp)} categories you don't carry: "
                             f"{', '.join(only_comp.category.head(6))}"
                             f"{'…' if len(only_comp) > 6 else ''}.")})
    if len(only_us):
        out.append({"tone": "good", "title": "Your exclusive categories",
                    "body": f"You carry {', '.join(only_us.category)} which {comp_name} does not."})

    disc = comps[comps.discount_pct > 0]
    if len(disc):
        out.append({"tone": "info", "title": f"{comp_name} discounting",
                    "body": (f"{len(disc) / len(comps) * 100:.0f}% of competitor products carry a listed discount "
                             f"(avg {disc.discount_pct.mean():.1f}%, max {disc.discount_pct.max():.0f}%). "
                             f"Toggle *post-discount prices* in the sidebar to see the effective gap.")})
    return out
