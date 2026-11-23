import { useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../components/DataTable'
import { Card, PageHeader, Segmented, Select, Skeleton, Stars } from '../components/ui'
import type { Product } from '../lib/api'
import { useAnalysis, useCatalog, useMeta } from '../lib/queries'
import { money, num } from '../lib/utils'

const cols: ColumnDef<Product>[] = [
  { header: '', accessorKey: 'image_url', enableSorting: false, cell: c => <img src={c.getValue<string>()} alt="" loading="lazy" className="h-9 w-9 rounded-md border border-line bg-white object-contain p-0.5" /> },
  { header: 'Name', accessorKey: 'name', cell: c => <a href={c.row.original.url} target="_blank" rel="noreferrer" className="font-medium hover:text-brand hover:underline">{c.getValue<string>()}</a> },
  { header: 'Brand', accessorKey: 'brand' }, { header: 'Category', accessorKey: 'category' },
  { header: 'List price', accessorKey: 'price', cell: c => money(c.getValue<number>()) },
  { header: 'Disc.', accessorKey: 'discount_pct', cell: c => (c.getValue<number>() ? `${c.getValue<number>().toFixed(1)}%` : '—') },
  { header: 'Net price', accessorKey: 'effective_price', cell: c => money(c.getValue<number>()) },
  { header: 'Rating', accessorKey: 'rating', cell: c => <Stars r={c.getValue<number | null>()} /> }, { header: 'Reviews', accessorKey: 'review_count', cell: c => num(c.getValue<number | null>()) },
  { header: 'Screen', accessorKey: 'screen_in', cell: c => (c.getValue<number | null>() ? `${c.getValue()}"` : '—') }, { header: 'RAM', accessorKey: 'ram_gb', cell: c => (c.getValue<number | null>() ? `${c.getValue()} GB` : '—') },
  { header: 'Storage', accessorKey: 'storage_gb', cell: c => (c.getValue<number | null>() ? `${c.getValue()} GB` : '—') }, { header: 'CPU', accessorKey: 'cpu', cell: c => c.getValue<string | null>() ?? '—' },
  { header: 'Description', accessorKey: 'description', cell: c => <span className="block max-w-xs truncate text-muted" title={c.getValue<string>()}>{c.getValue<string>()}</span> },
]

function Catalogue({ store, name }: { store: 'ours' | 'competitor'; name: string }) {
  const q = useCatalog(store)
  const [cat, setCat] = useState('All')
  if (q.isLoading) return <Skeleton className="h-96" />
  const data = q.data ?? []
  const cats = ['All', ...Array.from(new Set(data.map(r => r.category))).sort()]
  return <DataTable data={cat === 'All' ? data : data.filter(r => r.category === cat)} columns={cols} pageSize={10} dense csvName={`${store}_catalogue.csv`}
    toolbar={<Select value={cat} onChange={setCat} options={cats} />} empty={`No products in ${name}`} />
}

const METHOD = [
  ['Data collection', 'WebScraper Store: server-rendered HTML scraped with requests + lxml (laptops, tablets, phones; every page followed). DummyJSON Store: the storefront’s public JSON API. Scrapers honour robots.txt, identify themselves, throttle requests and retry with back-off. Each run is saved as an immutable snapshot in SQLite. Scrapers are adapters (BaseScraper) — a JavaScript-heavy site can be added using Playwright inside a new adapter.'],
  ['Normalisation', 'Brands are canonicalised (sub-brands such as Galaxy → Samsung, ThinkPad → Lenovo); site categories are mapped to a unified taxonomy; specs (screen, RAM, storage, CPU) are parsed from free text.'],
  ['Product matching', 'Within the same unified category each candidate pair is scored 0–100 from brand agreement (30%), fuzzy name similarity (35%), TF-IDF description similarity (15%) and spec compatibility (20%, when both sides state specs). A one-to-one assignment (Hungarian algorithm) stops one competitor product absorbing many matches. Price is never a matching input. Tiers: Equivalent (same model) · Close Match (same family) · Comparable (same brand/class). Confidence: High / Medium / Low.'],
  ['Metrics', 'Gap % = (your price − competitor) ÷ competitor. Price index = mean(your ÷ competitor) × 100 (100 = parity; <95 price leader; 95–105 at market; 105–120 premium; >120 well above market). Win rate = share of pairs where you are cheaper or within the “at par” tolerance. Max price ratio drops pairs differing by more than N× — almost always different product classes, not pricing signals.'],
  ['Caveats', 'Both sources are public demo storefronts built for scraping practice: prices and ratings are synthetic and the catalogues overlap only partly, so matched samples are small. The pipeline is source-agnostic — point new scrapers at real competitors (with permission / within their terms) for production use.'],
]

export default function DataPage() {
  const { meta } = useAnalysis()
  const m = useMeta()
  const [tab, setTab] = useState<'Your catalogue' | 'Competitor catalogue' | 'Scrape history' | 'Methodology'>('Your catalogue')
  return (
    <>
      <PageHeader title="Data & method" subtitle="Raw catalogues, scrape history and how the numbers are produced." />
      <div className="mb-4"><Segmented options={['Your catalogue', 'Competitor catalogue', 'Scrape history', 'Methodology'] as const} value={tab} onChange={setTab} /></div>
      <Card>
        {tab === 'Your catalogue' && <Catalogue store="ours" name={meta.our_name} />}
        {tab === 'Competitor catalogue' && <Catalogue store="competitor" name={meta.comp_name} />}
        {tab === 'Scrape history' && <DataTable searchable={false} data={m.data?.snapshots ?? []} pageSize={15}
          columns={[{ header: 'Snapshot', accessorKey: 'snapshot_id', cell: c => `#${c.getValue()}` }, { header: 'Scraped at (UTC)', accessorKey: 'scraped_at', cell: c => c.getValue<string>().replace('T', ' ') }, { header: 'Products', accessorKey: 'n_products' }]} />}
        {tab === 'Methodology' && <div className="max-w-3xl space-y-5">{METHOD.map(([h, t]) => <div key={h}><h3 className="mb-1 text-sm font-semibold">{h}</h3><p className="text-sm leading-relaxed text-muted">{t}</p></div>)}</div>}
      </Card>
    </>
  )
}
