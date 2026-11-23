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
import DataPage from './pages/Data'

const client = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 30_000 } } })

export default function App() {
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <SettingsProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Overview />} />
                <Route path="matches" element={<Matches />} />
                <Route path="pricing" element={<Pricing />} />
                <Route path="categories" element={<Categories />} />
                <Route path="actions" element={<Actions />} />
                <Route path="quality" element={<Quality />} />
                <Route path="market" element={<Market />} />
                <Route path="data" element={<DataPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </SettingsProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
