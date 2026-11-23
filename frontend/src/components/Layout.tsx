/**
 * The application shell shown around every page: left sidebar (navigation), top bar (title, Filters, Run scrape, theme), and
 * the page area. It also owns the app-wide data loading.
 *
 * How it fits together:
 *   - Called by the router in App.tsx as the parent route; the active page renders in <Outlet />.
 *   - Fetches the analysis once (useAnalysisQuery) and shares it with all pages via <AnalysisCtx.Provider>, so a page only
 *     renders when data is ready and never handles loading itself.
 *   - Shows the right state: loading skeleton, "no data yet" (with a first-scrape button), error, or the page.
 *   - Hosts the Filters drawer (SettingsPanel) and the scrape button.
 */
import { NavLink, Outlet } from 'react-router-dom'
import { BadgeDollarSign, Database, Layers, LayoutDashboard, Link2, Loader2, Moon, RefreshCw, SlidersHorizontal, Star, Sun, Target, TrendingUp } from 'lucide-react'
import { Button, EmptyState, Skeleton } from './ui'
import { SettingsPanel } from './SettingsPanel'
import { AnalysisCtx, useAnalysisQuery, useMeta, useScrape } from '../lib/queries'
import { changedCount, useSettings } from '../lib/settings'
import { useTheme } from '../lib/theme'
import { cn } from '../lib/utils'

/** Sidebar/mobile navigation entries: URL path, label, icon. Order here is the order shown. */
const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/matches', label: 'Product Matches', icon: Link2 },
  { to: '/pricing', label: 'Price Comparison', icon: BadgeDollarSign },
  { to: '/categories', label: 'Categories & Brands', icon: Layers },
  { to: '/actions', label: 'Gaps & Actions', icon: Target },
  { to: '/quality', label: 'Quality & Value', icon: Star },
  { to: '/market', label: 'Market & Trends', icon: TrendingUp },
  { to: '/catalogue', label: 'Catalogue', icon: Database },
]

/**
 * "Run scrape" button. Starts the background scrape (useScrape) and, while running, shows the status message and percentage;
 * shows "Scrape failed" if the last job errored. `primary` styles it as the main call-to-action on the empty state.
 */
function ScrapeButton({ primary }: { primary?: boolean }) {
  // Scrape job state + start function from src/lib/queries.ts (it polls the backend while a job runs).
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

/** Page frame + app-wide data loading (see file header). */
export function Layout() {
  const { isDark, toggle } = useTheme()
  const { settings, setOpen } = useSettings()
  const meta = useMeta()
  // The main data query. `a` below is its data (undefined until the first load).
  const q = useAnalysisQuery()
  // Number of active filters, shown as the badge on the Filters button.
  const n = changedCount(settings)
  const a = q.data

  return (
    <div className="flex min-h-full">
      {/*
         Desktop sidebar (hidden below the `lg` breakpoint, where the horizontal mobile nav further down is used instead).
         It also shows which scrape snapshot the numbers come from.
      */}
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
        {/* Top bar: "<your store> benchmarked against <competitor>", Filters button (with active-filter badge), Run scrape, theme toggle. */}
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

        {/*
           Page area. Exactly one of these states is shown: (1) first load -> skeleton, (2) no scrape data yet -> empty state with a scrape button,
           (3) request failed -> error message, (4) normal -> the current page via <Outlet /> inside the AnalysisCtx provider.
           While refetching after a filter change the page stays visible but dimmed (placeholderData keeps the old data).
        */}
        <main className="mx-auto w-full max-w-[1480px] flex-1 px-4 py-6 lg:px-8">
          {/* State selection (see the note above <main>). */}
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
