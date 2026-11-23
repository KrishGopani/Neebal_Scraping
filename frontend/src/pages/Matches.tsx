import { useMemo, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../components/DataTable'
import { Drawer } from '../components/Drawer'
import { Badge, Card, ScoreBar, EmptyState, PageHeader, Pills, Select, Stars, confidenceTone, positionTone } from '../components/ui'
import type { Pair } from '../lib/api'
import { useAnalysis } from '../lib/queries'
import { money, pct } from '../lib/utils'

const Thumb = ({ src, alt }: { src: string; alt: string }) => (
  <img src={src} alt={alt} loading="lazy" className="h-9 w-9 shrink-0 rounded-md border border-line bg-white object-contain p-0.5" onError={e => ((e.target as HTMLImageElement).style.visibility = 'hidden')} />
)

function Side({ name, label, img, price, rating, reviews, desc, url, color }: { name: string; label: string; img: string; price: number; rating: number | null; reviews: number | null; desc: string; url: string; color: string }) {
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold" style={{ color }}><span className="h-2 w-2 rounded-full" style={{ background: color }} />{label}</div>
      <div className="flex gap-3">
        <img src={img} alt="" className="h-20 w-20 shrink-0 rounded-lg border border-line bg-white object-contain p-1" />
        <div className="min-w-0">
          <div className="font-semibold leading-snug">{name}</div>
          <div className="tabular mt-1 text-xl font-bold">{money(price)}</div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted"><Stars r={rating} /><span>{reviews ?? 0} reviews</span></div>
        </div>
      </div>
      <p className="mt-3 line-clamp-4 text-xs text-muted">{desc || 'No description'}</p>
      <a href={url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">Open product page <ExternalLink size={12} /></a>
    </div>
  )
}

export default function Matches() {
  const { pairs, meta } = useAnalysis()
  const [pos, setPos] = useState<string[]>(['Cheaper', 'At par', 'Pricier'])
  const [conf, setConf] = useState<string[]>(['High', 'Medium', 'Low'])
  const [cat, setCat] = useState('All')
  const [sel, setSel] = useState<Pair | null>(null)

  const rows = useMemo(() => pairs.filter(r => pos.includes(r.position) && conf.includes(r.confidence) && (cat === 'All' || r.category === cat)), [pairs, pos, conf, cat])
  const cols = useMemo<ColumnDef<Pair>[]>(() => [
    { header: meta.our_name, accessorKey: 'our_name', cell: c => <div className="flex items-center gap-2.5"><Thumb src={c.row.original.our_image_url} alt="" /><span className="max-w-[210px] truncate font-medium" title={c.getValue<string>()}>{c.getValue<string>()}</span></div> },
    { header: meta.comp_name, accessorKey: 'comp_name', cell: c => <div className="flex items-center gap-2.5"><Thumb src={c.row.original.comp_image_url} alt="" /><span className="max-w-[210px] truncate" title={c.getValue<string>()}>{c.getValue<string>()}</span></div> },
    { header: 'Category', accessorKey: 'category', cell: c => <span className="text-muted">{c.getValue<string>()}</span> },
    { header: 'Your price', accessorKey: 'our_price', cell: c => <span className="tabular">{money(c.getValue<number>())}</span> },
    { header: 'Competitor', accessorKey: 'comp_price', cell: c => <span className="tabular">{money(c.getValue<number>())}</span> },
    { header: 'Gap', accessorKey: 'pct_diff', cell: c => <span className={`tabular font-semibold ${c.getValue<number>() > 0 ? 'text-bad' : c.getValue<number>() < 0 ? 'text-good' : 'text-muted'}`}>{pct(c.getValue<number>())}</span> },
    { header: 'Position', accessorKey: 'position', cell: c => <Badge tone={positionTone(c.getValue<string>())}>{c.getValue<string>()}</Badge> },
    { header: 'Match', accessorKey: 'match_type', cell: c => <span className="text-xs">{c.getValue<string>()}</span> },
    { header: 'Confidence', accessorKey: 'confidence', cell: c => <Badge tone={confidenceTone(c.getValue<string>())}>{c.getValue<string>()}</Badge> },
    { header: 'Score', accessorKey: 'score', cell: c => <ScoreBar value={c.getValue<number>()} /> },
  ], [meta])

  if (!pairs.length) return <><PageHeader title="Product matches" /><EmptyState title="No matched products at the current settings">Adjust the matching options in <b>Filters</b>.</EmptyState></>
  const cats = ['All', ...Array.from(new Set(pairs.map(r => r.category))).sort()]
  return (
    <>
      <PageHeader title="Product matches" subtitle="Equivalent products found across both stores. Click a row for a side-by-side view." />
      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div><div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Position</div><Pills options={['Cheaper', 'At par', 'Pricier']} value={pos} onChange={setPos} /></div>
          <div><div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Confidence</div><Pills options={['High', 'Medium', 'Low']} value={conf} onChange={setConf} /></div>
          <div><div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Category</div><Select value={cat} onChange={setCat} options={cats} /></div>
        </div>
        <DataTable data={rows} columns={cols} pageSize={12} onRowClick={setSel} initialSort={[{ id: 'score', desc: true }]} csvName="product_matches.csv" />
      </Card>

      <Drawer open={!!sel} onClose={() => setSel(null)} title="Side-by-side comparison" width="max-w-xl">
        {sel && (
          <div className="space-y-4">
            <div className="grid place-items-center rounded-xl bg-subtle py-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Price gap</div>
              <div className={`tabular text-4xl font-bold ${sel.pct_diff > 0 ? 'text-bad' : sel.pct_diff < 0 ? 'text-good' : ''}`}>{pct(sel.pct_diff)}</div>
              <div className="text-sm text-muted">{money(Math.abs(sel.diff))} {sel.diff < 0 ? 'cheaper' : sel.diff > 0 ? 'pricier' : ''} at your store</div>
              <div className="mt-2 flex gap-1.5"><Badge tone={confidenceTone(sel.confidence)}>{sel.confidence} confidence</Badge><Badge tone="info">{sel.match_type}</Badge></div>
            </div>
            <Side label={meta.our_name} color="var(--color-ours)" name={sel.our_name} img={sel.our_image_url} price={sel.our_price} rating={sel.our_rating} reviews={sel.our_review_count} desc={sel.our_description} url={sel.our_url} />
            <Side label={meta.comp_name} color="var(--color-comp)" name={sel.comp_name} img={sel.comp_image_url} price={sel.comp_price} rating={sel.comp_rating} reviews={sel.comp_review_count} desc={sel.comp_description} url={sel.comp_url} />
            <div className="rounded-xl border border-line p-4 text-sm">
              <div className="mb-2 font-semibold">Why were these matched? <span className="font-normal text-muted">(score {sel.score.toFixed(0)}/100)</span></div>
              <ul className="space-y-1 text-muted">
                <li>Brand agreement: <b className="text-fg">{sel.brand_match ? 'yes' : 'no'}</b></li>
                <li>Name similarity: <b className="text-fg">{sel.name_sim.toFixed(2)}</b></li>
                <li>Description (TF-IDF) similarity: <b className="text-fg">{sel.text_sim.toFixed(2)}</b></li>
                <li>Spec compatibility: <b className="text-fg">{sel.spec_sim == null ? 'n/a (specs not stated on both sides)' : sel.spec_sim.toFixed(2)}</b></li>
                <li>Shared model tokens: <b className="text-fg">{sel.shared_models || 'none'}</b></li>
              </ul>
            </div>
          </div>
        )}
      </Drawer>
    </>
  )
}
