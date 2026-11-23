import { RotateCcw } from 'lucide-react'
import { Drawer } from './Drawer'
import { Button, Pills, Segmented, Select, Slider, Toggle } from './ui'
import { useSettings } from '../lib/settings'
import { useMeta } from '../lib/queries'

const H = ({ children }: { children: string }) => <h4 className="mb-1 mt-5 text-[11px] font-semibold uppercase tracking-wider text-muted first:mt-0">{children}</h4>

export function SettingsPanel() {
  const { settings: s, set, reset, open, setOpen } = useSettings()
  const { data: meta } = useMeta()
  if (!meta) return null
  const names = Object.fromEntries(meta.sources.map(x => [x.key, x.name]))
  const byName = Object.fromEntries(meta.sources.map(x => [x.name, x.key]))
  return (
    <Drawer open={open} onClose={() => setOpen(false)} title="Analysis settings">
      <H>Perspective</H>
      <p className="mb-2 text-xs text-muted">Choose the store whose prices you want to benchmark. The other store is the competitor.</p>
      <Segmented options={meta.sources.map(x => x.name)} value={names[s.ours]} onChange={n => set({ ours: byName[n] })} />

      <H>Data snapshot</H>
      <Select className="w-full" value={String(s.snapshot ?? meta.snapshots[0]?.snapshot_id)} onChange={v => set({ snapshot: Number(v) === meta.snapshots[0]?.snapshot_id ? null : Number(v) })}
        options={meta.snapshots.map(x => ({ value: String(x.snapshot_id), label: `#${x.snapshot_id} · ${x.scraped_at.replace('T', ' ').slice(0, 16)} · ${x.n_products} products` }))} />

      <H>Product matching</H>
      <Slider label="Minimum match score" hint="Higher = fewer, more reliable matches." value={s.min_score} min={40} max={90} step={5} onChange={v => set({ min_score: v })} />
      <div className="py-1.5">
        <div className="mb-1.5 text-sm font-medium">Match types</div>
        <Pills options={meta.match_types} value={s.types} onChange={v => set({ types: v })} />
      </div>
      <Toggle label="One-to-one matching" hint="Each competitor product matches at most one of yours." checked={s.one_to_one} onChange={v => set({ one_to_one: v })} />
      <Slider label="Max plausible price ratio" hint="Drops pairs whose prices differ by more than this multiple — likely different product classes." value={s.max_ratio} min={2} max={20} step={0.5} onChange={v => set({ max_ratio: v })} format={v => `${v}×`} />

      <H>Pricing</H>
      <Toggle label="Use post-discount prices" hint="Compare what shoppers actually pay after listed discounts." checked={s.effective} onChange={v => set({ effective: v })} />
      <Slider label="“At par” tolerance" value={s.tol} min={0} max={10} step={0.5} onChange={v => set({ tol: v })} format={v => `±${v}%`} />

      <H>Category scope</H>
      <p className="mb-2 text-xs text-muted">{s.scope.length ? `${s.scope.length} selected` : 'All categories'} — click to narrow.</p>
      <Pills options={meta.categories} value={s.scope} onChange={v => set({ scope: v })} />

      <Button className="mt-6 w-full" onClick={reset}><RotateCcw size={14} /> Reset to defaults</Button>
    </Drawer>
  )
}
