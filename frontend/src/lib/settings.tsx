import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export interface Settings {
  ours: string; snapshot: number | null; min_score: number; types: string[]; one_to_one: boolean
  max_ratio: number; effective: boolean; tol: number; scope: string[]
}
export const DEFAULTS: Settings = {
  ours: 'webscraper', snapshot: null, min_score: 55, types: ['Equivalent', 'Close Match', 'Comparable'],
  one_to_one: true, max_ratio: 5, effective: false, tol: 2, scope: [],
}
const KEY = 'priceiq.settings.v1'

export function toQuery(s: Settings, extra: Record<string, string | number> = {}) {
  const q = new URLSearchParams({
    ours: s.ours, min_score: String(s.min_score), types: s.types.join(','), one_to_one: String(s.one_to_one),
    max_ratio: String(s.max_ratio), effective: String(s.effective), tol: String(s.tol), scope: s.scope.join(','),
  })
  if (s.snapshot != null) q.set('snapshot', String(s.snapshot))
  Object.entries(extra).forEach(([k, v]) => q.set(k, String(v)))
  return q.toString()
}
/** How many settings differ from defaults (shown as a badge on the Filters button). */
export function changedCount(s: Settings) {
  return (Object.keys(DEFAULTS) as (keyof Settings)[]).filter(k => JSON.stringify(s[k]) !== JSON.stringify(DEFAULTS[k])).length
}

interface Ctx { settings: Settings; set: (p: Partial<Settings>) => void; reset: () => void; open: boolean; setOpen: (v: boolean) => void }
const SettingsCtx = createContext<Ctx>(null as unknown as Ctx)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return DEFAULTS }
  })
  const [open, setOpen] = useState(false)
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(settings)) } catch { /* ignore */ } }, [settings])
  const value = useMemo<Ctx>(() => ({
    settings, open, setOpen,
    set: p => setSettings(s => ({ ...s, ...p })),
    reset: () => setSettings(s => ({ ...DEFAULTS, ours: s.ours })),
  }), [settings, open])
  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>
}
export const useSettings = () => useContext(SettingsCtx)
