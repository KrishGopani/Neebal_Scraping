"""FastAPI entry point - builds the web application object that uvicorn serves.

Role: wires together the pieces and does nothing else. The JSON endpoints live in app.api.routes; this file adds
CORS for the dev server and, when the React app has been built, serves it as static files so the whole product can
run as a single process.

Dev:   uvicorn app.main:app --reload          (run from backend/; frontend on :5173 proxies /api here)
Prod:  `npm run build` in frontend/, then the same command serves the built SPA from /.
"""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import router

# `app` is the ASGI application object referenced by the uvicorn command above.
app = FastAPI(title="PriceIQ — Competitor Price Intelligence API", version="2.0")
# The Vite dev server runs on another port, so the browser needs CORS permission to call /api directly.
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
                   allow_methods=["*"], allow_headers=["*"])
app.include_router(router)

# Production mode: only active if `npm run build` has produced frontend/dist (parents[2] = repo root).
DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if (DIST / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        """Serve a built file if it exists, otherwise index.html so client-side routes (/matches, /pricing...) work
        on refresh. Unknown /api/ paths still return a real 404 instead of the HTML page."""
        if path.startswith("api/"):
            raise HTTPException(404)
        f = DIST / path
        return FileResponse(f if f.is_file() else DIST / "index.html")
