/**
 * Root component: wires together every global provider and defines the URL -> page routing table.
 *
 * Provider order matters (outermost first):
 *   QueryClientProvider  - caching/fetching of all API data (TanStack Query), used by src/lib/queries.ts
 *   ThemeProvider        - light/dark mode + chart colour palette (src/lib/theme.tsx)
 *   SettingsProvider     - the user's Filters (src/lib/settings.tsx); its values become API query parameters
 *   BrowserRouter        - client-side routing; <Layout /> renders the sidebar/header and an <Outlet /> where the
 *                          matching page from src/pages/ appears.
 *
 * The FastAPI backend serves index.html for unknown paths so deep links like /matches work after a refresh.
 */
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Layout } from './components/Layout'
import { SettingsProvider } from './lib/settings'
import { ThemeProvider } from './lib/theme'
import Overview from './pages/Overview'
import Matches from './pages/Matches'
import Pricing from './pages/Pricing'
import Categories from './pages/Categories'
import Actions from './pages/Actions'
import Quality from './pages/Quality'
import Market from './pages/Market'
import Catalogue from './pages/Catalogue'

// Shared data-cache settings:
// - refetchOnWindowFocus: false  -> switching browser tabs doesn't re-hit the API.
// - retry: 1                     -> one retry on a transient network error, then show the error state.
// - staleTime: 30s               -> navigating between pages reuses data fetched in the last 30 seconds.
const client = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 30_000 } } })

/** Renders the provider stack and the route table. Each <Route> maps a URL to one page component. */
export default function App() {
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <SettingsProvider>
          <BrowserRouter>
            <Routes>
              {/*
                 Layout route: no path of its own; it wraps every page below with the sidebar + top bar.
                 The `index` route is '/', i.e. the Overview page.
              */}
              <Route element={<Layout />}>
                <Route index element={<Overview />} />
                <Route path="matches" element={<Matches />} />
                <Route path="pricing" element={<Pricing />} />
                <Route path="categories" element={<Categories />} />
                <Route path="actions" element={<Actions />} />
                <Route path="quality" element={<Quality />} />
                <Route path="market" element={<Market />} />
                <Route path="catalogue" element={<Catalogue />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </SettingsProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
