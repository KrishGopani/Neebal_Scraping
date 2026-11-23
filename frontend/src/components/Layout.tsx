import { NavLink, Outlet } from 'react-router-dom'
import { BadgeDollarSign, Database, Layers, LayoutDashboard, Link2, Loader2, Moon, RefreshCw, SlidersHorizontal, Star, Sun, Target, TrendingUp } from 'lucide-react'
import { Button, EmptyState, Skeleton } from './ui'
import { SettingsPanel } from './SettingsPanel'
import { AnalysisCtx, useAnalysisQuery, useMeta, useScrape } from '../lib/queries'
import { changedCount, useSettings } from '../lib/settings'
import { useTheme } from '../lib/theme'
import { cn } from '../lib/utils'

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/matches', label: 'Product Matches', icon: Link2 },
  { to: '/pricing', label: 'Price Comparison', icon: BadgeDollarSign },
  { to: '/categories', label: 'Categories & Brands', icon: Layers },
  { to: '/actions', label: 'Gaps & Actions', icon: Target },
  { to: '/quality', label: 'Quality & Value', icon: Star },
  { to: '/market', label: 'Market & Trends', icon: TrendingUp },
  { to: '/data', label: 'Data & Method', icon: Database },
]

function ScrapeButton({ primary }: { primary?: boolean }) {
  const { job, running, start } = useScrape()
  return (
    <div className="flex items-center gap-2">
      {running && <span className="hidden text-xs text-muted md:inline">{job?.message} · {Math.round((job?.progress ?? 0) * 100)}%</span>}
      {job?.state === 'error' && !running && <span className="hidden text-xs text-bad md:inline" title={job.errors.join('\n')}>Scrape failed</span>}
      <Button variant={primary ? 'primary' : 'secondary'} onClick={start} disabled={running}>
        {running ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
        {running ? 'Scraping…' : 'Run scrape'}
      </Button>
    </div>
  )
}

export function Layout() {
  const { isDark, toggle } = useTheme()
  const { settings, setOpen } = useSettings()
  const meta = useMeta()
  const q = useAnalysisQuery()
  const n = changedCount(settings)
  const a = q.data

  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-white dark:text-slate-900"><TrendingUp size={18} strokeWidth={2.6} /></div>
          <div><div className="text-[15px] font-bold leading-none">PriceIQ</div><div className="mt-0.5 text-[11px] text-muted">Competitor intelligence</div></div>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'}
              className={({ isActive }) => cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition', isActive ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-subtle hover:text-fg')}>
              <Icon size={17} />{label}
            </NavLink>
          ))}
        </nav>
        {a && (
          <div className="m-3 rounded-xl bg-subtle p-3 text-xs text-muted">
            <div className="font-semibold text-fg">Snapshot #{a.meta.snapshot_id}</div>
            <div>{a.meta.scraped_at.replace('T', ' ').slice(0, 16)} UTC</div>
            <div className="mt-1">{a.meta.n_ours} vs {a.meta.n_comps} products</div>
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface/85 px-4 py-3 backdrop-blur lg:px-8">
          <div className="min-w-0 flex-1">
            {a ? (
              <div className="flex flex-wrap items-center gap-x-2 text-sm">
                <span className="font-semibold text-ours">{a.meta.our_name}</span><span className="text-muted">benchmarked against</span>
                <span className="font-semibold text-comp">{a.meta.comp_name}</span>
                <span className="ml-1 hidden rounded-full bg-subtle px-2 py-0.5 text-xs text-muted sm:inline">{a.meta.effective ? 'post-discount' : 'list'} prices</span>
              </div>
            ) : <div className="text-sm text-muted">PriceIQ</div>}
          </div>
          <Button onClick={() => setOpen(true)}>
            <SlidersHorizontal size={15} /> Filters
            {n > 0 && <span className="grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-white dark:text-slate-900">{n}</span>}
          </Button>
          {meta.data?.has_data && <ScrapeButton />}
          <Button variant="ghost" onClick={toggle} aria-label="Toggle theme">{isDark ? <Sun size={17} /> : <Moon size={17} />}</Button>
        </header>

        {/* mobile nav */}
        <nav className="flex gap-1 overflow-x-auto border-b border-line bg-surface px-3 py-2 lg:hidden">
          {NAV.map(({ to, label }) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => cn('whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium', isActive ? 'bg-brand-soft text-brand' : 'text-muted')}>{label}</NavLink>
          ))}
        </nav>

        <main className="mx-auto w-full max-w-[1480px] flex-1 px-4 py-6 lg:px-8">
          {meta.isLoading || (q.isLoading && meta.data?.has_data !== false) ? (
            <div className="space-y-4"><Skeleton className="h-24" /><div className="grid grid-cols-2 gap-4 lg:grid-cols-5">{[0, 1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}</div><Skeleton className="h-80" /></div>
          ) : meta.data && !meta.data.has_data ? (
            <EmptyState title="No data yet"><p className="mb-4">Run the first scrape to collect products from both stores.</p><ScrapeButton primary /></EmptyState>
          ) : q.isError || !a ? (
            <EmptyState title="Couldn't load analysis">{(q.error as Error)?.message ?? 'Is the API running on :8000?'}</EmptyState>
          ) : (
            <AnalysisCtx.Provider value={a}>
              <div className={cn('transition-opacity', q.isFetching && 'opacity-60')}><Outlet /></div>
            </AnalysisCtx.Provider>
          )}
        </main>
      </div>
      <SettingsPanel />
    </div>
  )
}
