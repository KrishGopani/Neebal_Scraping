export type Position = 'Cheaper' | 'At par' | 'Pricier'
export type Confidence = 'High' | 'Medium' | 'Low'
export type Tone = 'good' | 'neutral' | 'warn' | 'bad' | 'info'

export interface Pair {
  our_id: string; comp_id: string; label: string; category: string; brand: string
  our_name: string; comp_name: string; our_price: number; comp_price: number
  diff: number; pct_diff: number; abs_pct_diff: number; position: Position
  score: number; match_type: string; confidence: Confidence; brand_match: boolean
  name_sim: number; text_sim: number; spec_sim: number | null; shared_models: string
  our_rating: number | null; comp_rating: number | null; rating_diff: number | null
  our_review_count: number | null; comp_review_count: number | null
  our_image_url: string; comp_image_url: string; our_url: string; comp_url: string
  our_description: string; comp_description: string
}
export interface Kpis {
  n: number; n_cheaper?: number; n_par?: number; n_pricier?: number
  pct_cheaper?: number; pct_par?: number; pct_pricier?: number; win_rate?: number
  avg_pct_diff?: number; median_pct_diff?: number; avg_abs_diff?: number; price_index?: number
  n_equivalent?: number; verdict?: string; verdict_tone?: Tone
}
export interface Insight { tone: Tone; title: string; body: string }
export interface CategoryRow {
  category: string; coverage: 'Both' | 'Only you' | 'Only competitor'
  our_n: number | null; our_avg: number | null; our_median: number | null; our_rating: number | null
  comp_n: number | null; comp_avg: number | null; comp_median: number | null; comp_rating: number | null
  median_gap_pct: number | null; avg_gap_pct: number | null; matched_n: number | null; matched_avg_pct_diff: number | null
}
export interface BrandCategory { brand: string; category: string; our_median: number; our_n: number; comp_median: number; comp_n: number; gap_pct: number }
export interface BrandRow { brand: string; our_n: number | null; our_median: number | null; our_rating: number | null; comp_n: number | null; comp_median: number | null; comp_rating: number | null; gap: number | null }
export interface BenchmarkRow {
  product_id: string; name: string; brand: string; category: string; price: number; comp_n: number; comp_cat_median: number
  vs_cat_pct: number; percentile: number; comp_brand_median: number | null; vs_brand_pct: number | null; rating: number | null; review_count: number | null
}
export interface RatingRow { store: string; category: string; name: string; price: number; rating: number | null; review_count: number | null }
export interface Market {
  discount_by_category: { category: string; mean: number; max: number; n: number }[]
  discount_values: number[]; discount_share: number
  assortment: { category: string; store: string; products: number }[]
  price_bands: { store: string; band: string; n: number; share: number }[]
  stock_low: { name: string; category: string; price: number; stock: number; availability: string }[]
  trend: {
    n_snapshots: number
    series: { scraped_at: string; store: string; category: string; median_price: number }[]
    changes: { store: string; name: string; category: string; price_prev: number; price: number; change: number; change_pct: number }[]
  }
  price_spread: { store: string; category: string; price: number; name: string }[]
}
export interface Analysis {
  meta: {
    our_key: string; comp_key: string; our_name: string; comp_name: string; snapshot_id: number; scraped_at: string
    effective: boolean; n_ours: number; n_comps: number; n_pairs: number; n_matches_total: number; tol: number
  }
  kpis: Kpis; insights: Insight[]; pairs: Pair[]; categories: CategoryRow[]
  brand_category: BrandCategory[]; brands: BrandRow[]; benchmark: BenchmarkRow[]; ratings: RatingRow[]; market: Market
}
export interface Recommendation {
  our_name: string; comp_name: string; category: string; match_type: string; confidence: Confidence
  our_price: number; comp_price: number; pct_diff: number; action: string; suggested_price: number; price_change: number; rationale: string
}
export interface Product {
  product_id: string; image_url: string; name: string; brand: string; category: string; price: number; discount_pct: number
  effective_price: number; rating: number | null; review_count: number | null; availability: string
  screen_in: number | null; ram_gb: number | null; storage_gb: number | null; cpu: string | null; description: string; url: string
}
export interface Meta {
  has_data: boolean; sources: { key: string; name: string; kind: string; base_url: string }[]; default_ours: string
  snapshots: { snapshot_id: number; scraped_at: string; n_products: number }[]; categories: string[]; match_types: string[]
}
export interface ScrapeJob { state: 'idle' | 'running' | 'done' | 'error'; progress: number; message: string; errors: string[]; snapshot_id: number | null }

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, init)
  if (!r.ok) {
    let detail = r.statusText
    try { detail = (await r.json()).detail ?? detail } catch { /* ignore */ }
    throw new ApiError(r.status, String(detail))
  }
  return r.json()
}
