/**
 * Data-fetching hooks (TanStack Query) — the one place components get data from the backend.
 *
 * TanStack Query caches each response under a "query key"; when the key changes (e.g. the user edits a Filter) it
 * fetches again, and identical keys are served from cache. The pages themselves don't call `fetch`; they read the
 * result through `useAnalysis()` (context filled by Layout.tsx) or the hooks below.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useContext } from 'react'
import { api, type Analysis, type Meta, type Product, type Recommendation, type ScrapeJob } from './api'
import { toQuery, useSettings } from './settings'

/** Static info (stores, snapshots, category list). Used by the Filters drawer and to decide whether any data exists yet. */
export const useMeta = () => useQuery({ queryKey: ['meta'], queryFn: () => api<Meta>('/api/meta') })

/** The main query: GET /api/analysis with the current Filters. Called once by Layout, which shares the result with all pages via context. */
export function useAnalysisQuery() {
  const { settings } = useSettings()
  return useQuery({
    // The whole Settings object is part of the key, so ANY filter change triggers a refetch automatically.
    // (`placeholderData: keepPreviousData` below keeps showing the old result while the new one loads, instead of flashing an empty
    // page; Layout dims it slightly.)
    queryKey: ['analysis', settings],
    queryFn: () => api<Analysis>(`/api/analysis?${toQuery(settings)}`),
    placeholderData: keepPreviousData,
  })
}
/**
 * Pricing recommendations for the Gaps & Actions page. Its own endpoint because the three policy sliders
 * (gap threshold, undercut margin, max step) are separate from the global Filters and change often.
 */
export function useRecommendations(thr: number, margin: number, step: number) {
  const { settings } = useSettings()
  return useQuery({
    // Key includes the three slider values, so moving a slider refetches (previous rows stay visible meanwhile, via keepPreviousData).
    queryKey: ['recs', settings, thr, margin, step],
    queryFn: () => api<Recommendation[]>(`/api/recommendations?${toQuery(settings, { thr, margin, step })}`),
    placeholderData: keepPreviousData,
  })
}
/** Full product list of one store ('ours' or 'competitor') for the Catalogue page; respects category/price-basis filters. */
export function useCatalog(store: 'ours' | 'competitor') {
  const { settings } = useSettings()
  return useQuery({ queryKey: ['catalog', store, settings], queryFn: () => api<Product[]>(`/api/catalog?${toQuery(settings, { store })}`) })
}

/**
 * Run a fresh scrape from the UI. Returns { job, running, start }.
 * Flow: start() -> backend begins scraping in a background thread -> we poll status every 700 ms (progress bar text in the
 * header) -> when 'done', switch to the newest snapshot and invalidate all cached queries so every page shows the new data.
 */
export function useScrape() {
  const qc = useQueryClient()
  const { set } = useSettings()
  // Poll GET /api/scrape/status. `refetchInterval` returns 700 ms while the job is 'running' and false (stop polling) otherwise.
  const status = useQuery({
    queryKey: ['scrape-status'],
    queryFn: () => api<ScrapeJob>('/api/scrape/status'),
    refetchInterval: q => (q.state.data?.state === 'running' ? 700 : false),
  })
  // POST /api/scrape starts the job; on success re-read the status so polling begins immediately. The backend ignores a second
  // start while one is running.
  const start = useMutation({
    mutationFn: () => api<ScrapeJob>('/api/scrape', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scrape-status'] }),
  })
  // 'idle' | 'running' | 'done' | 'error'
  const state = status.data?.state
  // Finished: switch to the newest snapshot and refetch everything. `window.__scrapeHandled` remembers which snapshot id we
  // already processed, because this runs on every render and we must only refresh once per completed scrape.
  if (state === 'done' && status.data?.snapshot_id != null && !(window as any).__scrapeHandled?.[status.data.snapshot_id]) {
    ;((window as any).__scrapeHandled ||= {})[status.data.snapshot_id] = true
    set({ snapshot: null })
    qc.invalidateQueries({ predicate: q => q.queryKey[0] !== 'scrape-status' })
  }
  return { job: status.data, running: state === 'running' || start.isPending, start: () => start.mutate() }
}

/**
 * React context carrying the loaded Analysis to every page. Layout.tsx only renders pages once data exists,
 * so consumers can treat it as non-null.
 */
export const AnalysisCtx = createContext<Analysis>(null as unknown as Analysis)
/** Read the current Analysis (KPIs, pairs, categories, insights, market data...) inside any page. */
export const useAnalysis = () => useContext(AnalysisCtx)
