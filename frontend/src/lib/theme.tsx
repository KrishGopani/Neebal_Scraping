/**
 * Light/dark theme state and the colour palette used by charts.
 *
 * CSS colours (cards, text, borders) switch via the `dark` class on <html> (see src/index.css). Charts are drawn
 * on a <canvas> by ECharts and can't read CSS variables, so they need the same colours as plain JS values:
 * that's the `Palette` object returned by `useTheme()`. Used by src/components/Chart.tsx and every page's chart options.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

/**
 * Colours for chart text, grid lines, backgrounds and the semantic good/bad/neutral/warn colours.
 * `ours` is your store (blue) and `comp` the competitor (amber).
 */
export interface Palette {
  fg: string; muted: string; line: string; surface: string
  ours: string; comp: string; good: string; bad: string; neutral: string; warn: string; dark: boolean
}
// Light-theme chart colours (match the CSS variables in index.css).
const light: Palette = { fg: '#0f172a', muted: '#64748b', line: '#e2e8f0', surface: '#ffffff', ours: '#2563eb', comp: '#f59e0b', good: '#16a34a', bad: '#dc2626', neutral: '#94a3b8', warn: '#d97706', dark: false }
// Dark-theme chart colours: brighter hues so they stay readable on a dark background.
const dark: Palette = { fg: '#e6edf7', muted: '#8fa0ba', line: '#24304a', surface: '#111a2e', ours: '#60a5fa', comp: '#fbbf24', good: '#34d399', bad: '#f87171', neutral: '#64748b', warn: '#fbbf24', dark: true }

const Ctx = createContext<{ isDark: boolean; toggle: () => void; palette: Palette }>(null as never)

/**
 * Tracks whether dark mode is on. Starts from the class already set by the inline script in index.html,
 * applies the `dark` class to <html>, and remembers the choice in localStorage.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  // Keep <html class="dark"> and localStorage in sync with the state (storage may be blocked, hence try/catch).
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    try { localStorage.setItem('theme', isDark ? 'dark' : 'light') } catch { /* ignore */ }
  }, [isDark])
  return <Ctx.Provider value={{ isDark, toggle: () => setDark(d => !d), palette: isDark ? dark : light }}>{children}</Ctx.Provider>
}
/** Returns { isDark, toggle, palette }. */
export const useTheme = () => useContext(Ctx)
