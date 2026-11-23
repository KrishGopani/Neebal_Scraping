/**
 * Catalogue page (route "/catalogue").
 *
 * A plain browsable, searchable, exportable list of every product each store lists (from GET /api/catalog), with a switch
 * between your store and the competitor. Useful for spot-checking the scraped data and exporting it to CSV.
 */
import { useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../components/DataTable'
import { Card, PageHeader, Segmented, Select, Skeleton, Stars } from '../components/ui'
import type { Product } from '../lib/api'
import { useAnalysis, useCatalog } from '../lib/queries'
import { money, num } from '../lib/utils'

// Table columns: image, name (links to the product page), brand, category, list/discount/net price, rating, reviews, availability.
const cols: ColumnDef<Product>[] = [
  { header: '', accessorKey: 'image_url', enableSorting: false, cell: c => <img src={c.getValue<string>()} alt="" loading="lazy" className="h-9 w-9 rounded-md border border-line bg-white object-contain p-0.5" /> },
  { header: 'Product', accessorKey: 'name', cell: c => <a href={c.row.original.url} target="_blank" rel="noreferrer" className="font-medium hover:text-brand hover:underline">{c.getValue<string>()}</a> },
  { header: 'Brand', accessorKey: 'brand' }, { header: 'Category', accessorKey: 'category' },
  { header: 'Price', accessorKey: 'price', cell: c => money(c.getValue<number>()) },
  { header: 'Discount', accessorKey: 'discount_pct', cell: c => (c.getValue<number>() ? `${c.getValue<number>().toFixed(1)}%` : '—') },
  { header: 'Net price', accessorKey: 'effective_price', cell: c => money(c.getValue<number>()) },
  { header: 'Rating', accessorKey: 'rating', cell: c => <Stars r={c.getValue<number | null>()} /> },
  { header: 'Reviews', accessorKey: 'review_count', cell: c => num(c.getValue<number | null>()) },
  { header: 'Availability', accessorKey: 'availability' },
]

/** The table for one store (own data hook so each store loads on demand), with a category filter and CSV export. */
function Catalogue({ store }: { store: 'ours' | 'competitor' }) {
  const q = useCatalog(store)
  const [cat, setCat] = useState('All')
  if (q.isLoading) return <Skeleton className="h-96" />
  const data = q.data ?? []
  const cats = ['All', ...Array.from(new Set(data.map(r => r.category))).sort()]
  return <DataTable data={cat === 'All' ? data : data.filter(r => r.category === cat)} columns={cols} pageSize={10} dense csvName={`${store}_catalogue.csv`}
    toolbar={<Select value={cat} onChange={setCat} options={cats} />} />
}

/** Page wrapper: store switch + the catalogue table. */
export default function CataloguePage() {
  const { meta } = useAnalysis()
  const [tab, setTab] = useState<'ours' | 'competitor'>('ours')
  return (
    <>
      <PageHeader title="Catalogue" subtitle="Browse and export every product each store lists." />
      <div className="mb-4"><Segmented options={[meta.our_name, meta.comp_name] as const} value={tab === 'ours' ? meta.our_name : meta.comp_name} onChange={v => setTab(v === meta.our_name ? 'ours' : 'competitor')} /></div>
      {/* `key={tab}` remounts the table when switching store, which resets its category filter, search and sorting. */}
      <Card><Catalogue key={tab} store={tab} /></Card>
    </>
  )
}
