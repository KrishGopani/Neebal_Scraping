/**
 * The "Filters" drawer — the business-facing controls that shape every number in the dashboard.
 *
 * Opened from the Filters button in Layout.tsx. Each control writes into the Settings context (src/lib/settings.tsx); changing
 * one changes the query key in src/lib/queries.ts, so all pages refetch and update immediately. Controls:
 *   Match reliability (which product matches to trust), Compare post-discount prices, Price tolerance, Category scope.
 */
import { RotateCcw } from 'lucide-react'
import { Drawer } from './Drawer'
import { Button, Pills, Segmented, Slider, Toggle } from './ui'
import { useSettings, type Settings } from '../lib/settings'
import { useMeta } from '../lib/queries'

// Small section heading with optional helper text.
const H = ({ children, hint }: { children: string; hint?: string }) => (
  <div className="mb-2 mt-6 first:mt-0"><h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{children}</h4>{hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}</div>
)
// UI label -> backend `min_confidence` value. "All matches" keeps every pair; "High only" keeps just same-model matches.
const RELIABILITY = { 'All matches': 'Low', 'Medium & high': 'Medium', 'High only': 'High' } as const

/** The drawer UI. Renders nothing until /api/meta has loaded (it needs the category list). */
export function SettingsPanel() {
  const { settings: s, set, reset, open, setOpen } = useSettings()
  const { data: meta } = useMeta()
  if (!meta) return null
  // Reverse lookup: which label corresponds to the stored value, so the right segment is highlighted.
  const label = Object.entries(RELIABILITY).find(([, v]) => v === s.min_confidence)![0] as keyof typeof RELIABILITY
  return (
    <Drawer open={open} onClose={() => setOpen(false)} title="Filters">
      {/* Match reliability: trade quantity of matches for like-for-like quality. */}
      <H hint="Which product matches to trust. Fewer matches, but more like-for-like.">Match reliability</H>
      <Segmented options={Object.keys(RELIABILITY) as (keyof typeof RELIABILITY)[]} value={label} onChange={k => set({ min_confidence: RELIABILITY[k] as Settings['min_confidence'] })} size="sm" />

      {/* Pricing basis (headline vs after-discount) and the tolerance within which a gap counts as "at par". */}
      <H>Pricing</H>
      <Toggle label="Compare post-discount prices" hint="Use what shoppers actually pay after listed discounts, not headline prices." checked={s.effective} onChange={v => set({ effective: v })} />
      <Slider label="Price tolerance" hint="Gaps within this range count as “at par”." value={s.tol} min={0} max={10} step={0.5} onChange={v => set({ tol: v })} format={v => `±${v}%`} />

      {/* Category scope: empty selection = all categories; picking some narrows every page to them. */}
      <H hint={s.scope.length ? `${s.scope.length} selected` : 'All categories — click to narrow.'}>Categories</H>
      <Pills options={meta.categories} value={s.scope} onChange={v => set({ scope: v })} />

      <Button className="mt-8 w-full" onClick={reset}><RotateCcw size={14} /> Reset filters</Button>
    </Drawer>
  )
}
