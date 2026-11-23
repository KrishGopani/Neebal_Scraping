import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useContext } from 'react'
import { api, type Analysis, type Meta, type Product, type Recommendation, type ScrapeJob } from './api'
import { toQuery, useSettings } from './settings'

export const useMeta = () => useQuery({ queryKey: ['meta'], queryFn: () => api<Meta>('/api/meta') })

export function useAnalysisQuery() {
  const { settings } = useSettings()
  return useQuery({
    queryKey: ['analysis', settings],
    queryFn: () => api<Analysis>(`/api/analysis?${toQuery(settings)}`),
    placeholderData: keepPreviousData,
  })
}
export function useRecommendations(thr: number, margin: number, step: number) {
  const { settings } = useSettings()
  return useQuery({
    queryKey: ['recs', settings, thr, margin, step],
    queryFn: () => api<Recommendation[]>(`/api/recommendations?${toQuery(settings, { thr, margin, step })}`),
    placeholderData: keepPreviousData,
  })
}
export function useCatalog(store: 'ours' | 'competitor') {
  const { settings } = useSettings()
  return useQuery({ queryKey: ['catalog', store, settings], queryFn: () => api<Product[]>(`/api/catalog?${toQuery(settings, { store })}`) })
}

/** Starts a scrape and polls until it finishes, then refreshes every query. */
export function useScrape() {
  const qc = useQueryClient()
  const { set } = useSettings()
  const status = useQuery({
    queryKey: ['scrape-status'],
    queryFn: () => api<ScrapeJob>('/api/scrape/status'),
    refetchInterval: q => (q.state.data?.state === 'running' ? 700 : false),
  })
  const start = useMutation({
    mutationFn: () => api<ScrapeJob>('/api/scrape', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scrape-status'] }),
  })
  const state = status.data?.state
  // Finished: switch to the newest snapshot and refetch data.
  if (state === 'done' && status.data?.snapshot_id != null && !(window as any).__scrapeHandled?.[status.data.snapshot_id]) {
    ;((window as any).__scrapeHandled ||= {})[status.data.snapshot_id] = true
    set({ snapshot: null })
    qc.invalidateQueries({ predicate: q => q.queryKey[0] !== 'scrape-status' })
  }
  return { job: status.data, running: state === 'running' || start.isPending, start: () => start.mutate() }
}

export const AnalysisCtx = createContext<Analysis>(null as unknown as Analysis)
export const useAnalysis = () => useContext(AnalysisCtx)
