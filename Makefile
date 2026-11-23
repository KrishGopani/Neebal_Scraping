# PriceIQ — common tasks.  `make help`
PY := backend/.venv/bin/python

help:           ## list commands
	@grep -E '^[a-z-]+:.*##' Makefile | sed 's/:.*##/ —/'

install:        ## install backend + frontend dependencies
	python3 -m venv backend/.venv && backend/.venv/bin/pip install -q -r backend/requirements.txt
	cd frontend && npm install

scrape:         ## run both scrapers once and store a snapshot
	cd backend && .venv/bin/python -m app.scrapers.runner

api:            ## FastAPI on :8000 (auto-reload)
	cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000

web:            ## Vite dev server on :5173 (proxies /api to :8000)
	cd frontend && npm run dev

build:          ## production build of the frontend (served by FastAPI at :8000)
	cd frontend && npm run build

test:           ## backend tests + frontend typecheck
	cd backend && .venv/bin/python -m pytest -q
	cd frontend && npx tsc --noEmit

.PHONY: help install scrape api web build test
