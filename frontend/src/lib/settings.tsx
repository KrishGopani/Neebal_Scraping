/**
 * The user's "Filters", held in React state and remembered in the browser.
 *
 * What the file provides:
 *   - `Settings`/`DEFAULTS`  - the shape and default values of every filter.
 *   - `toQuery()`            - turns Settings into the URL query string the backend understands.
 *   - `SettingsProvider`     - React context holding the current Settings; saved to localStorage so filters survive a reload.
 *   - `useSettings()`        - hook used by components to read/change filters (see SettingsPanel.tsx for the UI).
 *
 * Changing a filter changes the query key in src/lib/queries.ts, which makes the data refetch automatically.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

/**
 * Every filter the backend accepts. Only effective, tol, scope and min_confidence have controls in the UI; the others
 * (ours, snapshot, min_score, types, one_to_one, max_ratio) are advanced matching options kept at their defaults.
 */
export interface Settings {
  ours: string; snapshot: number | null; min_score: number; types: string[]; one_to_one: boolean
  max_ratio: number; effective: boolean; tol: number; scope: string[]; min_confidence: 'Low' | 'Medium' | 'High'
}
/** Out-of-the-box filter values: all categories, list prices, ±2% "at par" tolerance, all match confidences. */
export const DEFAULTS: Settings = {
  ours: 'webscraper', snapshot: null, min_score: 55, types: ['Equivalent', 'Close Match', 'Comparable'],
  one_to_one: true, max_ratio: 5, effective: false, tol: 2, scope: [], min_confidence: 'Low',
}
// localStorage key. The `.v1` suffix lets us ignore old saved shapes if Settings ever changes incompatibly.
const KEY = 'priceiq.settings.v1'

/**
 * Build the query string for an API call, e.g. "ours=webscraper&min_score=55&...&scope=Laptops,Tablets".
 * `extra` adds endpoint-specific params (e.g. store, thr). Snapshot is only sent when a specific one is chosen.
 */
export function toQuery(s: Settings, extra: Record<string, string | number> = {}) {
  const q = new URLSearchParams({
    ours: s.ours, min_score: String(s.min_score), types: s.types.join(','), one_to_one: String(s.one_to_one),
    max_ratio: String(s.max_ratio), effective: String(s.effective), tol: String(s.tol), scope: s.scope.join(','), min_confidence: s.min_confidence,
  })
  if (s.snapshot != null) q.set('snapshot', String(s.snapshot))
  Object.entries(extra).forEach(([k, v]) => q.set(k, String(v)))
  return q.toString()
}
/**
 * How many business filters differ from the defaults — shown as the little number badge on the Filters button.
 * Only the four user-facing filters are counted.
 */
export function changedCount(s: Settings) {
  return (['effective', 'tol', 'scope', 'min_confidence'] as (keyof Settings)[]).filter(k => JSON.stringify(s[k]) !== JSON.stringify(DEFAULTS[k])).length
}

/** What the settings context exposes: current values, a partial updater, a reset, and whether the Filters drawer is open. */
interface Ctx { settings: Settings; set: (p: Partial<Settings>) => void; reset: () => void; open: boolean; setOpen: (v: boolean) => void }
const SettingsCtx = createContext<Ctx>(null as unknown as Ctx)

/** Holds the Settings state for the whole app (mounted in App.tsx). */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => {
    // Initial state: saved settings merged over the defaults. The advanced matching options are always forced back to
    // defaults so a stale saved value (from an older UI that exposed them) can't silently alter results.
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}'), ours: DEFAULTS.ours, snapshot: null, min_score: DEFAULTS.min_score, types: DEFAULTS.types, one_to_one: true, max_ratio: DEFAULTS.max_ratio } } catch { return DEFAULTS }
  })
  const [open, setOpen] = useState(false)
  // Persist on every change. Wrapped in try/catch because storage can be blocked (private mode).
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(settings)) } catch { /* ignore */ } }, [settings])
  // Memoised so consumers only re-render when settings or the drawer state actually change.
  const value = useMemo<Ctx>(() => ({
    settings, open, setOpen,
    set: p => setSettings(s => ({ ...s, ...p })),
    // Reset puts every filter back to its default.
    reset: () => setSettings(DEFAULTS),
  }), [settings, open])
  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>
}
/** Access the current Settings and the `set`/`reset`/drawer controls from any component. */
export const useSettings = () => useContext(SettingsCtx)
