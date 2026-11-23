"""Shared UI pieces: palette, CSS, KPI/insight cards, plotly styling, the Ctx passed to every tab."""
from __future__ import annotations

import re
from dataclasses import dataclass

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

OURS, COMP = "#2563EB", "#F59E0B"
GOOD, BAD, NEUTRAL = "#16A34A", "#DC2626", "#64748B"
POSITION_COLORS = {"Cheaper": GOOD, "At par": NEUTRAL, "Pricier": BAD}
CONF_ORDER = ["High", "Medium", "Low"]
TONES = {  # tone -> (background, accent)
    "good": ("#ECFDF5", "#16A34A"), "warn": ("#FFFBEB", "#D97706"), "bad": ("#FEF2F2", "#DC2626"),
    "info": ("#EFF6FF", "#2563EB"), "neutral": ("#F8FAFC", "#64748B"),
}

_CSS = """
<style>
.block-container {padding-top: 1.6rem; padding-bottom: 3rem; max-width: 1500px;}
h1, h2, h3 {letter-spacing: -0.01em;}
.hero {background: linear-gradient(120deg,#0F172A 0%,#1E3A8A 100%); color:#fff; border-radius:16px;
       padding:22px 28px; margin-bottom:18px;}
.hero h1 {color:#fff; margin:0; font-size:1.7rem;}
.hero p {color:#CBD5E1; margin:4px 0 0 0; font-size:0.95rem;}
.hero .pill {display:inline-block; background:rgba(255,255,255,.14); border-radius:999px; padding:2px 12px;
             font-size:.78rem; margin:8px 6px 0 0;}
.kpi {background:#fff; border:1px solid #E2E8F0; border-radius:14px; padding:14px 18px; height:100%;
      box-shadow:0 1px 2px rgba(15,23,42,.04);}
.kpi .l {font-size:.78rem; color:#64748B; text-transform:uppercase; letter-spacing:.05em; font-weight:600;}
.kpi .v {font-size:1.9rem; font-weight:700; color:#0F172A; line-height:1.25;}
.kpi .s {font-size:.82rem; color:#64748B;}
.kpi.good .v {color:#16A34A;} .kpi.bad .v {color:#DC2626;} .kpi.warn .v {color:#D97706;}
.insight {border-left:4px solid; border-radius:10px; padding:11px 16px; margin-bottom:10px; font-size:.92rem;}
.insight b.t {display:block; margin-bottom:2px; font-size:.95rem;}
.legend-dot {display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:6px;}
div[data-testid="stTabs"] button[role="tab"] {font-weight:600;}
</style>
"""


@dataclass
class Ctx:
    ours: pd.DataFrame
    comps: pd.DataFrame
    pairs: pd.DataFrame
    cats: pd.DataFrame
    k: dict
    insights: list[dict]
    our_name: str
    comp_name: str
    tol: float
    effective: bool
    snapshot_id: int
    scraped_at: str
    history: pd.DataFrame
    snapshots: pd.DataFrame
    n_matches_total: int
    our_key: str = ""
    comp_key: str = ""


def inject_css() -> None:
    st.markdown(_CSS, unsafe_allow_html=True)


def kpi(label: str, value: str, sub: str = "", tone: str = "") -> str:
    return f'<div class="kpi {tone}"><div class="l">{label}</div><div class="v">{value}</div><div class="s">{sub}</div></div>'


def _md_inline(text: str) -> str:
    """Minimal **bold** / *italic* -> HTML (the card is raw HTML, so Streamlit won't render markdown inside it)."""
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    return re.sub(r"\*(.+?)\*", r"<i>\1</i>", text)


def insight_card(item: dict) -> None:
    bg, accent = TONES.get(item["tone"], TONES["info"])
    st.markdown(
        f'<div class="insight" style="background:{bg};border-color:{accent}">'
        f'<b class="t" style="color:{accent}">{_md_inline(item["title"])}</b>{_md_inline(item["body"])}</div>',
        unsafe_allow_html=True)


def no_pairs_notice() -> None:
    st.info("No matched products at the current settings. Lower the **minimum match score**, enable more "
            "**match types**, or raise the **max price ratio** in the sidebar.")


def style(fig: go.Figure, height: int = 380, legend: bool = True) -> go.Figure:
    has_title = bool(fig.layout.title.text)
    top = 78 if (has_title and legend) else 48 if has_title else 24
    fig.update_layout(
        template="plotly_white", height=height, margin=dict(l=28, r=28, t=top, b=12),
        font=dict(family="Inter, -apple-system, Segoe UI, sans-serif", size=13, color="#0F172A"),
        showlegend=legend, legend=dict(orientation="h", yanchor="bottom", y=1.0, x=0, title_text=""),
        title=dict(font=dict(size=15), x=0, xanchor="left", y=0.98, yanchor="top"), hoverlabel=dict(font_size=12),
    )
    return fig


def log_axis(fig: go.Figure, lo: float, hi: float, axis: str = "y") -> None:
    """Log axis with a few readable ticks (plotly's default prints 2..9 between every decade)."""
    ticks = [t for t in (1, 3, 10, 30, 100, 300, 1000, 3000, 10_000, 30_000) if lo * 0.6 <= t <= hi * 1.7]
    upd = fig.update_yaxes if axis == "y" else fig.update_xaxes
    upd(type="log", tickvals=ticks, ticktext=[f"${t:,.0f}" for t in ticks], minor=dict(showgrid=False, ticks=""))


def pad_range(fig: go.Figure, values, axis: str = "x", pad: float = 0.22) -> None:
    """Widen an axis so outside-bar labels aren't clipped."""
    vals = [v for v in values if v == v]
    if not vals:
        return
    lo, hi = min(min(vals), 0), max(max(vals), 0)
    span = (hi - lo) or 1
    rng = [lo - (pad * span if lo < 0 else 0), hi + (pad * span if hi > 0 else 0)]
    (fig.update_xaxes if axis == "x" else fig.update_yaxes)(range=rng)


def show(fig: go.Figure, height: int = 380, legend: bool = True) -> None:
    st.plotly_chart(style(fig, height, legend), width="stretch", config={"displaylogo": False})


def money(v: float | None) -> str:
    return "—" if v is None or pd.isna(v) else f"${v:,.2f}"


def pct(v: float | None, signed: bool = True) -> str:
    return "—" if v is None or pd.isna(v) else (f"{v:+.1f}%" if signed else f"{v:.1f}%")


def stars(r: float | None) -> str:
    if r is None or pd.isna(r):
        return "—"
    full = int(round(r))
    return "★" * full + "☆" * (5 - full) + f"  {r:.1f}"
